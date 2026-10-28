import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthActor } from '../auth/auth-actor';
import { DatabaseService } from '../database/database.service';
import {
  diplomaInclude,
  diplomaProjection,
} from '../database/diploma-projection';
import {
  CLASSIFICATION_LABELS,
  classificationFrom,
  jsonData,
  normalizeText,
  pagination,
  parseDateOnly,
} from '../database/data-utils';
import { DIPLOMA_PRINT_TEMPLATE } from '../database/diploma-print-data';
import { replacementData } from '../database/replacement-data';
import { Prisma } from '../generated/prisma/client';
import { CorrectionActionDto, CorrectionEditDto } from './correction.dto';
import { CreateReplacementDto, ReplacementQueryDto } from './replacement.dto';
import { replacementErrors, replacementSource } from './replacement-state';
import { CertService } from './cert.service';

@Injectable()
export class ReplacementService {
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
        'Chỉ cán bộ cơ sở chính có quyền sửa sai và phát hành thay thế',
      );
    return { institutionId: actor.institutionId, campusId: actor.campusId };
  }

  private note(body: CorrectionActionDto) {
    const note = normalizeText(body.note);
    if (
      !note ||
      note.length > 2000 ||
      !Number.isFinite(Date.parse(body.expectedUpdatedAt))
    )
      throw new BadRequestException(
        'Cần ghi căn cứ xử lý và thời điểm cập nhật hợp lệ',
      );
    return note;
  }

  private async log(
    transaction: Prisma.TransactionClient,
    actor: AuthActor,
    uuid: string,
    eventType: string,
    note: string,
    metadata: unknown,
    ip?: string,
  ) {
    await transaction.diplomaEvent.create({
      data: {
        diplomaId: uuid,
        actorId: actor.id,
        eventType,
        reason: note,
        metadata: jsonData(metadata),
        createdAt: new Date(),
      },
    });
    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        institutionId: actor.institutionId,
        actorEmail: actor.email,
        action: eventType,
        target: uuid,
        result: 'SUCCESS',
        ip,
        metadata: jsonData({ note, ...(metadata as object) }),
      },
    });
  }

  private async locked(
    transaction: Prisma.TransactionClient,
    uuid: string,
    body: CorrectionActionDto,
    actor: AuthActor,
    stage: string,
  ) {
    const scope = this.scope(actor);
    this.note(body);
    await transaction.$queryRaw`SELECT parent.id FROM diplomas child JOIN diplomas parent ON parent.id = child.supersedes_id
      WHERE child.id = ${uuid}::uuid AND child.institution_id = ${scope.institutionId}::uuid AND child.campus_id = ${scope.campusId}::uuid FOR UPDATE OF parent`;
    await transaction.$queryRaw`SELECT id FROM diplomas WHERE id = ${uuid}::uuid FOR UPDATE`;
    const record = await transaction.diploma.findFirst({
      where: { id: uuid, ...scope, supersedesId: { not: null } },
      include: diplomaInclude,
    });
    if (!record)
      throw new NotFoundException(
        'Không tìm thấy hồ sơ thay thế trong phạm vi quyền',
      );
    if (record.updatedAt.getTime() !== Date.parse(body.expectedUpdatedAt))
      throw new ConflictException(
        'Hồ sơ đã thay đổi. Hãy tải lại trước khi xử lý',
      );
    if (
      record.status !== 'DRAFT' ||
      record.workflowStatus !== stage ||
      record.versions.length ||
      record.signedDocuments.length
    )
      throw new ConflictException(
        'Chỉ xử lý hồ sơ thay thế chưa ký và đúng trạng thái',
      );
    await replacementSource(transaction, record);
    return record;
  }

  async list(query: ReplacementQueryDto, actor: AuthActor) {
    const where: Prisma.DiplomaWhereInput = {
      ...this.scope(actor),
      supersedesId: { not: null },
      workflowStatus: query.stage,
      ...(query.search
        ? {
            OR: [
              {
                certificateNo: { contains: query.search, mode: 'insensitive' },
              },
              { registryNo: { contains: query.search, mode: 'insensitive' } },
              {
                graduation: {
                  student: {
                    OR: [
                      {
                        fullName: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                      {
                        studentCode: {
                          contains: query.search,
                          mode: 'insensitive',
                        },
                      },
                    ],
                  },
                },
              },
              {
                replacementData: {
                  path: ['fullName'],
                  string_contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
    };
    return this.database.$transaction(
      async (transaction) => {
        const records = await transaction.diploma.findMany({
          where,
          include: {
            ...diplomaInclude,
            supersedes: { include: diplomaInclude },
            events: {
              where: { eventType: 'REJECT_REPLACEMENT' },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          ...pagination(query.page, query.limit),
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        });
        const total = await transaction.diploma.count({ where });
        return {
          success: true,
          data: records.map((record) => ({
            ...diplomaProjection(record),
            previous: record.supersedes
              ? diplomaProjection(record.supersedes)
              : null,
            rejection: record.events[0]
              ? { reason: record.events[0].reason }
              : null,
            correctionErrors: replacementErrors(record),
            blockedReason: null,
          })),
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

  async create(
    uuid: string,
    body: CreateReplacementDto,
    actor: AuthActor,
    ip?: string,
  ) {
    const scope = this.scope(actor);
    const note = this.note(body);
    const basis = normalizeText(body.basis);
    const certificateNo = normalizeText(body.soHieu);
    const registryNo = normalizeText(body.soVaoSo);
    const issuedOn = parseDateOnly(body.issueDate);
    if (
      !basis ||
      basis.length > 2000 ||
      !certificateNo ||
      !registryNo ||
      !issuedOn ||
      issuedOn > new Date()
    )
      throw new BadRequestException(
        'Cần căn cứ thay thế, số hiệu/số vào sổ mới và ngày cấp hợp lệ',
      );
    try {
      return await this.database.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM diplomas WHERE id = ${uuid}::uuid FOR UPDATE`;
        const source = await transaction.diploma.findFirst({
          where: { id: uuid, ...scope },
          include: diplomaInclude,
        });
        if (!source)
          throw new NotFoundException(
            'Không tìm thấy văn bằng gốc trong phạm vi quyền',
          );
        if (source.updatedAt.getTime() !== Date.parse(body.expectedUpdatedAt))
          throw new ConflictException('Văn bằng đã thay đổi. Hãy làm mới sổ');
        const version = source.versions[0];
        if (
          source.status !== 'ACTIVE' ||
          source.workflowStatus !== 'APPROVED' ||
          !version?.anchors.some(
            (anchor) =>
              anchor.eventType === 'ISSUE' && anchor.status === 'COMMITTED',
          ) ||
          version.anchors.some((anchor) => anchor.eventType === 'REVOKE') ||
          source.replacement
        )
          throw new ConflictException(
            'Chỉ lập thay thế cho văn bằng còn hiệu lực, đã ghi blockchain và chưa có hồ sơ thay thế',
          );
        const view = diplomaProjection(source);
        if (
          certificateNo === source.certificateNo ||
          registryNo === source.registryNo ||
          issuedOn.getUTCFullYear() < view.namTotNghiep ||
          (source.issuedOn && issuedOn < source.issuedOn)
        )
          throw new BadRequestException(
            'Dùng số hiệu/số vào sổ mới; ngày cấp thay thế không được trước văn bằng gốc hoặc năm tốt nghiệp',
          );
        const printed = view.printedDiploma;
        const record = await transaction.diploma.create({
          data: {
            ...scope,
            graduationId: source.graduationId,
            supersedesId: source.id,
            certificateNo,
            registryNo,
            issuedOn,
            originType: 'ISSUANCE',
            printTemplate: DIPLOMA_PRINT_TEMPLATE,
            fullNameLatin: printed?.fullNameLatin,
            majorNameEn: printed?.majorNameEn,
            issuePlace: printed?.issuePlace,
            diplomaSignerName: printed?.diplomaSignerName,
            diplomaSignerTitle: printed?.diplomaSignerTitle,
            replacementData: jsonData({
              previousUuid: source.id,
              previousVersion: version.version,
              previousPayloadHash: version.payloadHash,
              reason: note,
              basis,
              mssv: view.mssv,
              decisionNo: view.decisionNo,
              decisionDate: view.decisionDate,
              signerName: view.signerName,
              fullName: view.fullName,
              dob: view.dob,
              programId: view.programId,
              major: view.major,
              gpa: view.gpa,
              gpaScale: view.gpaScale,
              grade: view.grade,
              degreeType: view.degreeType,
              className: view.className,
              namTotNghiep: view.namTotNghiep,
            }),
          },
        });
        await this.log(
          transaction,
          actor,
          record.id,
          'CREATE_REPLACEMENT',
          note,
          { sourceId: source.id, sourceHash: version.payloadHash, basis },
          ip,
        );
        await transaction.diplomaEvent.create({
          data: {
            diplomaId: source.id,
            actorId: actor.id,
            eventType: 'REPLACEMENT_REQUESTED',
            reason: note,
            metadata: { replacementId: record.id, basis },
            createdAt: new Date(),
          },
        });
        return { success: true, uuid: record.id, status: 'DRAFT' };
      });
    } catch (error) {
      this.uniqueConflict(error);
    }
  }

  private uniqueConflict(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    )
      throw new ConflictException(
        'Đã có hồ sơ thay thế hoặc số hiệu/số vào sổ này đã được sử dụng',
      );
    throw error;
  }

  async revise(
    uuid: string,
    body: CorrectionEditDto,
    actor: AuthActor,
    ip?: string,
  ) {
    this.scope(actor);
    try {
      return await this.database.$transaction(async (transaction) => {
        const record = await this.locked(
          transaction,
          uuid,
          body,
          actor,
          'DRAFT',
        );
        const previous = replacementData(record.replacementData)!;
        const program = await transaction.program.findFirst({
          where: {
            id: body.programId,
            institutionId: actor.institutionId,
            active: true,
          },
        });
        const classification = classificationFrom(body.grade);
        if (
          !program ||
          !classification ||
          !parseDateOnly(body.dob) ||
          !parseDateOnly(body.issueDate)
        )
          throw new BadRequestException(
            'Ngành, xếp loại hoặc ngày tháng chưa hợp lệ',
          );
        const before = diplomaProjection(record);
        const changes = {
          certificateNo: normalizeText(body.soHieu),
          registryNo: normalizeText(body.soVaoSo),
          issuedOn: parseDateOnly(body.issueDate),
          fullNameLatin: normalizeText(body.fullNameLatin) || null,
          majorNameEn: normalizeText(body.majorNameEn),
          issuePlace: normalizeText(body.issuePlace),
          diplomaSignerName: normalizeText(body.diplomaSignerName),
          diplomaSignerTitle: normalizeText(body.diplomaSignerTitle),
          replacementData: jsonData({
            ...previous,
            fullName: normalizeText(body.fullName),
            dob: body.dob,
            programId: program.id,
            major: program.name,
            gpa: body.gpa ?? null,
            grade: CLASSIFICATION_LABELS[classification],
            degreeType: body.degreeType,
            className: normalizeText(body.className) || null,
            namTotNghiep: body.namTotNghiep,
          }),
        };
        const candidate = {
          ...record,
          ...changes,
          replacementData: changes.replacementData as Prisma.JsonObject,
        };
        const validationErrors = replacementErrors(candidate);
        if (validationErrors.length)
          throw new BadRequestException(validationErrors.join('; '));
        await replacementSource(transaction, candidate);
        const updated = await transaction.diploma.update({
          where: { id: uuid },
          data: changes,
          include: diplomaInclude,
        });
        const errors = replacementErrors(updated);
        if (errors.length) throw new BadRequestException(errors.join('; '));
        await replacementSource(transaction, updated);
        await this.log(
          transaction,
          actor,
          uuid,
          'EDIT_REPLACEMENT',
          this.note(body),
          {
            before,
            after: diplomaProjection(updated),
            sourceId: previous.previousUuid,
          },
          ip,
        );
        return { success: true, uuid, status: 'DRAFT' };
      });
    } catch (error) {
      this.uniqueConflict(error);
    }
  }

  async transition(
    uuid: string,
    body: CorrectionActionDto,
    actor: AuthActor,
    action: 'submit' | 'reopen' | 'reject',
    ip?: string,
  ) {
    this.scope(actor);
    return this.database.$transaction(async (transaction) => {
      const from =
        action === 'submit'
          ? 'DRAFT'
          : action === 'reopen'
            ? 'REJECTED'
            : 'REQUESTED';
      const to =
        action === 'submit'
          ? 'REQUESTED'
          : action === 'reopen'
            ? 'DRAFT'
            : 'REJECTED';
      const record = await this.locked(transaction, uuid, body, actor, from);
      if (action === 'submit') {
        const errors = replacementErrors(record);
        const data = replacementData(record.replacementData)!;
        if (
          !(await transaction.program.findFirst({
            where: {
              id: data.programId,
              institutionId: actor.institutionId,
              active: true,
            },
          }))
        )
          errors.push('Ngành đào tạo không còn được sử dụng');
        if (errors.length) throw new BadRequestException(errors.join('; '));
      }
      await transaction.diploma.update({
        where: { id: uuid },
        data: {
          workflowStatus: to,
          ...(action === 'submit'
            ? { requestedById: actor.id, requestedAt: new Date() }
            : action === 'reopen'
              ? { requestedById: null, requestedAt: null }
              : {}),
        },
      });
      await this.log(
        transaction,
        actor,
        uuid,
        action === 'submit'
          ? 'SUBMIT_REPLACEMENT'
          : action === 'reopen'
            ? 'REOPEN_REPLACEMENT'
            : 'REJECT_REPLACEMENT',
        this.note(body),
        { from, to, sourceId: record.supersedesId },
        ip,
      );
      return { success: true, uuid, status: to };
    });
  }

  approve(
    uuid: string,
    body: CorrectionActionDto,
    actor: AuthActor,
    ip?: string,
  ) {
    this.scope(actor);
    return this.certificates.approveCert(
      uuid,
      actor,
      ip,
      body.expectedUpdatedAt,
      this.note(body),
    );
  }
}
