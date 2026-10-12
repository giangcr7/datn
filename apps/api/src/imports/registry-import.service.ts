import {
  Injectable,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseService } from '../database/database.service';
import type { AuthActor } from '../auth/auth-actor';
import {
  jsonData,
  lookupText,
  normalizeText,
  pagination,
  parseDateOnly,
} from '../database/data-utils';
import {
  AcademicInput,
  writeAcademicRecord,
} from '../database/academic-record-writer';
import {
  parseRegistryWorkbook,
  REGISTRY_MAPPING_VERSION,
  RegistryInput,
  RowIssue,
  validateRegistryInput,
} from './registry-parser';
import { DocumentStorageService } from '../storage/document-storage.service';
import { Prisma } from '../generated/prisma/client';

const correctionFields = new Set([
  'studentCode',
  'fullName',
  'dateOfBirth',
  'birthPlace',
  'gender',
  'ethnicity',
  'nationality',
  'programId',
  'programOriginal',
  'classCode',
  'cohortCode',
  'graduationYear',
  'gpa',
  'gpaScale',
  'classification',
  'degreeType',
  'specialization',
  'decisionNumber',
  'decisionDate',
  'signerName',
  'certificateNo',
  'registryNo',
  'issuedOn',
]);

@Injectable()
export class RegistryImportService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: DocumentStorageService,
  ) {}
  private staff(actor: AuthActor) {
    if (!['admin', 'university'].includes(actor.role))
      throw new ForbiddenException('Chỉ cán bộ được nhập sổ gốc');
  }
  private scope(actor: AuthActor): Prisma.ImportBatchWhereInput {
    return {
      institutionId: actor.institutionId,
      ...(actor.role === 'admin' ? {} : { campusId: actor.campusId }),
    };
  }
  private async parse(fileName: string, fileData: string, actor: AuthActor) {
    this.staff(actor);
    if (
      !fileName.toLowerCase().endsWith('.xlsx') ||
      fileData.length > 7 * 1024 * 1024 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(fileData)
    )
      throw new BadRequestException(
        'Chỉ nhận Excel .xlsx, base64 hợp lệ, tối đa 5 MB',
      );
    const buffer = Buffer.from(fileData, 'base64');
    const file =
      fileName
        .replace(/[/\\?%*:|"<>]/g, '')
        .replace(/\.\./g, '')
        .trim()
        .slice(0, 255) || 'register.xlsx';
    const aliases = await this.database.programAlias.findMany({
      where: { institutionId: actor.institutionId },
      select: { normalizedName: true, programId: true },
    });
    const rows = await parseRegistryWorkbook(
      buffer,
      new Map(aliases.map((alias) => [alias.normalizedName, alias.programId])),
    );
    const existing = await this.database.diploma.findMany({
      where: { institutionId: actor.institutionId },
      select: { certificateNo: true, registryNo: true },
    });
    const certificateNumbers = new Set(
        existing.map((item) => item.certificateNo),
      ),
      registryNumbers = new Set(existing.map((item) => item.registryNo));
    for (const row of rows) {
      if (
        row.normalizedData.certificateNo &&
        certificateNumbers.has(row.normalizedData.certificateNo)
      )
        row.issues.push({
          field: 'certificateNo',
          code: 'EXISTING_CERTIFICATE_NO',
          severity: 'ERROR',
          message: 'Số hiệu đã có trong database',
        });
      if (
        row.normalizedData.registryNo &&
        registryNumbers.has(row.normalizedData.registryNo)
      )
        row.issues.push({
          field: 'registryNo',
          code: 'EXISTING_REGISTRY_NO',
          severity: 'ERROR',
          message: 'Số vào sổ đã có trong database',
        });
    }
    return {
      buffer,
      fileName: file,
      rows,
      sha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }
  async preview(fileName: string, fileData: string, actor: AuthActor) {
    const parsed = await this.parse(fileName, fileData, actor);
    return {
      success: true,
      mappingVersion: REGISTRY_MAPPING_VERSION,
      sha256: parsed.sha256,
      summary: this.summary(parsed.rows),
      rows: parsed.rows.slice(0, 50),
    };
  }
  private summary(rows: { issues: RowIssue[]; sheetName: string }[]) {
    const bySheet: Record<
      string,
      { total: number; errors: number; warnings: number }
    > = {};
    const byCode: Record<string, number> = {};
    for (const row of rows) {
      const sheet = (bySheet[row.sheetName] ||= {
        total: 0,
        errors: 0,
        warnings: 0,
      });
      sheet.total++;
      for (const issue of row.issues) {
        sheet[issue.severity === 'ERROR' ? 'errors' : 'warnings']++;
        byCode[issue.code] = (byCode[issue.code] || 0) + 1;
      }
    }
    return {
      total: rows.length,
      ready: rows.filter(
        (row) => !row.issues.some((issue) => issue.code !== 'NOT_YET_ISSUED'),
      ).length,
      needsReview: rows.filter((row) =>
        row.issues.some((issue) => issue.code !== 'NOT_YET_ISSUED'),
      ).length,
      bySheet,
      byCode,
    };
  }
  async import(fileName: string, fileData: string, actor: AuthActor) {
    const parsed = await this.parse(fileName, fileData, actor);
    const storageKey = await this.storage.put(
      actor.institutionId,
      parsed.sha256,
      parsed.buffer,
    );
    const document = await this.database.sourceDocument.upsert({
      where: {
        institutionId_sha256: {
          institutionId: actor.institutionId,
          sha256: parsed.sha256,
        },
      },
      update: {},
      create: {
        institutionId: actor.institutionId,
        fileName: parsed.fileName,
        sha256: parsed.sha256,
        byteSize: parsed.buffer.length,
        mediaType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        storageKey,
        uploadedById: actor.id,
      },
    });
    const key = {
      documentId: document.id,
      campusId: actor.campusId,
      mappingVersion: REGISTRY_MAPPING_VERSION,
    };
    const previous = await this.database.importBatch.findUnique({
      where: { documentId_campusId_mappingVersion: key },
    });
    if (previous)
      return {
        success: true,
        batchId: previous.id,
        reused: true,
        instruction: 'File đã được staging trước đó; không tạo bản sao',
      };
    const batchId = randomUUID();
    const rowIds = parsed.rows.map(() => randomUUID());
    const summary = this.summary(parsed.rows);
    try {
      await this.database.$transaction(
        async (transaction) => {
          await transaction.importBatch.create({
            data: {
              id: batchId,
              ...key,
              institutionId: actor.institutionId,
              totalRows: parsed.rows.length,
              status: summary.needsReview ? 'REVIEW_REQUIRED' : 'READY',
              createdById: actor.id,
            },
          });
          await transaction.importRow.createMany({
            data: parsed.rows.map((row, index) => ({
              id: rowIds[index],
              batchId,
              sheetName: row.sheetName,
              rowNumber: row.rowNumber,
              rawData: jsonData(row.rawData),
              normalizedData: jsonData(row.normalizedData),
              status: row.issues.some(
                (issue) => issue.code !== 'NOT_YET_ISSUED',
              )
                ? ('NEEDS_REVIEW' as const)
                : ('READY' as const),
            })),
          });
          const issues = parsed.rows.flatMap((row, index) =>
            row.issues.map((issue) => ({ ...issue, rowId: rowIds[index] })),
          );
          if (issues.length)
            await transaction.validationIssue.createMany({ data: issues });
          await transaction.auditLog.create({
            data: {
              institutionId: actor.institutionId,
              actorId: actor.id,
              actorEmail: actor.email,
              action: 'STAGE_REGISTRY',
              target: batchId,
              result: 'SUCCESS',
              metadata: jsonData(summary),
            },
          });
        },
        { timeout: 90000 },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const duplicate = await this.database.importBatch.findUniqueOrThrow({
          where: { documentId_campusId_mappingVersion: key },
        });
        return { success: true, batchId: duplicate.id, reused: true };
      }
      throw error;
    }
    return {
      success: true,
      batchId,
      reused: false,
      summary,
      instruction:
        'Chỉ staging. Rà soát các dòng NEEDS_REVIEW, rồi gọi commit cho dòng READY. Chưa tạo hồ sơ tốt nghiệp, tài khoản hay blockchain.',
    };
  }
  async list(actor: AuthActor, page = 1, limit = 20) {
    this.staff(actor);
    const where = this.scope(actor);
    const [data, total] = await Promise.all([
      this.database.importBatch.findMany({
        where,
        ...pagination(page, limit),
        orderBy: { createdAt: 'desc' },
        include: { document: { select: { fileName: true, sha256: true } } },
      }),
      this.database.importBatch.count({ where }),
    ]);
    return { data, total, page, limit };
  }
  async programs(actor: AuthActor) {
    this.staff(actor);
    return this.database.program.findMany({
      where: { institutionId: actor.institutionId },
      select: { id: true, code: true, name: true, nationalCode: true },
      orderBy: { name: 'asc' },
    });
  }
  async rows(
    batchId: string,
    actor: AuthActor,
    page = 1,
    limit = 20,
    status?: string,
  ) {
    this.staff(actor);
    const batch = await this.database.importBatch.findFirst({
      where: { id: batchId, ...this.scope(actor) },
    });
    if (!batch) throw new NotFoundException();
    if (
      status &&
      !['READY', 'NEEDS_REVIEW', 'IMPORTED', 'SKIPPED'].includes(status)
    )
      throw new BadRequestException('Trạng thái dòng không hợp lệ');
    const where: Prisma.ImportRowWhereInput = {
      batchId,
      ...(status ? { status: status as any } : {}),
    };
    const [data, total] = await Promise.all([
      this.database.importRow.findMany({
        where,
        include: { issues: true },
        orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }],
        ...pagination(page, limit),
      }),
      this.database.importRow.count({ where }),
    ]);
    return { data, total, page, limit };
  }
  async review(
    batchId: string,
    rowId: string,
    corrections: Record<string, unknown>,
    note: string,
    actor: AuthActor,
  ) {
    this.staff(actor);
    if (
      !note.trim() ||
      Object.keys(corrections).some((key) => !correctionFields.has(key))
    )
      throw new BadRequestException(
        'Cần ghi chú và chỉ được sửa trường nghiệp vụ hỗ trợ',
      );
    for (const [key, value] of Object.entries(corrections)) {
      if (['graduationYear', 'gpa', 'gpaScale'].includes(key)) {
        if (value !== null && typeof value !== 'number')
          throw new BadRequestException('Trường số phải là number hoặc null');
      } else if (value !== null && typeof value !== 'string')
        throw new BadRequestException(
          'Trường văn bản phải là string hoặc null',
        );
    }
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM import_rows WHERE id = ${rowId}::uuid FOR UPDATE`;
      const row = await transaction.importRow.findFirst({
        where: { id: rowId, batchId, batch: this.scope(actor) },
      });
      if (!row) throw new NotFoundException();
      if (['IMPORTED', 'SKIPPED'].includes(row.status))
        throw new ConflictException(
          'Dòng đã xử lý; không sửa ngược nguồn đã import',
        );
      const overrides = {
        ...((row.overrides as object) || {}),
        ...corrections,
      };
      const input = {
        ...(row.normalizedData as object),
        ...overrides,
      } as unknown as RegistryInput;
      const issues = validateRegistryInput(input);
      if (
        input.programId &&
        !(await transaction.program.findFirst({
          where: { id: input.programId, institutionId: actor.institutionId },
        }))
      )
        throw new BadRequestException('Ngành không thuộc trường');
      for (const field of ['certificateNo', 'registryNo'] as const)
        if (input[field]) {
          if (
            await transaction.diploma.findFirst({
              where: {
                institutionId: actor.institutionId,
                [field]: input[field],
              },
            })
          )
            issues.push({
              field,
              code: 'EXISTING_NUMBER',
              severity: 'ERROR',
              message: 'Số văn bằng đã tồn tại',
            });
          const siblings = await transaction.importRow.findMany({
            where: { batchId, id: { not: rowId }, status: { not: 'SKIPPED' } },
            select: { normalizedData: true, overrides: true },
          });
          if (
            siblings.some(
              (item) =>
                (
                  ({
                    ...(item.normalizedData as object),
                    ...((item.overrides as object) || {}),
                  }) as any
                )[field] === input[field],
            )
          )
            issues.push({
              field,
              code: 'DUPLICATE_NUMBER',
              severity: 'ERROR',
              message: 'Số văn bằng trùng trong batch',
            });
        }
      await transaction.validationIssue.updateMany({
        where: { rowId, resolvedAt: null },
        data: { resolvedAt: new Date() },
      });
      if (issues.length)
        await transaction.validationIssue.createMany({
          data: issues.map((issue) => ({ ...issue, rowId })),
        });
      const ready = !issues.some((issue) => issue.severity === 'ERROR');
      await transaction.importRow.update({
        where: { id: rowId },
        data: {
          overrides: jsonData(overrides),
          reviewedById: actor.id,
          reviewedAt: new Date(),
          status: ready ? 'READY' : 'NEEDS_REVIEW',
        },
      });
      await transaction.auditLog.create({
        data: {
          institutionId: actor.institutionId,
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'REVIEW_IMPORT_ROW',
          target: rowId,
          result: 'SUCCESS',
          metadata: jsonData({ note, corrections, ready }),
        },
      });
      return { success: true, ready, issues };
    });
  }
  async commit(batchId: string, actor: AuthActor) {
    this.staff(actor);
    const batch = await this.database.importBatch.findFirst({
      where: { id: batchId, ...this.scope(actor) },
    });
    if (!batch) throw new NotFoundException();
    const rows = await this.database.importRow.findMany({
      where: { batchId, status: 'READY' },
      take: 6000,
    });
    let imported = 0,
      conflicts = 0,
      diplomas = 0;
    for (const candidate of rows) {
      try {
        const result = await this.database.$transaction(async (transaction) => {
          await transaction.$queryRaw`SELECT id FROM import_rows WHERE id = ${candidate.id}::uuid FOR UPDATE`;
          const row = await transaction.importRow.findUniqueOrThrow({
            where: { id: candidate.id },
          });
          if (row.status !== 'READY') return null;
          const input = {
            ...(row.normalizedData as object),
            ...((row.overrides as object) || {}),
          } as RegistryInput;
          if (
            !input.programId ||
            validateRegistryInput(input).some(
              (issue) => issue.severity === 'ERROR',
            )
          )
            throw new BadRequestException('Dữ liệu chưa hợp lệ');
          const graduation = await writeAcademicRecord(
            transaction,
            { institutionId: batch.institutionId, campusId: batch.campusId },
            input as AcademicInput,
            row.id,
            batch.documentId,
          );
          let diplomaId: string | null = null;
          if (input.certificateNo && input.registryNo) {
            const diploma = await transaction.diploma.create({
              data: {
                institutionId: batch.institutionId,
                campusId: batch.campusId,
                graduationId: graduation.id,
                certificateNo: input.certificateNo,
                registryNo: input.registryNo,
                issuedOn: parseDateOnly(input.issuedOn),
                workflowStatus: 'DRAFT',
                status: 'DRAFT',
                requestedById: row.reviewedById || batch.createdById,
              },
            });
            diplomaId = diploma.id;
            await transaction.diplomaEvent.create({
              data: {
                diplomaId,
                actorId: actor.id,
                eventType: 'IMPORTED_DRAFT',
                metadata: { sourceRowId: row.id },
              },
            });
          }
          await transaction.importRow.update({
            where: { id: row.id },
            data: { status: 'IMPORTED' },
          });
          await transaction.auditLog.create({
            data: {
              institutionId: batch.institutionId,
              actorId: actor.id,
              actorEmail: actor.email,
              action: 'COMMIT_IMPORT_ROW',
              target: row.id,
              result: 'SUCCESS',
              metadata: { graduationId: graduation.id, diplomaId },
            },
          });
          return { diplomaId };
        });
        if (result) {
          imported++;
          if (result.diplomaId) diplomas++;
        }
      } catch (error) {
        conflicts++;
        await this.database.$transaction(async (transaction) => {
          const changed = await transaction.importRow.updateMany({
            where: { id: candidate.id, status: 'READY' },
            data: { status: 'NEEDS_REVIEW' },
          });
          if (changed.count)
            await transaction.validationIssue.create({
              data: {
                rowId: candidate.id,
                field: 'row',
                code: 'COMMIT_CONFLICT',
                severity: 'ERROR',
                message:
                  error instanceof Prisma.PrismaClientKnownRequestError
                    ? 'Xung đột ràng buộc database: ' + error.code
                    : error instanceof Error
                      ? error.message
                      : 'Không thể import',
              },
            });
        });
      }
    }
    const counts = await this.database.importRow.groupBy({
      by: ['status'],
      where: { batchId },
      _count: true,
    });
    const complete = !counts.some((item) =>
      ['READY', 'NEEDS_REVIEW'].includes(item.status),
    );
    await this.database.importBatch.update({
      where: { id: batchId },
      data: {
        importedRows:
          counts.find((item) => item.status === 'IMPORTED')?._count || 0,
        status: complete ? 'COMPLETED' : 'REVIEW_REQUIRED',
        completedAt: complete ? new Date() : null,
      },
    });
    return {
      success: true,
      imported,
      diplomas,
      conflicts,
      counts,
      note: 'Các văn bằng mới vẫn là DRAFT; không tạo tài khoản/email và không tự ghi blockchain',
    };
  }
  async addProgramAlias(
    programId: string,
    originalName: string,
    note: string,
    actor: AuthActor,
  ) {
    this.staff(actor);
    if (
      !note.trim() ||
      !normalizeText(originalName) ||
      originalName.length > 255
    )
      throw new BadRequestException('Alias cần tên hợp lệ và ghi chú căn cứ');
    const program = await this.database.program.findFirst({
      where: { id: programId, institutionId: actor.institutionId },
    });
    if (!program) throw new NotFoundException();
    return this.database.$transaction(async (transaction) => {
      const alias = await transaction.programAlias.create({
        data: {
          institutionId: actor.institutionId,
          programId,
          originalName: normalizeText(originalName),
          normalizedName: lookupText(originalName),
          approvedById: actor.id,
        },
      });
      await transaction.auditLog.create({
        data: {
          institutionId: actor.institutionId,
          actorId: actor.id,
          actorEmail: actor.email,
          action: 'APPROVE_PROGRAM_ALIAS',
          target: alias.id,
          result: 'SUCCESS',
          metadata: { note },
        },
      });
      return alias;
    });
  }
}
