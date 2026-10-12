import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { Prisma } from '../generated/prisma/client';
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

@Injectable()
export class CertService {
  constructor(private readonly database: DatabaseService) {}

  private staff(actor: AuthActor) {
    if (!['university', 'admin'].includes(actor.role))
      throw new ForbiddenException('Chỉ cán bộ được quản lý văn bằng');
  }
  private scope(actor: AuthActor): Prisma.DiplomaWhereInput {
    if (!actor || !['admin', 'university', 'student'].includes(actor.role))
      throw new ForbiddenException('Không có quyền đọc hồ sơ văn bằng');
    return {
      institutionId: actor.institutionId,
      ...(actor.role === 'admin'
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
      'Luồng cấp trực tiếp đã ngừng. Hãy lập yêu cầu và phê duyệt bởi cán bộ khác.',
    );
  }

  async requestCert(body: any, actor: AuthActor, ip?: string) {
    this.staff(actor);
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
      },
    });
    if (!campus || (actor.role !== 'admin' && campus.id !== actor.campusId))
      throw new ForbiddenException('Không có quyền quản lý cơ sở này');
    const alias = await this.database.programAlias.findUnique({
      where: {
        institutionId_normalizedName: {
          institutionId: actor.institutionId,
          normalizedName: lookupText(body.major),
        },
      },
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
    const birthDate = body.dob
      ? parseDateOnly(body.dob)
      : existingStudent?.dateOfBirth;
    const issuedOn = parseDateOnly(body.issueDate);
    if (
      !birthDate ||
      birthDate > new Date() ||
      birthDate.getUTCFullYear() >= year ||
      !issuedOn ||
      issuedOn > new Date()
    )
      throw new BadRequestException(
        'Cần ngày sinh và ngày cấp đã được xác nhận, không ở tương lai',
      );
    try {
      return await this.database.$transaction(async (transaction) => {
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
            classCode: normalizeText(body.className) || null,
          },
        );
        const diploma = await transaction.diploma.create({
          data: {
            institutionId: actor.institutionId,
            campusId: campus.id,
            graduationId: graduation.id,
            certificateNo: normalizeText(body.soHieu),
            registryNo: normalizeText(body.soVaoSo),
            issuedOn,
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
          message: 'Yêu cầu đã lưu; cần cán bộ khác phê duyệt',
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

  async submitDraft(uuid: string, issuedOn: string, actor: AuthActor) {
    this.staff(actor);
    const date = parseDateOnly(issuedOn);
    if (!date || date > new Date())
      throw new BadRequestException(
        'Ngày cấp phải được xác nhận từ hồ sơ và không ở tương lai',
      );
    return this.database.$transaction(async (transaction) => {
      const changed = await transaction.diploma.updateMany({
        where: {
          id: uuid,
          ...this.scope(actor),
          status: 'DRAFT',
          workflowStatus: 'DRAFT',
        },
        data: {
          issuedOn: date,
          workflowStatus: 'REQUESTED',
          requestedById: actor.id,
          requestedAt: new Date(),
        },
      });
      if (!changed.count)
        throw new ConflictException(
          'Không tìm thấy bản nháp thuộc phạm vi quyền',
        );
      await transaction.diplomaEvent.create({
        data: { diplomaId: uuid, eventType: 'REQUESTED', actorId: actor.id },
      });
      await transaction.auditLog.create({
        data: this.auditData(actor, 'SUBMIT_IMPORTED_DIPLOMA', uuid),
      });
      return { success: true, uuid, status: 'PENDING' };
    });
  }

  async approveCert(uuid: string, actor: AuthActor, ip?: string) {
    this.staff(actor);
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM diplomas WHERE id = ${uuid}::uuid FOR UPDATE`;
      const diploma = await transaction.diploma.findFirst({
        where: { id: uuid, ...this.scope(actor) },
        include: diplomaInclude,
      });
      if (!diploma)
        throw new NotFoundException(
          'Không tìm thấy văn bằng trong phạm vi quyền',
        );
      if (diploma.workflowStatus !== 'REQUESTED')
        throw new ConflictException('Chỉ phê duyệt yêu cầu đang chờ');
      if (diploma.requestedById === actor.id)
        throw new ForbiddenException(
          'Người lập yêu cầu không được tự phê duyệt',
        );
      if (!diploma.issuedOn || !diploma.graduation.classification)
        throw new BadRequestException(
          'Thiếu ngày cấp hoặc xếp loại đã xác nhận',
        );
      const payload = diplomaPayload(diploma);
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
      const anchor = {
        uuid,
        version: version.version,
        schemaVersion: HASH_SCHEMA_VERSION,
        payloadHash: hash,
        issuerMspId: diploma.campus.fabricMspId,
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
        },
      });
      await transaction.diplomaEvent.create({
        data: {
          diplomaId: uuid,
          actorId: actor.id,
          eventType: 'APPROVED',
          metadata: { versionId: version.id, payloadHash: hash },
        },
      });
      await transaction.auditLog.create({
        data: this.auditData(actor, 'APPROVE_CERT', uuid, ip),
      });
      return {
        success: true,
        uuid,
        hash,
        status: 'ANCHOR_PENDING',
        message: 'Đã phê duyệt trong database; đang chờ Fabric xác nhận',
      };
    });
  }

  async rejectCert(
    uuid: string,
    reason: string,
    actor: AuthActor,
    ip?: string,
  ) {
    this.staff(actor);
    return this.database.$transaction(async (transaction) => {
      const changed = await transaction.diploma.updateMany({
        where: { id: uuid, ...this.scope(actor), workflowStatus: 'REQUESTED' },
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
        },
      });
      await transaction.auditLog.create({
        data: this.auditData(actor, 'REJECT_CERT', uuid, ip, { reason }),
      });
      return { success: true, message: 'Đã từ chối yêu cầu' };
    });
  }

  async revoke(uuid: string, reason: string, actor: AuthActor, ip?: string) {
    this.staff(actor);
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM diplomas WHERE id = ${uuid}::uuid FOR UPDATE`;
      const diploma = await transaction.diploma.findFirst({
        where: { id: uuid, ...this.scope(actor) },
        include: diplomaInclude,
      });
      if (!diploma || diploma.status !== 'ACTIVE' || !diploma.versions[0])
        throw new ConflictException('Văn bằng không ở trạng thái được thu hồi');
      const version = diploma.versions[0];
      const payload = {
        uuid,
        version: version.version,
        payloadHash: version.payloadHash,
        reasonHash: payloadHash({ reason }),
        issuerMspId: diploma.campus.fabricMspId,
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
          issuerMspId: diploma.campus.fabricMspId,
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
    this.staff(actor);
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
  async findAllPaginated(
    page: number,
    limit: number,
    search: string,
    actor: AuthActor,
  ) {
    const where: Prisma.DiplomaWhereInput = {
      AND: [this.scope(actor), this.searchWhere(search)],
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
  async history(uuid: string, actor: AuthActor) {
    this.staff(actor);
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
