import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { AuthActor } from '../auth/auth-actor';
import { DatabaseService } from '../database/database.service';
import { dateOnly, jsonData } from '../database/data-utils';
import { diplomaInclude } from '../database/diploma-projection';
import { Prisma } from '../generated/prisma/client';
import { CertService } from './cert.service';
import {
  CreateIssuanceBatchDto,
  IssuanceBatchMembersDto,
  IssuanceBatchOptionsDto,
  IssuanceBatchQueryDto,
  PublishIssuanceBatchDto,
} from './issuance-batch.dto';
import {
  type BatchState,
  emptyBatchSummary,
  issuanceBatchRow,
} from './issuance-batch-state';

const batchInclude = {
  decision: true,
  program: true,
  createdBy: { select: { displayName: true } },
} satisfies Prisma.DiplomaIssuanceBatchInclude;
const checkedInclude = {
  ...diplomaInclude,
  events: { where: { eventType: 'REOPENED' }, take: 1 },
} satisfies Prisma.DiplomaInclude;
const MAX_BATCH_MEMBERS = 5000;
type Batch = Prisma.DiplomaIssuanceBatchGetPayload<{
  include: typeof batchInclude;
}>;

@Injectable()
export class IssuanceBatchService {
  private readonly logger = new Logger(IssuanceBatchService.name);
  constructor(
    private readonly database: DatabaseService,
    private readonly certificates: CertService,
  ) {}

  private scope(actor: AuthActor) {
    if (
      !actor?.id ||
      !actor.institutionId ||
      !actor.campusId ||
      actor.role !== 'university' ||
      !actor.isHeadquarters ||
      !actor.canApproveDiplomas
    )
      throw new ForbiddenException(
        'Chỉ cán bộ duyệt tại cơ sở chính được quản lý đợt cấp văn bằng',
      );
    return { institutionId: actor.institutionId, campusId: actor.campusId };
  }

  private async batch(
    transaction: Prisma.TransactionClient,
    id: string,
    actor: AuthActor,
  ) {
    const record = await transaction.diplomaIssuanceBatch.findFirst({
      where: { id, ...this.scope(actor) },
      include: batchInclude,
    });
    if (!record)
      throw new NotFoundException(
        'Không tìm thấy đợt cấp văn bằng trong phạm vi quyền',
      );
    return record;
  }

  private projection(batch: Batch) {
    return {
      id: batch.id,
      code: batch.code,
      name: batch.name,
      graduationYear: batch.graduationYear,
      decisionId: batch.decisionId,
      decisionNo: batch.decision.documentNumber,
      decisionDate: dateOnly(batch.decision.signedOn),
      programId: batch.programId,
      programName: batch.program?.name ?? null,
      createdBy: batch.createdBy.displayName,
      createdAt: batch.createdAt,
    };
  }

  private audit(
    actor: AuthActor,
    action: string,
    target: string,
    metadata: object,
    ip?: string,
  ) {
    return {
      institutionId: actor.institutionId,
      actorId: actor.id,
      actorEmail: actor.email,
      action,
      target,
      ip,
      result: 'SUCCESS',
      metadata: jsonData(metadata),
    };
  }

  private memberScope(
    batch: Batch,
    actor: AuthActor,
  ): Prisma.DiplomaWhereInput {
    return {
      ...this.scope(actor),
      supersedesId: null,
      graduation: {
        decisionId: batch.decisionId,
        graduationYear: batch.graduationYear,
        ...(batch.programId ? { programId: batch.programId } : {}),
      },
    };
  }

  async options(query: IssuanceBatchOptionsDto, actor: AuthActor) {
    const scope = this.scope(actor);
    const decisions = await this.database.graduationDecision.findMany({
      where: {
        institutionId: scope.institutionId,
        ...(query.search
          ? { documentNumber: { contains: query.search, mode: 'insensitive' } }
          : {}),
        graduations: { some: { diplomas: { some: scope } } },
      },
      select: {
        id: true,
        documentNumber: true,
        decisionYear: true,
        signedOn: true,
        graduations: {
          where: { diplomas: { some: scope } },
          distinct: ['graduationYear'],
          select: { graduationYear: true },
        },
      },
      take: 100,
      orderBy: [
        { decisionYear: 'desc' },
        { documentNumber: 'asc' },
        { id: 'asc' },
      ],
    });
    const programs = await this.database.program.findMany({
      where: { institutionId: scope.institutionId, active: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
    return {
      success: true,
      decisions: decisions.map((decision) => ({
        id: decision.id,
        documentNumber: decision.documentNumber,
        decisionYear: decision.decisionYear,
        signedOn: dateOnly(decision.signedOn),
        graduationYears: decision.graduations
          .map((record) => record.graduationYear)
          .sort((first, second) => second - first),
      })),
      programs,
    };
  }

  async create(body: CreateIssuanceBatchDto, actor: AuthActor, ip?: string) {
    const scope = this.scope(actor);
    if (body.graduationYear > new Date().getUTCFullYear())
      throw new BadRequestException(
        'Không lập đợt cho năm tốt nghiệp ở tương lai',
      );
    try {
      return await this.database.$transaction(async (transaction) => {
        const decision = await transaction.graduationDecision.findFirst({
          where: { id: body.decisionId, institutionId: scope.institutionId },
        });
        if (!decision)
          throw new BadRequestException('Quyết định không thuộc nhà trường');
        if (!decision.signedOn)
          throw new BadRequestException(
            'Cần xác nhận ngày ký quyết định trong dữ liệu nguồn trước khi lập đợt',
          );
        if (decision.signedOn > new Date())
          throw new BadRequestException(
            'Ngày ký quyết định không được ở tương lai',
          );
        if (
          body.programId &&
          !(await transaction.program.findFirst({
            where: {
              id: body.programId,
              institutionId: scope.institutionId,
              active: true,
            },
          }))
        )
          throw new BadRequestException(
            'Ngành không thuộc nhà trường hoặc đã ngừng sử dụng',
          );
        if (
          !(await transaction.graduationRecord.findFirst({
            where: {
              institutionId: scope.institutionId,
              decisionId: body.decisionId,
              graduationYear: body.graduationYear,
              ...(body.programId ? { programId: body.programId } : {}),
              diplomas: { some: scope },
            },
            select: { id: true },
          }))
        )
          throw new BadRequestException(
            'Chưa có hồ sơ phù hợp quyết định, năm tốt nghiệp và ngành đã chọn',
          );
        const batch = await transaction.diplomaIssuanceBatch.create({
          data: {
            ...scope,
            code: body.code,
            name: body.name,
            decisionId: body.decisionId,
            programId: body.programId || null,
            graduationYear: body.graduationYear,
            createdById: actor.id,
          },
          include: batchInclude,
        });
        await transaction.auditLog.create({
          data: this.audit(
            actor,
            'CREATE_ISSUANCE_BATCH',
            batch.id,
            {
              code: batch.code,
              decisionId: batch.decisionId,
              graduationYear: batch.graduationYear,
              programId: batch.programId,
            },
            ip,
          ),
        });
        return { success: true, data: this.projection(batch) };
      });
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002')
        throw new ConflictException(
          'Mã đợt cấp văn bằng đã tồn tại trong nhà trường',
        );
      throw error;
    }
  }

  async list(query: IssuanceBatchQueryDto, actor: AuthActor) {
    const scope = this.scope(actor);
    return this.database.$transaction(
      async (transaction) => {
        const where: Prisma.DiplomaIssuanceBatchWhereInput = {
          ...scope,
          ...(query.search
            ? {
                OR: [
                  { code: { contains: query.search, mode: 'insensitive' } },
                  { name: { contains: query.search, mode: 'insensitive' } },
                  {
                    decision: {
                      documentNumber: {
                        contains: query.search,
                        mode: 'insensitive',
                      },
                    },
                  },
                ],
              }
            : {}),
        };
        const total = await transaction.diplomaIssuanceBatch.count({ where });
        const batches = await transaction.diplomaIssuanceBatch.findMany({
          where,
          include: batchInclude,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        });
        const counts = batches.length
          ? await transaction.$queryRaw<
              { batchId: string; state: BatchState; total: number }[]
            >(Prisma.sql`
        SELECT d.issuance_batch_id AS "batchId", CASE
          WHEN d.status = 'REVOKED' THEN 'REVOKED' WHEN d.status = 'SUPERSEDED' THEN 'REPLACED'
          WHEN d.workflow_status = 'REJECTED' THEN 'REJECTED' WHEN d.workflow_status = 'DRAFT' THEN 'DRAFT'
          WHEN d.workflow_status = 'APPROVED' AND a.status = 'COMMITTED' THEN 'ON_CHAIN'
          WHEN d.workflow_status = 'APPROVED' AND a.status = 'FAILED' THEN 'ANCHOR_FAILED'
          WHEN d.workflow_status = 'APPROVED' THEN 'ANCHOR_PENDING' ELSE 'PENDING' END AS state, COUNT(*)::int AS total
        FROM diplomas d LEFT JOIN diploma_versions v ON v.diploma_id = d.id AND v.version = d.current_version
        LEFT JOIN blockchain_anchors a ON a.version_id = v.id AND a.event_type = 'ISSUE'
        WHERE d.institution_id = ${scope.institutionId}::uuid AND d.campus_id = ${scope.campusId}::uuid
          AND d.issuance_batch_id IN (${Prisma.join(batches.map((batch) => Prisma.sql`${batch.id}::uuid`))})
        GROUP BY d.issuance_batch_id, state
      `)
          : [];
        return {
          success: true,
          data: batches.map((batch) => {
            const summary = emptyBatchSummary();
            for (const count of counts.filter(
              (entry) => entry.batchId === batch.id,
            )) {
              summary[count.state] = count.total;
              summary.total += count.total;
            }
            return { ...this.projection(batch), summary };
          }),
          pagination: {
            total,
            page: query.page,
            limit: query.limit,
            totalPages: Math.ceil(total / query.limit),
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async detail(id: string, query: IssuanceBatchQueryDto, actor: AuthActor) {
    this.scope(actor);
    return this.database.$transaction(
      async (transaction) => {
        const batch = await this.batch(transaction, id, actor);
        const records = await transaction.diploma.findMany({
          where: { ...this.scope(actor), issuanceBatchId: id },
          include: checkedInclude,
          take: MAX_BATCH_MEMBERS + 1,
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        });
        if (records.length > MAX_BATCH_MEMBERS)
          throw new BadRequestException(
            'Đợt vượt giới hạn 5.000 hồ sơ; cần chia thành các đợt nhỏ',
          );
        const rows = records.map(issuanceBatchRow);
        const summary = { ...emptyBatchSummary(), ready: 0, needsReview: 0 };
        for (const row of rows) {
          summary.total++;
          summary[row.batchState]++;
          if (row.ready) summary.ready++;
          if (row.checkErrors.length) summary.needsReview++;
        }
        const search = query.search?.toLocaleLowerCase('vi-VN');
        const filtered = rows.filter(
          (row) =>
            (!search ||
              [row.fullName, row.mssv, row.soHieu, row.soVaoSo].some((value) =>
                value.toLocaleLowerCase('vi-VN').includes(search),
              )) &&
            (!query.status ||
              (query.status === 'READY'
                ? row.ready
                : query.status === 'NEEDS_REVIEW'
                  ? row.checkErrors.length > 0
                  : row.batchState === query.status)),
        );
        const total = filtered.length;
        return {
          success: true,
          batch: this.projection(batch),
          summary,
          checkedAt: new Date().toISOString(),
          data: filtered.slice(
            (query.page - 1) * query.limit,
            query.page * query.limit,
          ),
          pagination: {
            total,
            page: query.page,
            limit: query.limit,
            totalPages: Math.ceil(total / query.limit),
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async candidates(id: string, query: IssuanceBatchQueryDto, actor: AuthActor) {
    this.scope(actor);
    return this.database.$transaction(
      async (transaction) => {
        const batch = await this.batch(transaction, id, actor);
        const where: Prisma.DiplomaWhereInput = {
          ...this.memberScope(batch, actor),
          issuanceBatchId: null,
          status: 'DRAFT',
          workflowStatus: 'DRAFT',
          signedDocuments: { none: {} },
          versions: { none: {} },
          events: { none: { eventType: 'REOPENED' } },
          ...(query.search
            ? {
                OR: [
                  {
                    certificateNo: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                  {
                    registryNo: { contains: query.search, mode: 'insensitive' },
                  },
                  {
                    graduation: {
                      student: {
                        fullName: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                    },
                  },
                  {
                    graduation: {
                      student: {
                        studentCode: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                    },
                  },
                ],
              }
            : {}),
        };
        const [records, total] = await Promise.all([
          transaction.diploma.findMany({
            where,
            include: checkedInclude,
            skip: (query.page - 1) * query.limit,
            take: query.limit,
            orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          }),
          transaction.diploma.count({ where }),
        ]);
        return {
          success: true,
          data: records.map(issuanceBatchRow),
          pagination: {
            total,
            page: query.page,
            limit: query.limit,
            totalPages: Math.ceil(total / query.limit),
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async changeMembers(
    id: string,
    body: IssuanceBatchMembersDto,
    adding: boolean,
    actor: AuthActor,
    ip?: string,
  ) {
    const scope = this.scope(actor);
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM diploma_issuance_batches WHERE id = ${id}::uuid AND institution_id = ${scope.institutionId}::uuid AND campus_id = ${scope.campusId}::uuid FOR UPDATE`;
      const batch = await this.batch(transaction, id, actor);
      const ids = [...body.diplomaIds].sort();
      await transaction.$queryRaw(Prisma.sql`SELECT id FROM diplomas WHERE id IN (${Prisma.join(ids.map((uuid) => Prisma.sql`${uuid}::uuid`))})
        AND institution_id = ${scope.institutionId}::uuid AND campus_id = ${scope.campusId}::uuid ORDER BY id FOR UPDATE`);
      const where: Prisma.DiplomaWhereInput = {
        ...this.memberScope(batch, actor),
        id: { in: ids },
        issuanceBatchId: adding ? null : id,
        status: 'DRAFT',
        workflowStatus: 'DRAFT',
        signedDocuments: { none: {} },
        versions: { none: {} },
        ...(adding ? { events: { none: { eventType: 'REOPENED' } } } : {}),
      };
      if ((await transaction.diploma.count({ where })) !== ids.length)
        throw new ConflictException(
          'Có hồ sơ đã thay đổi, đã thuộc đợt khác hoặc không phù hợp. Chỉ thêm/gỡ bản nháp chưa ký, đúng quyết định, năm và ngành; hãy tải lại danh sách.',
        );
      if (
        adding &&
        (await transaction.diploma.count({ where: { issuanceBatchId: id } })) +
          ids.length >
          MAX_BATCH_MEMBERS
      )
        throw new BadRequestException(
          'Mỗi đợt tối đa 5.000 hồ sơ; hãy lập đợt khác',
        );
      await transaction.diploma.updateMany({
        where,
        data: { issuanceBatchId: adding ? id : null },
      });
      await transaction.auditLog.create({
        data: this.audit(
          actor,
          adding
            ? 'ADD_ISSUANCE_BATCH_MEMBERS'
            : 'REMOVE_ISSUANCE_BATCH_MEMBERS',
          id,
          { diplomaIds: ids, count: ids.length },
          ip,
        ),
      });
      return { success: true, changed: ids.length };
    });
  }

  async publish(
    id: string,
    body: PublishIssuanceBatchDto,
    actor: AuthActor,
    ip?: string,
  ) {
    this.scope(actor);
    await this.batch(this.database, id, actor);
    const results: {
      uuid: string;
      success: boolean;
      status?: string;
      error?: string;
    }[] = [];
    for (const entry of body.entries) {
      try {
        const record = await this.database.diploma.findFirst({
          where: {
            ...this.scope(actor),
            id: entry.uuid,
            issuanceBatchId: id,
            supersedesId: null,
          },
          include: checkedInclude,
        });
        if (!record)
          throw new ConflictException(
            'Hồ sơ không còn thuộc đợt cấp văn bằng này',
          );
        const checked = issuanceBatchRow(record);
        if (!checked.ready)
          throw new ConflictException(
            checked.checkErrors.join('; ') ||
              'Hồ sơ không còn ở trạng thái được duyệt',
          );
        await this.certificates.approveCert(
          entry.uuid,
          actor,
          ip,
          undefined,
          undefined,
          {
            id,
            updatedAt: entry.expectedUpdatedAt,
            reviewToken: entry.expectedReviewToken,
          },
        );
        results.push({
          uuid: entry.uuid,
          success: true,
          status: 'ANCHOR_PENDING',
        });
      } catch (error) {
        if (!(error instanceof HttpException))
          this.logger.error(
            'Issuance batch publish failed',
            error instanceof Error ? error.stack : String(error),
          );
        results.push({
          uuid: entry.uuid,
          success: false,
          error:
            error instanceof HttpException
              ? error.message
              : 'Không xử lý được hồ sơ; hãy tải lại và kiểm tra trạng thái trước khi thử lại',
        });
      }
    }
    const succeeded = results.filter((entry) => entry.success).length;
    return {
      success: true,
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    };
  }
}
