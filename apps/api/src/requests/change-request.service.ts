import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthActor } from '../auth/auth-actor';
import { DatabaseService } from '../database/database.service';
import { jsonData, parseDateOnly } from '../database/data-utils';
import { Prisma } from '../generated/prisma/client';
import {
  ChangeRequestActionDto,
  ChangeRequestQueryDto,
  CreateChangeRequestDto,
} from './change-request.dto';
import { assertRequestTransition, requestScope } from './change-request-state';

const requestInclude = {
  diploma: {
    select: {
      id: true,
      certificateNo: true,
      registryNo: true,
      graduation: {
        select: { student: { select: { fullName: true, studentCode: true } } },
      },
      replacement: {
        select: {
          id: true,
          certificateNo: true,
          status: true,
          workflowStatus: true,
        },
      },
    },
  },
  events: {
    orderBy: { revision: 'asc' as const },
    select: {
      id: true,
      actorId: true,
      status: true,
      note: true,
      revision: true,
      createdAt: true,
    },
  },
} satisfies Prisma.DiplomaChangeRequestInclude;

@Injectable()
export class ChangeRequestService {
  constructor(private readonly database: DatabaseService) {}

  private scope(actor: AuthActor): Prisma.DiplomaChangeRequestWhereInput {
    const kind = requestScope(actor);
    return {
      ...(kind === 'student' ? { requesterId: actor.id } : {}),
      diploma: {
        institutionId: actor.institutionId,
        ...(kind === 'student'
          ? { graduation: { studentId: actor.studentId! } }
          : { campusId: actor.campusId }),
      },
    };
  }

  private view(
    record: Prisma.DiplomaChangeRequestGetPayload<{
      include: typeof requestInclude;
    }>,
  ) {
    return {
      id: record.id,
      diplomaId: record.diplomaId,
      status: record.status,
      certificateNo: record.diploma.certificateNo,
      registryNo: record.diploma.registryNo,
      studentName: record.diploma.graduation.student.fullName,
      studentCode: record.diploma.graduation.student.studentCode,
      changes: record.changes,
      reason: record.reason,
      revision: record.revision,
      resolvedDiplomaId: record.resolvedDiplomaId,
      replacement: record.diploma.replacement,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      events: record.events.map(({ actorId, ...event }) => ({
        ...event,
        actorLabel: actorId === record.requesterId ? 'Sinh viên' : 'Nhà trường',
      })),
    };
  }

  async list(query: ChangeRequestQueryDto, actor: AuthActor) {
    const where = {
      ...this.scope(actor),
      ...(query.status ? { status: query.status } : {}),
    };
    return this.database.$transaction(
      async (transaction) => {
        const total = await transaction.diplomaChangeRequest.count({ where });
        const records = await transaction.diplomaChangeRequest.findMany({
          where,
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          include: requestInclude,
        });
        return {
          data: records.map((record) => this.view(record)),
          total,
          page: query.page,
          limit: query.limit,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async eligible(actor: AuthActor) {
    if (requestScope(actor) !== 'student')
      throw new BadRequestException('Chức năng này dành cho sinh viên');
    const records = await this.database.diploma.findMany({
      where: {
        institutionId: actor.institutionId,
        graduation: { studentId: actor.studentId! },
        status: 'ACTIVE',
        workflowStatus: 'APPROVED',
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          include: { anchors: true },
        },
        changeRequests: {
          where: {
            status: { in: ['PENDING', 'IN_REVIEW', 'NEEDS_INFORMATION'] },
          },
          select: { id: true },
        },
      },
    });
    return {
      data: records
        .filter(
          (record) =>
            record.versions[0]?.anchors.some(
              (anchor) =>
                anchor.eventType === 'ISSUE' && anchor.status === 'COMMITTED',
            ) &&
            !record.versions[0]?.anchors.some(
              (anchor) => anchor.eventType === 'REVOKE',
            ),
        )
        .map((record) => ({
          id: record.id,
          certificateNo: record.certificateNo,
          registryNo: record.registryNo,
          current: record.versions[0].payload,
          activeRequestId: record.changeRequests[0]?.id || null,
        })),
    };
  }

  private async event(
    transaction: Prisma.TransactionClient,
    request: { id: string; revision: number; status: string },
    actor: AuthActor,
    note: string,
    ip?: string,
    changes?: unknown,
  ) {
    await transaction.diplomaChangeRequestEvent.create({
      data: {
        requestId: request.id,
        actorId: actor.id,
        revision: request.revision,
        status: request.status,
        note,
      },
    });
    await transaction.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'DIPLOMA_CHANGE_REQUEST',
        target: request.id,
        result: 'SUCCESS',
        ip,
        metadata: jsonData({
          status: request.status,
          revision: request.revision,
          ...(changes === undefined ? {} : { changes }),
        }),
      },
    });
  }

  async create(body: CreateChangeRequestDto, actor: AuthActor, ip?: string) {
    if (requestScope(actor) !== 'student')
      throw new BadRequestException('Chỉ sinh viên được gửi yêu cầu');
    try {
      return await this.database.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT d.id FROM diplomas d JOIN graduation_records g ON g.id = d.graduation_id
          WHERE d.id = ${body.diplomaId}::uuid AND d.institution_id = ${actor.institutionId}::uuid
            AND g.student_id = ${actor.studentId}::uuid FOR UPDATE OF d`;
        const diploma = await transaction.diploma.findFirst({
          where: {
            id: body.diplomaId,
            institutionId: actor.institutionId,
            graduation: { studentId: actor.studentId! },
          },
          include: {
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              include: { anchors: true },
            },
          },
        });
        if (!diploma)
          throw new NotFoundException(
            'Không tìm thấy văn bằng thuộc quyền quản lý',
          );
        const version = diploma.versions[0];
        if (
          diploma.status !== 'ACTIVE' ||
          diploma.workflowStatus !== 'APPROVED' ||
          !version?.anchors.some(
            (anchor) =>
              anchor.eventType === 'ISSUE' && anchor.status === 'COMMITTED',
          ) ||
          version.anchors.some((anchor) => anchor.eventType === 'REVOKE')
        )
          throw new ConflictException(
            'Chỉ tiếp nhận yêu cầu cho văn bằng đã phát hành và còn hiệu lực',
          );
        const original = version.payload as Record<string, unknown>;
        const changes = body.changes.map((change) => {
          const value = change.value.trim().normalize('NFC');
          if (change.field === 'dob') {
            const date = parseDateOnly(value);
            if (
              !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
              !date ||
              date.toISOString().slice(0, 10) !== value ||
              date.getUTCFullYear() < 1900 ||
              date > new Date()
            )
              throw new BadRequestException(
                'Ngày sinh phải hợp lệ, dạng YYYY-MM-DD',
              );
          }
          const before =
            typeof original[change.field] === 'string'
              ? (original[change.field] as string)
              : null;
          if (value === (before || '').trim().normalize('NFC'))
            throw new BadRequestException(
              'Thông tin đề nghị phải khác thông tin hiện tại',
            );
          return {
            field: change.field,
            before,
            after: value,
          };
        });
        const record = await transaction.diplomaChangeRequest.create({
          data: {
            diplomaId: diploma.id,
            requesterId: actor.id,
            changes: jsonData(changes),
            reason: body.reason.trim(),
          },
        });
        await this.event(
          transaction,
          record,
          actor,
          body.reason.trim(),
          ip,
          changes,
        );
        return this.view(
          await transaction.diplomaChangeRequest.findUniqueOrThrow({
            where: { id: record.id },
            include: requestInclude,
          }),
        );
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Văn bằng đã có yêu cầu đang xử lý');
      throw error;
    }
  }

  async act(
    id: string,
    body: ChangeRequestActionDto,
    actor: AuthActor,
    ip?: string,
  ) {
    const where = this.scope(actor);
    return this.database.$transaction(async (transaction) => {
      const visible = await transaction.diplomaChangeRequest.findFirst({
        where: { ...where, id },
        select: { id: true },
      });
      if (!visible) throw new NotFoundException('Không tìm thấy yêu cầu');
      await transaction.$queryRaw`SELECT id FROM diploma_change_requests WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await transaction.diplomaChangeRequest.findFirstOrThrow({
        where: { ...where, id },
      });
      if (current.revision !== body.expectedRevision)
        throw new ConflictException(
          'Yêu cầu đã thay đổi. Vui lòng tải lại trước khi xử lý.',
        );
      assertRequestTransition(
        current.status,
        body.status,
        actor.role === 'student',
      );
      if (body.status !== 'RESOLVED' && body.resolvedDiplomaId)
        throw new BadRequestException('Chỉ liên kết văn bằng khi hoàn tất');
      if (body.status === 'RESOLVED') {
        if (!body.resolvedDiplomaId)
          throw new BadRequestException(
            'Cần văn bằng thay thế đã được blockchain xác nhận',
          );
        await transaction.$queryRaw`SELECT id FROM diplomas WHERE id = ${body.resolvedDiplomaId}::uuid FOR UPDATE`;
        const replacement = await transaction.diploma.findFirst({
          where: {
            id: body.resolvedDiplomaId,
            supersedesId: current.diplomaId,
            institutionId: actor.institutionId,
            campusId: actor.campusId,
            status: 'ACTIVE',
            workflowStatus: 'APPROVED',
          },
          include: {
            supersedes: {
              select: {
                status: true,
                versions: {
                  orderBy: { version: 'desc' },
                  take: 1,
                  include: { anchors: true },
                },
              },
            },
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
              include: { anchors: true },
            },
          },
        });
        const anchors = replacement?.versions[0]?.anchors || [];
        if (
          !replacement ||
          replacement.supersedes?.status !== 'SUPERSEDED' ||
          !replacement.supersedes.versions[0]?.anchors.some(
            (anchor) =>
              anchor.eventType === 'REVOKE' && anchor.status === 'COMMITTED',
          ) ||
          !anchors.some(
            (anchor) =>
              anchor.eventType === 'ISSUE' && anchor.status === 'COMMITTED',
          ) ||
          anchors.some((anchor) => anchor.eventType === 'REVOKE')
        )
          throw new ConflictException(
            'Cần xác nhận blockchain cho cả văn bằng thay thế và thu hồi bản cũ',
          );
      }
      const updated = await transaction.diplomaChangeRequest.update({
        where: { id },
        data: {
          status: body.status,
          revision: { increment: 1 },
          resolvedDiplomaId:
            body.status === 'RESOLVED' ? body.resolvedDiplomaId : null,
        },
      });
      await this.event(
        transaction,
        updated,
        actor,
        body.note,
        ip,
        current.changes,
      );
      return this.view(
        await transaction.diplomaChangeRequest.findUniqueOrThrow({
          where: { id },
          include: requestInclude,
        }),
      );
    });
  }
}
