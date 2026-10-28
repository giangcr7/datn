import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import ExcelJS from 'exceljs';
import { DatabaseService } from '../database/database.service';
import { pagination, normalizeText } from '../database/data-utils';
import type { AuthActor } from '../auth/auth-actor';
import { Prisma } from '../generated/prisma/client';

@Injectable()
export class StudentsService {
  constructor(private readonly database: DatabaseService) {}
  private staff(actor: AuthActor) {
    if (!['admin', 'university'].includes(actor.role))
      throw new ForbiddenException('Chỉ cán bộ được quản lý sinh viên');
  }

  async findAll(page: number, limit: number, search: string, actor: AuthActor) {
    this.staff(actor);
    const where: Prisma.StudentWhereInput = {
      institutionId: actor.institutionId,
      ...(actor.role !== 'admin'
        ? {
            OR: [
              { enrollments: { some: { campusId: actor.campusId } } },
              {
                account: {
                  memberships: { some: { campusId: actor.campusId } },
                },
              },
            ],
          }
        : {}),
      ...(search
        ? {
            AND: [
              {
                OR: [
                  { fullName: { contains: search, mode: 'insensitive' } },
                  { studentCode: { contains: search } },
                  { contactEmail: { contains: search, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
    };
    const [students, total] = await Promise.all([
      this.database.student.findMany({
        where,
        include: {
          account: { select: { id: true, mustChangePassword: true } },
        },
        ...pagination(page, limit),
        orderBy: { createdAt: 'desc' },
      }),
      this.database.student.count({ where }),
    ]);
    return {
      success: true,
      data: students.map((student) => ({
        id: student.id,
        accountId: student.account?.id || null,
        name: student.fullName,
        email: student.contactEmail,
        studentId: student.studentCode,
        dob: student.dateOfBirth?.toISOString().slice(0, 10) || null,
        hasPassword: !!student.account && !student.account.mustChangePassword,
        createdAt: student.createdAt.toISOString(),
      })),
      total,
    };
  }

  async create(
    name: string,
    email: string,
    studentCode: string,
    actor: AuthActor,
    options: { skipExisting?: boolean } = {},
  ) {
    this.staff(actor);
    email = email.trim().toLowerCase();
    name = normalizeText(name);
    if (!/^\d{10}$/.test(studentCode) || !name || !email.includes('@'))
      throw new BadRequestException('MSSV, họ tên hoặc email không hợp lệ');
    let created: boolean;
    try {
      created = await this.database.$transaction(async (transaction) => {
        const existing = await transaction.student.findUnique({
          where: {
            institutionId_studentCode: {
              institutionId: actor.institutionId,
              studentCode,
            },
          },
          include: {
            account: {
              select: {
                email: true,
                memberships: {
                  where: {
                    campusId: actor.campusId,
                    role: 'STUDENT',
                    active: true,
                  },
                  select: { id: true },
                },
              },
            },
          },
        });
        if (existing && existing.fullName !== name)
          throw new ConflictException('Họ tên không khớp với MSSV đã có');
        if (
          existing &&
          actor.role !== 'admin' &&
          !existing.account?.memberships.length &&
          !(await transaction.enrollment.findFirst({
            where: { studentId: existing.id, campusId: actor.campusId },
          }))
        )
          throw new ForbiddenException(
            'Sinh viên không thuộc cơ sở của cán bộ',
          );
        if (
          existing?.contactEmail &&
          existing.contactEmail.toLowerCase() !== email
        )
          throw new ConflictException(
            'Email khác hồ sơ đã có; cần xác nhận trước khi tạo tài khoản',
          );
        if (existing?.account) {
          if (existing.account.email.toLowerCase() !== email)
            throw new ConflictException('Email khác tài khoản sinh viên đã có');
          if (options.skipExisting) return false;
          throw new ConflictException('Tài khoản sinh viên đã tồn tại');
        }
        const student =
          existing ||
          (await transaction.student.create({
            data: {
              institutionId: actor.institutionId,
              fullName: name,
              studentCode,
              contactEmail: email,
            },
          }));
        const account = await transaction.account.create({
          data: {
            studentId: student.id,
            email,
            displayName: name,
            // OTP activation sets the real bcrypt hash; this marker cannot authenticate.
            passwordHash: '!pending-activation!' + randomBytes(32).toString('hex'),
            mustChangePassword: true,
          },
        });
        if (existing && !existing.contactEmail)
          await transaction.student.update({
            where: { id: student.id },
            data: { contactEmail: email },
          });
        await transaction.accountMembership.create({
          data: {
            accountId: account.id,
            campusId: actor.campusId,
            role: 'STUDENT',
          },
        });
        await transaction.auditLog.create({
          data: {
            institutionId: actor.institutionId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'CREATE_STUDENT',
            target: student.id,
            result: 'SUCCESS',
          },
        });
        return true;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Email hoặc tài khoản sinh viên đã tồn tại',
        );
      throw error;
    }
    return { success: true, created };
  }

  async importFromExcel(fileName: string, fileData: string, actor: AuthActor) {
    this.staff(actor);
    if (
      !fileName.toLowerCase().endsWith('.xlsx') ||
      fileData.length > 7 * 1024 * 1024
    )
      throw new BadRequestException('Chỉ nhận .xlsx, tối đa 5 MB');
    const buffer = Buffer.from(fileData, 'base64');
    if (
      buffer.length > 5 * 1024 * 1024 ||
      buffer[0] !== 0x50 ||
      buffer[1] !== 0x4b
    )
      throw new BadRequestException('File Excel không hợp lệ');
    const workbook = new ExcelJS.Workbook();
    try {
      await workbook.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException('Không thể đọc Excel');
    }
    const sheet = workbook.worksheets.find((item) => item.state === 'visible');
    if (!sheet || sheet.rowCount > 1001)
      throw new BadRequestException('Tối đa 1000 sinh viên/lần import');
    const headers = new Map<string, number>();
    sheet
      .getRow(1)
      .eachCell((cell, index) =>
        headers.set(normalizeText(cell.text).toLowerCase(), index),
      );
    const codeCol = headers.get('mssv') || headers.get('mã sinh viên');
    const nameCol = headers.get('họ và tên') || headers.get('name');
    const emailCol = headers.get('email');
    if (!codeCol || !nameCol || !emailCol)
      throw new BadRequestException(
        'Mẫu tài khoản cần MSSV, Họ và tên, Email. Sổ gốc văn bằng phải dùng /imports/registry.',
      );
    let created = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber);
      if (
        !row.getCell(codeCol).text &&
        !row.getCell(nameCol).text &&
        !row.getCell(emailCol).text
      )
        continue;
      try {
        const result = await this.create(
          row.getCell(nameCol).text,
          row.getCell(emailCol).text,
          row.getCell(codeCol).text,
          actor,
          { skipExisting: true },
        );
        if (result.created) created++;
        else skipped++;
      } catch (error) {
        errors.push({
          row: rowNumber,
          message: error instanceof Error ? error.message : 'Lỗi dữ liệu',
        });
      }
    }
    return {
      success: true,
      created,
      skipped,
      failed: errors.length,
      emailFailed: 0,
      total: created + skipped + errors.length,
      errors,
    };
  }
}
