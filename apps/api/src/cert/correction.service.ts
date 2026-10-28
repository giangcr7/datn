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
  type DiplomaWithRelations,
} from '../database/diploma-projection';
import {
  classificationFrom,
  dateOnly,
  jsonData,
  normalizeText,
  pagination,
  parseDateOnly,
} from '../database/data-utils';
import { DIPLOMA_PRINT_TEMPLATE } from '../database/diploma-print-data';
import { Prisma } from '../generated/prisma/client';
import {
  CorrectionActionDto,
  CorrectionEditDto,
  CorrectionQueryDto,
} from './correction.dto';
import { reviewedDiplomaErrors } from './reviewed-diploma';

const rejectionInclude = {
  ...diplomaInclude,
  events: {
    where: { eventType: 'REJECTED' },
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    take: 1,
    include: { actor: { select: { displayName: true } } },
  },
} satisfies Prisma.DiplomaInclude;

function correctionErrors(record: DiplomaWithRelations) {
  const projection = diplomaProjection(record);
  const graduation = record.graduation;
  const birthDate = graduation.student.dateOfBirth;
  const now = new Date();
  const errors = graduation.sourceRow ? reviewedDiplomaErrors(record) : [];
  if (!graduation.classification) errors.push('Chưa xác nhận xếp loại');
  if (
    !birthDate ||
    birthDate > now ||
    birthDate.getUTCFullYear() >= graduation.graduationYear
  )
    errors.push('Ngày sinh không phù hợp năm tốt nghiệp');
  if (
    !record.issuedOn ||
    record.issuedOn > now ||
    (birthDate && record.issuedOn < birthDate) ||
    record.issuedOn.getUTCFullYear() < graduation.graduationYear
  )
    errors.push('Ngày cấp chưa được xác nhận hoặc không phù hợp hồ sơ');
  if (graduation.graduationYear > now.getUTCFullYear())
    errors.push('Năm tốt nghiệp không được ở tương lai');
  if (!graduation.program.active) errors.push('Ngành đào tạo đã ngừng sử dụng');
  if (
    graduation.gpa !== null &&
    (Number(graduation.gpa) < 0 || Number(graduation.gpa) > graduation.gpaScale)
  )
    errors.push('Điểm trung bình không phù hợp thang điểm');
  if (!record.certificateNo.trim() || !record.registryNo.trim())
    errors.push('Thiếu số hiệu hoặc số vào sổ');
  if (!record.printTemplate)
    errors.push('Hồ sơ chưa có mẫu in; cần lưu lại thông tin bổ sung');
  errors.push(...projection.printWarnings);
  return [...new Set(errors)];
}

@Injectable()
export class CorrectionService {
  constructor(private readonly database: DatabaseService) {}

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
        'Chỉ cán bộ cơ sở chính được xử lý hồ sơ bị từ chối',
      );
    return { institutionId: actor.institutionId, campusId: actor.campusId };
  }

  async list(query: CorrectionQueryDto, actor: AuthActor) {
    const scope = this.scope(actor);
    const where: Prisma.DiplomaWhereInput = {
      ...scope,
      status: 'DRAFT',
      workflowStatus: query.stage,
      supersedesId: null,
      ...(query.stage === 'DRAFT'
        ? { events: { some: { eventType: 'REOPENED' } } }
        : {}),
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
            ],
          }
        : {}),
    };
    return this.database.$transaction(
      async (transaction) => {
        const rows = await transaction.diploma.findMany({
          where,
          include: rejectionInclude,
          ...pagination(query.page, query.limit),
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        });
        const total = await transaction.diploma.count({ where });
        return {
          success: true,
          data: rows.map((record) => {
            const rejection = record.events[0];
            return {
              ...diplomaProjection(record),
              correctionErrors: correctionErrors(record),
              blockedReason:
                record.signedDocuments.length || record.versions.length
                  ? 'Hồ sơ đã có bản ký hoặc phiên bản bất biến; không được mở lại/chỉnh sửa'
                  : null,
              rejection: rejection
                ? {
                    id: rejection.id,
                    reason: rejection.reason,
                    rejectedAt: rejection.createdAt,
                    rejectedBy: rejection.actor?.displayName || null,
                  }
                : null,
            };
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

  private async locked(
    transaction: Prisma.TransactionClient,
    uuid: string,
    actor: AuthActor,
    body: CorrectionActionDto,
    stage: 'REJECTED' | 'DRAFT',
  ) {
    const scope = this.scope(actor);
    const note = normalizeText(body.note);
    if (
      !note ||
      note.length > 2000 ||
      !Number.isFinite(Date.parse(body.expectedUpdatedAt))
    )
      throw new BadRequestException(
        'Cần ghi chú đối soát và thời điểm cập nhật hợp lệ',
      );
    const [source] = await transaction.$queryRaw<
      { sourceRowId: string | null }[]
    >`
      SELECT graduation.source_row_id AS "sourceRowId" FROM diplomas diploma
      JOIN graduation_records graduation ON graduation.id = diploma.graduation_id
      WHERE diploma.id = ${uuid}::uuid AND diploma.institution_id = ${scope.institutionId}::uuid
        AND diploma.campus_id = ${scope.campusId}::uuid`;
    if (!source)
      throw new NotFoundException('Không tìm thấy hồ sơ trong phạm vi quyền');
    if (source.sourceRowId)
      await transaction.$queryRaw`SELECT id FROM import_rows WHERE id = ${source.sourceRowId}::uuid FOR UPDATE`;
    await transaction.$queryRaw`SELECT id FROM diplomas WHERE id = ${uuid}::uuid FOR UPDATE`;
    const record = await transaction.diploma.findFirst({
      where: { id: uuid, ...scope },
      include: rejectionInclude,
    });
    if (!record)
      throw new NotFoundException('Không tìm thấy hồ sơ trong phạm vi quyền');
    if (record.updatedAt.getTime() !== Date.parse(body.expectedUpdatedAt))
      throw new ConflictException(
        'Hồ sơ đã thay đổi. Hãy tải lại trước khi tiếp tục',
      );
    if (
      record.status !== 'DRAFT' ||
      !!record.supersedesId ||
      record.workflowStatus !== stage ||
      record.signedDocuments.length ||
      record.versions.length
    )
      throw new ConflictException(
        'Chỉ xử lý hồ sơ chưa ký, chưa phát hành và đúng trạng thái',
      );
    if (
      stage === 'DRAFT' &&
      !(await transaction.diplomaEvent.findFirst({
        where: { diplomaId: uuid, eventType: 'REOPENED' },
      }))
    )
      throw new ConflictException(
        'Hồ sơ không thuộc danh sách bổ sung sau từ chối',
      );
    if (
      record.graduation.sourceRow &&
      record.graduation.sourceRow.status !== 'IMPORTED'
    )
      throw new ConflictException('Dữ liệu nguồn chưa hoàn tất kiểm tra');
    return record;
  }

  private async log(
    transaction: Prisma.TransactionClient,
    uuid: string,
    actor: AuthActor,
    eventType: string,
    action: string,
    note: string,
    metadata: unknown,
    ip?: string,
  ) {
    await transaction.diplomaEvent.create({
      data: {
        diplomaId: uuid,
        actorId: actor.id,
        eventType,
        reason: normalizeText(note),
        metadata: jsonData(metadata),
        createdAt: new Date(),
      },
    });
    await transaction.auditLog.create({
      data: {
        actorId: actor.id,
        institutionId: actor.institutionId,
        actorEmail: actor.email,
        action,
        target: uuid,
        result: 'SUCCESS',
        ip,
        metadata: jsonData({
          note: normalizeText(note),
          ...(metadata as object),
        }),
      },
    });
  }

  async reopen(
    uuid: string,
    body: CorrectionActionDto,
    actor: AuthActor,
    ip?: string,
  ) {
    this.scope(actor);
    return this.database.$transaction(async (transaction) => {
      const record = await this.locked(
        transaction,
        uuid,
        actor,
        body,
        'REJECTED',
      );
      await transaction.diploma.update({
        where: { id: uuid },
        data: {
          workflowStatus: 'DRAFT',
          requestedById: null,
          requestedAt: null,
        },
      });
      await this.log(
        transaction,
        uuid,
        actor,
        'REOPENED',
        'REOPEN_REJECTED_DIPLOMA',
        body.note,
        {
          rejectionEventId: record.events[0]?.id || null,
          from: 'REJECTED',
          to: 'DRAFT',
        },
        ip,
      );
      return { success: true, uuid, status: 'DRAFT' };
    });
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
          actor,
          body,
          'DRAFT',
        );
        const before = diplomaProjection(record);
        const graduation = record.graduation;
        await transaction.$queryRaw`SELECT id FROM graduation_records WHERE id = ${graduation.id}::uuid FOR UPDATE`;
        await transaction.$queryRaw`SELECT id FROM students WHERE id = ${graduation.studentId}::uuid FOR UPDATE`;
        const fullName = normalizeText(body.fullName);
        const dob = parseDateOnly(body.dob);
        const issuedOn = parseDateOnly(body.issueDate);
        const classification = classificationFrom(body.grade);
        if (
          !fullName ||
          !classification ||
          !dob ||
          !issuedOn ||
          !Number.isInteger(body.namTotNghiep) ||
          body.namTotNghiep < 1900 ||
          body.namTotNghiep > new Date().getUTCFullYear() ||
          dob > new Date() ||
          dob.getUTCFullYear() >= body.namTotNghiep ||
          issuedOn < dob ||
          issuedOn > new Date() ||
          issuedOn.getUTCFullYear() < body.namTotNghiep
        )
          throw new BadRequestException(
            'Thông tin sinh viên, xếp loại, ngày sinh/ngày cấp hoặc năm tốt nghiệp không hợp lệ',
          );
        const program = await transaction.program.findFirst({
          where: {
            id: body.programId,
            institutionId: actor.institutionId,
            active: true,
          },
        });
        if (!program)
          throw new BadRequestException(
            'Ngành phải thuộc danh mục đang sử dụng của nhà trường',
          );
        const gpa = body.gpa ?? null;
        if (
          gpa !== null &&
          (!Number.isFinite(gpa) || gpa < 0 || gpa > graduation.gpaScale)
        )
          throw new BadRequestException(
            'Điểm trung bình không phù hợp thang điểm',
          );
        if (
          fullName !== graduation.student.fullName ||
          dateOnly(dob) !== dateOnly(graduation.student.dateOfBirth)
        ) {
          if (
            await transaction.graduationRecord.findFirst({
              where: {
                studentId: graduation.studentId,
                id: { not: graduation.id },
              },
            })
          )
            throw new ConflictException(
              'Thông tin sinh viên đang dùng ở hồ sơ khác; cần đối soát riêng, không sửa lan sang hồ sơ khác',
            );
          await transaction.student.update({
            where: { id: graduation.studentId },
            data: { fullName, dateOfBirth: dob },
          });
        }
        if (
          await transaction.diploma.findFirst({
            where: { graduationId: graduation.id, id: { not: uuid } },
          })
        )
          throw new ConflictException(
            'Kết quả tốt nghiệp đang liên kết văn bằng khác; không sửa dữ liệu dùng chung tại đây',
          );
        const classCode = normalizeText(body.className);
        const academicClass = classCode
          ? await transaction.academicClass.upsert({
              where: {
                campusId_code: { campusId: actor.campusId, code: classCode },
              },
              update: {},
              create: { campusId: actor.campusId, code: classCode },
            })
          : null;
        let enrollment = await transaction.enrollment.findFirst({
          where: {
            studentId: graduation.studentId,
            programId: program.id,
            campusId: actor.campusId,
            classId: academicClass?.id || null,
          },
        });
        enrollment ??= await transaction.enrollment.create({
          data: {
            studentId: graduation.studentId,
            programId: program.id,
            campusId: actor.campusId,
            classId: academicClass?.id || null,
          },
        });
        const printData = {
          fullNameLatin: normalizeText(body.fullNameLatin) || null,
          majorNameEn: normalizeText(body.majorNameEn),
          issuePlace: normalizeText(body.issuePlace),
          diplomaSignerName: normalizeText(body.diplomaSignerName),
          diplomaSignerTitle: normalizeText(body.diplomaSignerTitle),
        };
        if (
          Object.entries(printData).some(
            ([key, value]) => key !== 'fullNameLatin' && !value,
          ) ||
          !normalizeText(body.soHieu) ||
          !normalizeText(body.soVaoSo)
        )
          throw new BadRequestException(
            'Thiếu số hiệu, số vào sổ hoặc thông tin in văn bằng',
          );
        await transaction.graduationRecord.update({
          where: { id: graduation.id },
          data: {
            programId: program.id,
            graduationYear: body.namTotNghiep,
            classification,
            degreeType: body.degreeType,
            gpa,
            enrollmentId: enrollment.id,
          },
        });
        await transaction.diploma.update({
          where: { id: uuid },
          data: {
            certificateNo: normalizeText(body.soHieu),
            registryNo: normalizeText(body.soVaoSo),
            issuedOn,
            printTemplate: DIPLOMA_PRINT_TEMPLATE,
            ...printData,
          },
        });
        const source = graduation.sourceRow;
        if (source)
          await transaction.importRow.update({
            where: { id: source.id },
            data: {
              overrides: jsonData({
                ...(source.overrides as object),
                fullName,
                dateOfBirth: dateOnly(dob),
                programId: program.id,
                programOriginal: program.name,
                graduationYear: body.namTotNghiep,
                classification,
                degreeType: body.degreeType,
                gpa,
                classCode: classCode || null,
                certificateNo: normalizeText(body.soHieu),
                registryNo: normalizeText(body.soVaoSo),
                issuedOn: dateOnly(issuedOn),
                ...printData,
              }),
              reviewedById: actor.id,
              reviewedAt: new Date(),
            },
          });
        const revised = await transaction.diploma.findFirstOrThrow({
          where: { id: uuid },
          include: diplomaInclude,
        });
        const errors = correctionErrors(revised);
        if (errors.length) throw new BadRequestException(errors.join('; '));
        const after = diplomaProjection(revised);
        const changes = Object.keys(before).filter(
          (key) =>
            JSON.stringify(before[key as keyof typeof before]) !==
            JSON.stringify(after[key as keyof typeof after]),
        );
        await this.log(
          transaction,
          uuid,
          actor,
          'CORRECTED',
          'CORRECT_REJECTED_DIPLOMA',
          body.note,
          {
            rejectionEventId: record.events[0]?.id || null,
            changes,
            before,
            after,
          },
          ip,
        );
        return { success: true, uuid, status: 'DRAFT' };
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Số hiệu, số vào sổ hoặc hồ sơ tốt nghiệp đã tồn tại. Hãy kiểm tra lại',
        );
      throw error;
    }
  }

  async resubmit(
    uuid: string,
    body: CorrectionActionDto,
    actor: AuthActor,
    ip?: string,
  ) {
    this.scope(actor);
    return this.database.$transaction(async (transaction) => {
      const record = await this.locked(transaction, uuid, actor, body, 'DRAFT');
      const errors = correctionErrors(record);
      if (errors.length) throw new BadRequestException(errors.join('; '));
      await transaction.diploma.update({
        where: { id: uuid },
        data: {
          workflowStatus: 'REQUESTED',
          requestedById: actor.id,
          requestedAt: new Date(),
        },
      });
      await this.log(
        transaction,
        uuid,
        actor,
        'RESUBMITTED',
        'RESUBMIT_REJECTED_DIPLOMA',
        body.note,
        {
          rejectionEventId: record.events[0]?.id || null,
          from: 'DRAFT',
          to: 'REQUESTED',
        },
        ip,
      );
      return { success: true, uuid, status: 'PENDING' };
    });
  }
}
