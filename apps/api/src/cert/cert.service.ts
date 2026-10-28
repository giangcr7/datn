import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DegreeType, Prisma } from '../generated/prisma/client';
import type { AuthActor } from '../auth/auth-actor';
import {
  CLASSIFICATION_LABELS,
  classificationFrom,
  dateOnly,
  jsonData,
  lookupText,
  normalizeText,
  pagination,
  parseDateOnly,
} from '../database/data-utils';
import {
  diplomaInclude,
  diplomaProjection,
  publicDiplomaProjection,
} from '../database/diploma-projection';
import {
  diplomaPayload,
  HASH_SCHEMA_VERSION,
  payloadHash,
} from '../database/diploma-hash';
import { writeAcademicRecord } from '../database/academic-record-writer';
import { reviewedDiplomaErrors } from './reviewed-diploma';
import { isUUID } from 'class-validator';
import { PdfSignatureService } from '../signatures/pdf-signature.service';
import { DIPLOMA_PRINT_TEMPLATE } from '../database/diploma-print-data';
import type { PrintDiplomaDataDto } from '../common/dto/print-diploma.dto';
import { createDiplomaPdf } from '../signatures/pdf-signature-engine';
import { RegisterQueryDto } from './register-query.dto';
import { registerQuery } from './diploma-register';
import {
  replacementErrors,
  replacementSource,
  queueReplacementRevocation,
} from './replacement-state';

type BulkAction = 'submit' | 'approve' | 'reject';
type BulkResult = {
  uuid: string;
  success: boolean;
  status?: string;
  error?: string;
};

@Injectable()
export class CertService {
  private readonly logger = new Logger(CertService.name);
  constructor(
    private readonly database: DatabaseService,
    private readonly pdfSignatures?: PdfSignatureService,
  ) {}

  private staff(actor: AuthActor) {
    if (actor.role !== 'university')
      throw new ForbiddenException(
        'Chỉ cán bộ nhà trường được lập và xử lý hồ sơ văn bằng; admin không thay thế người duyệt',
      );
  }
  private approver(actor: AuthActor) {
    if (
      actor.role !== 'university' ||
      !actor.isHeadquarters ||
      !actor.canApproveDiplomas
    )
      throw new ForbiddenException(
        'Chỉ cán bộ được cấp quyền tại cơ sở chính được phê duyệt văn bằng',
      );
  }
  private preparer(actor: AuthActor) {
    this.approver(actor);
  }
  private scope(
    actor: AuthActor,
    originOnly = false,
  ): Prisma.DiplomaWhereInput {
    if (!actor || !['admin', 'university', 'student'].includes(actor.role))
      throw new ForbiddenException('Không có quyền đọc hồ sơ văn bằng');
    return {
      institutionId: actor.institutionId,
      ...(actor.role === 'admin' ||
      (!originOnly &&
        actor.role === 'university' &&
        actor.isHeadquarters &&
        actor.canApproveDiplomas)
        ? {}
        : actor.role === 'student'
          ? {
              graduation: {
                studentId:
                  actor.studentId || '00000000-0000-0000-0000-000000000000',
              },
            }
          : { campusId: actor.campusId }),
    };
  }
  private auditData(
    actor: AuthActor,
    action: string,
    target: string,
    ip?: string,
    metadata?: unknown,
  ) {
    return {
      actorId: actor.id,
      institutionId: actor.institutionId,
      actorEmail: actor.email,
      action,
      target,
      result: 'SUCCESS',
      ip,
      metadata: metadata === undefined ? undefined : jsonData(metadata),
    };
  }

  issue(_body?: unknown) {
    throw new ForbiddenException(
      'Luồng cấp trực tiếp đã ngừng. Hãy rà soát hồ sơ và chọn Duyệt và phát hành tại cơ sở chính.',
    );
  }

  async requestCert(body: any, actor: AuthActor, ip?: string) {
    this.preparer(actor);
    const classification = classificationFrom(body.grade);
    const year = Number(body.namTotNghiep);
    const gpa =
      body.gpa === null || body.gpa === undefined ? null : Number(body.gpa);
    if (
      !/^\d{10}$/.test(body.mssv) ||
      !normalizeText(body.fullName) ||
      !classification ||
      !Number.isInteger(year) ||
      year < 1900 ||
      year > new Date().getFullYear() ||
      (gpa !== null && (!Number.isFinite(gpa) || gpa < 0 || gpa > 4))
    )
      throw new BadRequestException(
        'MSSV, họ tên, xếp loại, năm tốt nghiệp hoặc GPA không hợp lệ',
      );
    if (!normalizeText(body.soHieu) || !normalizeText(body.soVaoSo))
      throw new BadRequestException('Cần số hiệu và số vào sổ để lập văn bằng');
    const campus = await this.database.campus.findFirst({
      where: {
        institutionId: actor.institutionId,
        code: body.org || actor.org,
        active: true,
      },
    });
    if (!campus || campus.id !== actor.campusId)
      throw new ForbiddenException('Không có quyền quản lý cơ sở này');
    const alias = await this.database.programAlias.findUnique({
      where: {
        institutionId_normalizedName: {
          institutionId: actor.institutionId,
          normalizedName: lookupText(body.major),
        },
      },
      include: { program: true },
    });
    if (!alias)
      throw new BadRequestException(
        'Ngành chưa có trong danh mục chuẩn; cần phê duyệt alias trước',
      );
    const existingStudent = await this.database.student.findUnique({
      where: {
        institutionId_studentCode: {
          institutionId: actor.institutionId,
          studentCode: body.mssv,
        },
      },
    });
    if (!existingStudent)
      throw new BadRequestException(
        'MSSV chưa có hồ sơ sinh viên; hãy nhập hoặc tạo hồ sơ trước khi lập văn bằng',
      );
    const birthDate = body.dob
      ? parseDateOnly(body.dob)
      : existingStudent?.dateOfBirth;
    const issuedOn = parseDateOnly(body.issueDate);
    if (
      !birthDate ||
      birthDate > new Date() ||
      birthDate.getUTCFullYear() >= year ||
      !issuedOn ||
      issuedOn > new Date() ||
      issuedOn < birthDate ||
      issuedOn.getUTCFullYear() < year
    )
      throw new BadRequestException(
        'Ngày sinh/ngày cấp phải được xác nhận, không ở tương lai; ngày cấp không trước ngày sinh hoặc năm tốt nghiệp',
      );
    try {
      return await this.database.$transaction(async (transaction) => {
        if (
          !Object.values(DegreeType).includes(body.degreeType) ||
          !normalizeText(body.issuePlace) ||
          !normalizeText(body.diplomaSignerName) ||
          !normalizeText(body.diplomaSignerTitle) ||
          !(normalizeText(body.majorNameEn) || alias.program?.nameEn)
        )
          throw new BadRequestException(
            'Cấp mới cần loại bằng, tên ngành tiếng Anh, nơi cấp, họ tên và chức danh người ký trên bằng',
          );
        const graduation = await writeAcademicRecord(
          transaction,
          { institutionId: actor.institutionId, campusId: campus.id },
          {
            studentCode: normalizeText(body.mssv),
            fullName: normalizeText(body.fullName),
            dateOfBirth: dateOnly(birthDate),
            programId: alias.programId,
            graduationYear: year,
            gpa,
            classification,
            degreeType: body.degreeType,
            classCode: normalizeText(body.className) || null,
          },
          undefined,
          undefined,
          { createStudent: false },
        );
        const diploma = await transaction.diploma.create({
          data: {
            institutionId: actor.institutionId,
            campusId: campus.id,
            graduationId: graduation.id,
            certificateNo: normalizeText(body.soHieu),
            registryNo: normalizeText(body.soVaoSo),
            issuedOn,
            printTemplate: DIPLOMA_PRINT_TEMPLATE,
            originType: 'ISSUANCE',
            fullNameLatin: normalizeText(body.fullNameLatin) || null,
            majorNameEn: normalizeText(body.majorNameEn) || null,
            issuePlace: normalizeText(body.issuePlace),
            diplomaSignerName: normalizeText(body.diplomaSignerName),
            diplomaSignerTitle: normalizeText(body.diplomaSignerTitle),
            workflowStatus: 'REQUESTED',
            requestedById: actor.id,
            requestedAt: new Date(),
          },
        });
        await transaction.diplomaEvent.create({
          data: {
            diplomaId: diploma.id,
            actorId: actor.id,
            eventType: 'REQUESTED',
          },
        });
        await transaction.auditLog.create({
          data: this.auditData(actor, 'REQUEST_CERT', diploma.id, ip),
        });
        return {
          success: true,
          uuid: diploma.id,
          message:
            'Đã lưu hồ sơ tại cơ sở chính; cán bộ có thể duyệt và ký phát hành',
        };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Số hiệu, số vào sổ hoặc văn bằng của hồ sơ đã tồn tại',
        );
      throw error;
    }
  }

  async submitDraft(
    uuid: string,
    issuedOn: string | undefined,
    actor: AuthActor,
  ) {
    this.approver(actor);
    if (issuedOn !== undefined)
      throw new BadRequestException(
        'Hãy xác nhận ngày cấp trong màn hình rà soát trước khi lưu hồ sơ',
      );
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM diplomas WHERE id = ${uuid}::uuid FOR UPDATE`;
      const draft = await transaction.diploma.findFirst({
        where: {
          id: uuid,
          ...this.scope(actor, true),
          status: 'DRAFT',
          workflowStatus: 'DRAFT',
        },
        include: {
          ...diplomaInclude,
          events: { where: { eventType: 'REOPENED' }, take: 1 },
        },
      });
      if (!draft)
        throw new ConflictException(
          'Không tìm thấy bản nháp trong phạm vi quyền',
        );
      if (draft.supersedesId)
        throw new ConflictException(
          'Hãy trình hồ sơ tại mục Sửa sai và thay thế',
        );
      if (draft.events?.length)
        throw new ConflictException(
          'Hồ sơ đang bổ sung sau từ chối. Hãy chọn Trình duyệt lại tại mục Hồ sơ bị từ chối',
        );
      const errors = draft.graduation.sourceRow
        ? reviewedDiplomaErrors(draft)
        : [];
      if (!draft.issuedOn || errors.length)
        throw new BadRequestException(
          errors.join('; ') || 'Cần xác nhận ngày cấp trước khi xử lý',
        );
      const changed = await transaction.diploma.updateMany({
        where: {
          id: uuid,
          ...this.scope(actor, true),
          status: 'DRAFT',
          workflowStatus: 'DRAFT',
        },
        data: {
          workflowStatus: 'REQUESTED',
          requestedById: actor.id,
          requestedAt: new Date(),
        },
      });
      if (!changed.count)
        throw new ConflictException('Hồ sơ đã được xử lý đồng thời');
      await transaction.diplomaEvent.create({
        data: { diplomaId: uuid, actorId: actor.id, eventType: 'REQUESTED' },
      });
      await transaction.auditLog.create({
        data: this.auditData(actor, 'SAVE_PENDING_DIPLOMA', uuid),
      });
      return { success: true, uuid, status: 'PENDING' };
    });
  }

  async processBulk(
    action: BulkAction,
    diplomaIds: string[],
    actor: AuthActor,
    reason?: string,
    ip?: string,
  ) {
    if (action === 'submit') this.preparer(actor);
    else this.approver(actor);
    if (
      !Array.isArray(diplomaIds) ||
      !diplomaIds.length ||
      diplomaIds.length > 100 ||
      new Set(diplomaIds).size !== diplomaIds.length ||
      diplomaIds.some(
        (uuid) =>
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            uuid,
          ),
      )
    )
      throw new BadRequestException(
        'Chọn từ 1 đến 100 UUID văn bằng khác nhau mỗi lượt',
      );
    if (action === 'reject' && (!reason?.trim() || reason.trim().length > 2000))
      throw new BadRequestException(
        'Lý do từ chối phải có từ 1 đến 2000 ký tự',
      );
    const results: BulkResult[] = [];
    for (const uuid of diplomaIds) {
      try {
        if (action === 'submit') await this.submitDraft(uuid, undefined, actor);
        else if (action === 'approve') await this.approveCert(uuid, actor, ip);
        else await this.rejectCert(uuid, reason!.trim(), actor, ip);
        results.push({
          uuid,
          success: true,
          status:
            action === 'submit'
              ? 'PENDING'
              : action === 'approve'
                ? 'ANCHOR_PENDING'
                : 'REJECTED',
        });
      } catch (error) {
        if (!(error instanceof HttpException))
          this.logger.error(
            'Bulk diploma operation failed',
            error instanceof Error ? error.stack : String(error),
          );
        results.push({
          uuid,
          success: false,
          error:
            error instanceof HttpException
              ? error.message
              : 'Không xử lý được hồ sơ; vui lòng thử lại hoặc liên hệ quản trị',
        });
      }
    }
    const succeeded = results.filter((result) => result.success).length;
    return {
      success: true,
      total: results.length,
      succeeded,
      failed: results.length - succeeded,
      results,
    };
  }

  async updatePrintData(
    uuid: string,
    body: PrintDiplomaDataDto,
    actor: AuthActor,
  ) {
    this.preparer(actor);
    if (!isUUID(uuid) || !normalizeText(body.note))
      throw new BadRequestException('Cần mã hồ sơ và ghi chú nguồn đối chiếu');
    const fields = [
      'fullNameLatin',
      'majorNameEn',
      'issuePlace',
      'diplomaSignerName',
      'diplomaSignerTitle',
    ] as const;
    const changes: Record<string, string | null> = {};
    for (const field of fields) {
      if (body[field] === undefined) continue;
      if (body[field] !== null && typeof body[field] !== 'string')
        throw new BadRequestException('Thông tin in bằng phải là văn bản');
      const value = normalizeText(body[field]);
      const maximum = ['issuePlace', 'diplomaSignerTitle'].includes(field)
        ? 120
        : 255;
      if (value.length > maximum)
        throw new BadRequestException('Thông tin in bằng quá dài');
      changes[field] = value || null;
    }
    if (
      body.degreeType !== undefined &&
      body.degreeType !== null &&
      !Object.values(DegreeType).includes(body.degreeType)
    )
      throw new BadRequestException('Loại bằng không hợp lệ');
    const issuedOn =
      body.issueDate === undefined ? undefined : parseDateOnly(body.issueDate);
    if (body.issueDate !== undefined && (!issuedOn || issuedOn > new Date()))
      throw new BadRequestException(
        'Ngày cấp phải hợp lệ và không ở tương lai',
      );
    if (
      !Object.keys(changes).length &&
      body.degreeType === undefined &&
      issuedOn === undefined
    )
      throw new BadRequestException('Chưa chọn thông tin bằng cần bổ sung');
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM diplomas WHERE id = ${uuid}::uuid FOR UPDATE`;
      const diploma = await transaction.diploma.findFirst({
        where: {
          id: uuid,
          ...this.scope(actor, true),
          workflowStatus: 'DRAFT',
          status: 'DRAFT',
        },
        include: diplomaInclude,
      });
      if (!diploma || diploma.signedDocuments.length)
        throw new ConflictException(
          'Chỉ sửa thông tin bằng nháp chưa ký, chưa gửi của cơ sở',
        );
      if (diploma.supersedesId)
        throw new ConflictException(
          'Hãy sửa riêng hồ sơ tại mục Sửa sai và thay thế',
        );
      const birthDate = diploma.graduation.student.dateOfBirth;
      if (
        issuedOn &&
        (!birthDate ||
          issuedOn < birthDate ||
          issuedOn.getUTCFullYear() < diploma.graduation.graduationYear)
      )
        throw new BadRequestException(
          'Ngày cấp không phù hợp hồ sơ tốt nghiệp',
        );
      if (body.degreeType !== undefined) {
        const signedSibling = await transaction.diploma.findFirst({
          where: {
            graduationId: diploma.graduationId,
            OR: [
              { workflowStatus: { not: 'DRAFT' } },
              { signedDocuments: { some: {} } },
            ],
          },
          select: { id: true },
        });
        if (signedSibling)
          throw new ConflictException(
            'Loại bằng đã được dùng trong hồ sơ có chữ ký; không sửa ngược',
          );
        await transaction.graduationRecord.update({
          where: { id: diploma.graduationId },
          data: { degreeType: body.degreeType },
        });
      }
      const updated = await transaction.diploma.update({
        where: { id: diploma.id },
        data: {
          ...changes,
          ...(issuedOn ? { issuedOn } : {}),
          printTemplate: DIPLOMA_PRINT_TEMPLATE,
        },
        include: diplomaInclude,
      });
      await transaction.diplomaEvent.create({
        data: {
          diplomaId: diploma.id,
          actorId: actor.id,
          eventType: 'REVIEWED_PRINT_DATA',
          metadata: jsonData({
            note: body.note,
            changes,
            degreeType: body.degreeType,
            issueDate: body.issueDate,
            previousIssueDate: dateOnly(diploma.issuedOn),
            previous: diplomaProjection(diploma).printedDiploma,
            previousDegreeType: diploma.graduation.degreeType,
          }),
        },
      });
      await transaction.auditLog.create({
        data: this.auditData(
          actor,
          'REVIEW_DIPLOMA_PRINT_DATA',
          diploma.id,
          undefined,
          {
            note: body.note,
            changes,
            degreeType: body.degreeType,
            issueDate: body.issueDate,
          },
        ),
      });
      return { success: true, data: diplomaProjection(updated) };
    });
  }

  async previewPdf(uuid: string, actor: AuthActor) {
    this.preparer(actor);
    if (!isUUID(uuid)) throw new BadRequestException('Mã hồ sơ không hợp lệ');
    const diploma = await this.database.diploma.findFirst({
      where: {
        id: uuid,
        ...this.scope(actor, true),
        OR: [
          { workflowStatus: 'DRAFT' },
          { workflowStatus: 'REQUESTED', supersedesId: { not: null } },
        ],
        status: 'DRAFT',
      },
      include: diplomaInclude,
    });
    if (!diploma)
      throw new NotFoundException(
        'Không có hồ sơ chưa phát hành trong phạm vi cơ sở',
      );
    const verifyUrl = new URL(
      '/verify',
      process.env.WEB_URL || 'http://localhost:3000',
    );
    verifyUrl.searchParams.set('proof', JSON.stringify({ uuid }));
    return createDiplomaPdf(
      diplomaPayload(diploma),
      verifyUrl.toString(),
      process.env.PDF_SIGNING_MODE !== 'certificate',
      actor.name || actor.email,
      false,
      true,
      true,
    );
  }

  async updateBulkPrintData(
    ids: string[],
    body: PrintDiplomaDataDto,
    actor: AuthActor,
  ) {
    this.preparer(actor);
    if (
      !Array.isArray(ids) ||
      !ids.length ||
      ids.length > 100 ||
      ids.some((id) => !isUUID(id)) ||
      new Set(ids).size !== ids.length
    )
      throw new BadRequestException(
        'Chọn từ 1 đến 100 mã hồ sơ không trùng nhau',
      );
    const results: BulkResult[] = [];
    for (const uuid of ids) {
      try {
        await this.updatePrintData(uuid, body, actor);
        results.push({ uuid, success: true });
      } catch (error) {
        results.push({
          uuid,
          success: false,
          error:
            error instanceof HttpException
              ? error.message
              : 'Không lưu được thông tin bằng',
        });
      }
    }
    const succeeded = results.filter((result) => result.success).length;
    return {
      success: true,
      succeeded,
      failed: results.length - succeeded,
      results,
    };
  }

  async findRequestCandidates(
    page: number,
    limit: number,
    search: string,
    batchId: string | undefined,
    actor: AuthActor,
  ) {
    this.preparer(actor);
    if (batchId && !isUUID(batchId))
      throw new BadRequestException('Mã đợt rà soát không hợp lệ');
    const paging = pagination(page, limit);
    const where: Prisma.DiplomaWhereInput = {
      AND: [this.scope(actor, true), this.searchWhere(search)],
      status: 'DRAFT',
      workflowStatus: 'DRAFT',
      graduation: {
        sourceRow: { status: 'IMPORTED', ...(batchId ? { batchId } : {}) },
      },
      events: { none: { eventType: 'REOPENED' } },
      supersedesId: null,
    };
    const [data, total] = await Promise.all([
      this.database.diploma.findMany({
        where,
        include: diplomaInclude,
        ...paging,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
      this.database.diploma.count({ where }),
    ]);
    return {
      success: true,
      data: data.map((item) => ({
        ...diplomaProjection(item),
        requestErrors: reviewedDiplomaErrors(item),
      })),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findPendingPaginated(
    page: number,
    limit: number,
    search: string,
    batchId: string | undefined,
    actor: AuthActor,
  ) {
    if (!['admin', 'university'].includes(actor.role))
      throw new ForbiddenException('Không có quyền xem hàng chờ văn bằng');
    if (batchId && !isUUID(batchId))
      throw new BadRequestException('Mã đợt rà soát không hợp lệ');
    const paging = pagination(page, limit);
    const where: Prisma.DiplomaWhereInput = {
      AND: [this.scope(actor), this.searchWhere(search)],
      workflowStatus: 'REQUESTED',
      supersedesId: null,
      ...(batchId ? { graduation: { sourceRow: { batchId } } } : {}),
    };
    const [data, total] = await Promise.all([
      this.database.diploma.findMany({
        where,
        include: diplomaInclude,
        ...paging,
        orderBy: [{ requestedAt: 'desc' }, { id: 'asc' }],
      }),
      this.database.diploma.count({ where }),
    ]);
    return {
      success: true,
      data: data.map((item) => diplomaProjection(item)),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async approveCert(
    uuid: string,
    actor: AuthActor,
    ip?: string,
    expectedUpdatedAt?: string,
    handlingNote?: string,
  ) {
    this.approver(actor);
    return this.database.$transaction(async (transaction) => {
      const authority = await transaction.campus.findFirst({
        where: {
          id: actor.campusId,
          institutionId: actor.institutionId,
          isHeadquarters: true,
          active: true,
        },
      });
      if (!authority?.fabricMspId)
        throw new BadRequestException(
          'Cơ sở chính chưa cấu hình danh tính phát hành blockchain',
        );
      await transaction.$queryRaw`SELECT parent.id FROM diplomas child JOIN diplomas parent ON parent.id = child.supersedes_id
        WHERE child.id = ${uuid}::uuid AND child.institution_id = ${actor.institutionId}::uuid AND child.campus_id = ${actor.campusId}::uuid FOR UPDATE OF parent`;
      await transaction.$queryRaw`SELECT id FROM diplomas WHERE id = ${uuid}::uuid FOR UPDATE`;
      let diploma = await transaction.diploma.findFirst({
        where: { id: uuid, ...this.scope(actor, true) },
        include: {
          ...diplomaInclude,
          events: { where: { eventType: 'REOPENED' }, take: 1 },
        },
      });
      if (!diploma)
        throw new NotFoundException(
          'Không tìm thấy văn bằng trong phạm vi quyền',
        );
      if (diploma.workflowStatus === 'DRAFT' && diploma.events?.length)
        throw new ConflictException(
          'Hồ sơ đang bổ sung sau từ chối phải được trình duyệt lại trước khi ký',
        );
      if (
        !['DRAFT', 'REQUESTED'].includes(diploma.workflowStatus) ||
        diploma.status !== 'DRAFT'
      )
        throw new ConflictException(
          'Chỉ phê duyệt hồ sơ nháp hoặc đang chờ duyệt',
        );
      if (diploma.supersedesId) {
        if (
          diploma.workflowStatus !== 'REQUESTED' ||
          !expectedUpdatedAt ||
          !handlingNote?.trim() ||
          handlingNote.trim().length > 2000 ||
          diploma.updatedAt.getTime() !== Date.parse(expectedUpdatedAt)
        )
          throw new ConflictException(
            'Phải duyệt hồ sơ thay thế đã trình, có ghi chú và dữ liệu mới nhất tại mục Sửa sai và thay thế',
          );
        if (!this.pdfSignatures)
          throw new ConflictException(
            'Chưa có dịch vụ ký PDF; không phát hành thay thế',
          );
        const errors = replacementErrors(diploma);
        const view = diplomaProjection(diploma);
        if (
          !(await transaction.program.findFirst({
            where: {
              id: view.programId,
              institutionId: actor.institutionId,
              active: true,
            },
          }))
        )
          errors.push('Ngành đào tạo không còn được sử dụng');
        if (errors.length) throw new BadRequestException(errors.join('; '));
        await replacementSource(transaction, diploma);
      } else {
        if (!diploma.graduation.classification || !diploma.issuedOn)
          throw new BadRequestException(
            'Thiếu ngày cấp hoặc xếp loại đã xác nhận',
          );
        const birthDate = diploma.graduation.student.dateOfBirth;
        if (diploma.graduation.sourceRow) {
          const errors = reviewedDiplomaErrors(diploma);
          if (errors.length) throw new BadRequestException(errors.join('; '));
        }
        if (
          !birthDate ||
          (diploma.issuedOn &&
            (diploma.issuedOn < birthDate ||
              diploma.issuedOn > new Date() ||
              diploma.issuedOn.getUTCFullYear() <
                diploma.graduation.graduationYear))
        )
          throw new BadRequestException(
            'Ngày cấp không phù hợp với hồ sơ tốt nghiệp',
          );
      }
      if (diploma.workflowStatus === 'DRAFT') {
        diploma = await transaction.diploma.update({
          where: { id: uuid },
          data: {
            workflowStatus: 'REQUESTED',
            requestedById: actor.id,
            requestedAt: new Date(),
          },
          include: {
            ...diplomaInclude,
            events: { where: { eventType: 'REOPENED' }, take: 1 },
          },
        });
        await transaction.diplomaEvent.create({
          data: { diplomaId: uuid, actorId: actor.id, eventType: 'REQUESTED' },
        });
      }
      const preparedPdf = this.pdfSignatures
        ? await this.pdfSignatures.prepareFinal(transaction, diploma, actor)
        : null;
      const payload = preparedPdf?.payload || diplomaPayload(diploma);
      if (diploma.supersedesId) {
        await queueReplacementRevocation(transaction, diploma, actor);
        await transaction.auditLog.create({
          data: this.auditData(actor, 'APPROVE_REPLACEMENT', uuid, ip, {
            note: handlingNote,
            sourceId: diploma.supersedesId,
          }),
        });
      }
      const hash = payloadHash(payload);
      const version = await transaction.diplomaVersion.create({
        data: {
          diplomaId: uuid,
          version: diploma.currentVersion,
          schemaVersion: HASH_SCHEMA_VERSION,
          payload: jsonData(payload),
          payloadHash: hash,
          createdById: actor.id,
        },
      });
      if (preparedPdf)
        await this.pdfSignatures!.attachVersion(
          transaction,
          preparedPdf,
          version.id,
        );
      const anchor = {
        uuid,
        version: version.version,
        schemaVersion: HASH_SCHEMA_VERSION,
        payloadHash: hash,
        issuerMspId: authority.fabricMspId,
        ...(diploma.supersedesId ? { replacesUuid: diploma.supersedesId } : {}),
      };
      if (!anchor.issuerMspId)
        throw new BadRequestException('Cơ sở chưa cấu hình MSP');
      await transaction.blockchainAnchor.create({
        data: {
          versionId: version.id,
          eventType: 'ISSUE',
          channel: process.env.FABRIC_CHANNEL || 'mychannel',
          chaincode: process.env.FABRIC_CHAINCODE || 'educert',
          payloadHash: hash,
          issuerMspId: anchor.issuerMspId,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          versionId: version.id,
          eventType: 'ISSUE',
          payload: jsonData(anchor),
        },
      });
      await transaction.diploma.update({
        where: { id: uuid },
        data: {
          workflowStatus: 'APPROVED',
          status: 'ACTIVE',
          approvedById: actor.id,
          approvedAt: new Date(),
          issuingCampusId: authority.id,
        },
      });
      await transaction.diplomaEvent.create({
        data: {
          diplomaId: uuid,
          actorId: actor.id,
          eventType: 'APPROVED',
          metadata: {
            versionId: version.id,
            payloadHash: hash,
            originCampusId: diploma.campusId,
            issuingCampusId: authority.id,
            issuerMspId: authority.fabricMspId,
          },
        },
      });
      await transaction.auditLog.create({
        data: this.auditData(actor, 'APPROVE_CERT', uuid, ip, {
          originCampusId: diploma.campusId,
          issuingCampusId: authority.id,
          issuerMspId: authority.fabricMspId,
        }),
      });
      return {
        success: true,
        uuid,
        hash,
        status: 'ANCHOR_PENDING',
        issuingCampusId: authority.id,
        issuerMspId: authority.fabricMspId,
        message: 'Đã phê duyệt trong database; đang chờ Fabric xác nhận',
      };
    });
  }

  signExistingRequest(_uuid: string, actor: AuthActor) {
    this.approver(actor);
    throw new ConflictException(
      'Đã bỏ bước ký cơ sở riêng; dùng Duyệt và phát hành để ký PDF một lần',
    );
  }

  async downloadPdf(uuid: string, actor: AuthActor, campusOnly = false) {
    const diploma = await this.database.diploma.findFirst({
      where: { id: uuid, ...this.scope(actor) },
      include: diplomaInclude,
    });
    if (!diploma)
      throw new NotFoundException(
        'Không tìm thấy văn bằng trong phạm vi quyền',
      );
    const document = diploma.signedDocuments[0];
    if (!document || !this.pdfSignatures)
      throw new NotFoundException(
        'Văn bằng này chưa có PDF ký số; PDF cũ không tự trở thành bản đã ký',
      );
    if (campusOnly) {
      if (actor.role !== 'university')
        throw new ForbiddenException(
          'Bản ký cơ sở chỉ phục vụ cán bộ kiểm tra',
        );
      return this.pdfSignatures.getCampusPdf(document);
    }
    if (
      diploma.status !== 'ACTIVE' ||
      diploma.workflowStatus !== 'APPROVED' ||
      diplomaProjection(diploma).status !== 'ON_CHAIN'
    )
      throw new ConflictException(
        'Chỉ tải bản phát hành sau khi đủ chữ ký và blockchain đã commit; không tải văn bằng thu hồi',
      );
    const checked = await this.pdfSignatures.verifyStored(
      document,
      diploma.versions[0].payload as Record<string, unknown>,
    );
    if (!checked.valid)
      throw new ConflictException(
        'Không thể xác minh đầy đủ chữ ký PDF; không phát hành file',
      );
    return this.pdfSignatures.getPdf(document);
  }

  async rejectCert(
    uuid: string,
    reason: string,
    actor: AuthActor,
    ip?: string,
  ) {
    this.approver(actor);
    reason = reason?.trim();
    if (!reason || reason.length > 2000)
      throw new BadRequestException(
        'Lý do từ chối phải có từ 1 đến 2000 ký tự',
      );
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM diplomas WHERE id = ${uuid}::uuid FOR UPDATE`;
      const changed = await transaction.diploma.updateMany({
        where: {
          id: uuid,
          ...this.scope(actor, true),
          workflowStatus: 'REQUESTED',
          supersedesId: null,
        },
        data: { workflowStatus: 'REJECTED' },
      });
      if (!changed.count)
        throw new ConflictException(
          'Không tìm thấy yêu cầu đang chờ trong phạm vi quyền',
        );
      await transaction.diplomaEvent.create({
        data: {
          diplomaId: uuid,
          actorId: actor.id,
          eventType: 'REJECTED',
          reason,
          createdAt: new Date(),
        },
      });
      await transaction.auditLog.create({
        data: this.auditData(actor, 'REJECT_CERT', uuid, ip, { reason }),
      });
      return { success: true, message: 'Đã từ chối yêu cầu' };
    });
  }

  async revoke(uuid: string, reason: string, actor: AuthActor, ip?: string) {
    this.approver(actor);
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM diplomas WHERE id = ${uuid}::uuid FOR UPDATE`;
      const diploma = await transaction.diploma.findFirst({
        where: { id: uuid, ...this.scope(actor) },
        include: diplomaInclude,
      });
      if (!diploma || diploma.status !== 'ACTIVE' || !diploma.versions[0])
        throw new ConflictException('Văn bằng không ở trạng thái được thu hồi');
      if (diploma.replacement)
        throw new ConflictException(
          'Văn bằng đang có hồ sơ thay thế; hãy xử lý tại mục Sửa sai và thay thế',
        );
      const version = diploma.versions[0];
      const issueAnchor = version.anchors.find(
        (item) => item.eventType === 'ISSUE',
      );
      if (!issueAnchor?.issuerMspId)
        throw new ConflictException(
          'Không tìm thấy danh tính phát hành của văn bằng',
        );
      const payload = {
        uuid,
        version: version.version,
        payloadHash: version.payloadHash,
        reasonHash: payloadHash({ reason }),
        issuerMspId: issueAnchor.issuerMspId,
      };
      await transaction.diploma.update({
        where: { id: uuid },
        data: {
          status: 'REVOKED',
          revokedReason: reason,
          revokedAt: new Date(),
        },
      });
      await transaction.blockchainAnchor.create({
        data: {
          versionId: version.id,
          eventType: 'REVOKE',
          channel: process.env.FABRIC_CHANNEL || 'mychannel',
          chaincode: process.env.FABRIC_CHAINCODE || 'educert',
          payloadHash: version.payloadHash,
          issuerMspId: issueAnchor.issuerMspId,
        },
      });
      await transaction.outboxEvent.create({
        data: {
          versionId: version.id,
          eventType: 'REVOKE',
          payload: jsonData(payload),
        },
      });
      await transaction.diplomaEvent.create({
        data: {
          diplomaId: uuid,
          eventType: 'REVOKED',
          actorId: actor.id,
          reason,
        },
      });
      await transaction.auditLog.create({
        data: this.auditData(actor, 'REVOKE_CERT', uuid, ip, { reason }),
      });
      return {
        success: true,
        message: 'Đã thu hồi trong database; yêu cầu Fabric đang chờ đồng bộ',
      };
    });
  }

  async findPending(actor: AuthActor) {
    if (!['admin', 'university'].includes(actor.role))
      throw new ForbiddenException('Không có quyền xem hàng chờ văn bằng');
    return (
      await this.database.diploma.findMany({
        where: { ...this.scope(actor), workflowStatus: 'REQUESTED' },
        include: diplomaInclude,
        orderBy: { requestedAt: 'desc' },
        take: 100,
      })
    ).map((item) => diplomaProjection(item));
  }
  private searchWhere(search: string): Prisma.DiplomaWhereInput {
    return search
      ? {
          OR: [
            { certificateNo: { contains: search, mode: 'insensitive' } },
            { registryNo: { contains: search, mode: 'insensitive' } },
            {
              graduation: {
                student: {
                  OR: [
                    { fullName: { contains: search, mode: 'insensitive' } },
                    { studentCode: { contains: search } },
                  ],
                },
              },
            },
          ],
        }
      : {};
  }
  async search(query: string, actor?: AuthActor) {
    if (!actor && process.env.PUBLIC_DIRECTORY_ENABLED !== 'true')
      throw new ForbiddenException(
        'Tra cứu theo tên/MSSV chưa được mở công khai. Vui lòng đăng nhập hoặc dùng UUID/proof để xác thực.',
      );
    if (!query || query.trim().length < 2)
      throw new BadRequestException('Nhập ít nhất 2 ký tự');
    const scope = actor
      ? this.scope(actor)
      : { status: 'ACTIVE' as const, workflowStatus: 'APPROVED' as const };
    return (
      await this.database.diploma.findMany({
        where: {
          AND: [scope, this.searchWhere(query.trim())],
          status: 'ACTIVE',
          workflowStatus: 'APPROVED',
        },
        include: diplomaInclude,
        take: 20,
      })
    ).map((item) => publicDiplomaProjection(item));
  }
  async findRegister(query: RegisterQueryDto, actor: AuthActor) {
    if (
      !actor?.institutionId ||
      !(
        actor.role === 'admin' ||
        (actor.role === 'university' &&
          actor.isHeadquarters &&
          actor.canApproveDiplomas)
      )
    )
      throw new ForbiddenException('Không có quyền xem sổ văn bằng');
    pagination(query.page, query.limit);
    if (query.issuedFrom && query.issuedTo && query.issuedFrom > query.issuedTo)
      throw new BadRequestException(
        'Ngày cấp từ phải trước hoặc bằng ngày cấp đến',
      );

    return this.database.$transaction(
      async (transaction) => {
        const [result] = await transaction.$queryRaw<
          { total: number; ids: string[] }[]
        >(registerQuery(actor.institutionId, query));
        const data = result.ids.length
          ? await transaction.diploma.findMany({
              where: { AND: [this.scope(actor), { id: { in: result.ids } }] },
              include: diplomaInclude,
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            })
          : [];
        return {
          data: data.map((item) => diplomaProjection(item, true)),
          pagination: {
            total: result.total,
            page: query.page,
            limit: query.limit,
            totalPages: Math.ceil(result.total / query.limit),
          },
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async findAllPaginated(
    page: number,
    limit: number,
    search: string,
    actor: AuthActor,
    issuedOnly = false,
  ) {
    const where: Prisma.DiplomaWhereInput = {
      AND: [
        this.scope(actor),
        this.searchWhere(search),
        ...(issuedOnly || actor.role === 'student' ? [this.issuedWhere()] : []),
      ],
    };
    const [data, total] = await Promise.all([
      this.database.diploma.findMany({
        where,
        include: diplomaInclude,
        ...pagination(page, limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.database.diploma.count({ where }),
    ]);
    return {
      data: data.map((item) => diplomaProjection(item, true)),
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }
  async findAll(actor: AuthActor) {
    return (await this.findAllPaginated(1, 100, '', actor)).data;
  }
  private issuedWhere(): Prisma.DiplomaWhereInput {
    return {
      workflowStatus: 'APPROVED',
      versions: {
        some: {
          anchors: { some: { eventType: 'ISSUE', status: 'COMMITTED' } },
        },
      },
    };
  }
  async history(uuid: string, actor: AuthActor) {
    if (!['admin', 'university'].includes(actor.role))
      throw new ForbiddenException('Không có quyền xem lịch sử văn bằng');
    if (
      !(await this.database.diploma.findFirst({
        where: { id: uuid, ...this.scope(actor) },
      }))
    )
      throw new NotFoundException();
    const history = await this.database.diplomaEvent.findMany({
      where: { diplomaId: uuid },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return {
      success: true,
      source: 'POSTGRESQL_AUDIT_EVENTS',
      history: history.map((event) => ({
        ...event,
        timestamp: event.createdAt,
        txId: (event.metadata as any)?.transactionId || null,
        isRevoked: event.eventType === 'REVOKED',
      })),
    };
  }
  async findByMssv(mssv: string, actor: AuthActor) {
    return (
      await this.database.diploma.findMany({
        where: {
          AND: [
            this.scope(actor),
            ...(actor.role === 'student' ? [this.issuedWhere()] : []),
            {
              graduation: {
                student: { studentCode: mssv },
                ...(actor.role === 'student'
                  ? {
                      studentId:
                        actor.studentId ||
                        '00000000-0000-0000-0000-000000000000',
                    }
                  : {}),
              },
            },
          ],
        },
        include: diplomaInclude,
        take: 100,
      })
    ).map((item) => diplomaProjection(item, true));
  }
  async findOne(uuid: string, actor: AuthActor) {
    const diploma = await this.database.diploma.findFirst({
      where: { id: uuid, ...this.scope(actor) },
      include: diplomaInclude,
    });
    if (!diploma) throw new NotFoundException('Không tìm thấy văn bằng');
    return diplomaProjection(diploma, true);
  }

  async statistics(actor: AuthActor) {
    const records = await this.database.diploma.findMany({
      where: this.scope(actor),
      include: {
        graduation: { include: { program: true } },
        versions: {
          include: {
            anchors: { where: { eventType: 'ISSUE', status: 'COMMITTED' } },
          },
          orderBy: { version: 'desc' },
          take: 1,
        },
      },
    });
    const active = records.filter(
      (item) => item.status === 'ACTIVE' && item.versions[0]?.anchors.length,
    );
    const countBy = (
      items: typeof records,
      key: (item: (typeof records)[number]) => string,
    ) => {
      const groups = new Map<string, number>();
      for (const item of items) {
        const name = key(item);
        groups.set(name, (groups.get(name) || 0) + 1);
      }
      return [...groups].map(([name, value]) => ({ name, value }));
    };
    const month = dateOnly(new Date())!.slice(0, 7);
    return {
      total: active.length,
      thisMonth: active.filter((item) =>
        dateOnly(item.createdAt)!.startsWith(month),
      ).length,
      totalRevoked: records.filter((item) => item.status === 'REVOKED').length,
      totalAll: records.length,
      totalDraft: records.filter((item) => item.workflowStatus === 'DRAFT')
        .length,
      totalRequested: records.filter(
        (item) => item.workflowStatus === 'REQUESTED',
      ).length,
      totalRejected: records.filter(
        (item) => item.workflowStatus === 'REJECTED',
      ).length,
      totalPendingAnchor: records.filter(
        (item) =>
          item.workflowStatus === 'APPROVED' &&
          !item.versions[0]?.anchors.length,
      ).length,
      byMajor: countBy(active, (item) => item.graduation.program.name),
      byYear: countBy(active, (item) =>
        String(item.graduation.graduationYear),
      ).map((item) => ({ year: item.name, count: item.value })),
      byGrade: countBy(active, (item) =>
        item.graduation.classification
          ? CLASSIFICATION_LABELS[item.graduation.classification]
          : 'Chưa có xếp loại',
      ),
      byMonth: countBy(active, (item) =>
        dateOnly(item.createdAt)!.slice(0, 7),
      ).map((item) => ({ month: item.name, count: item.value })),
    };
  }
}
