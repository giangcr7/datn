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
  dateOnly,
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
  registryIssuesRequireReview,
  ISSUE_DATE_NOT_IN_SOURCE,
} from './registry-parser';
import { DocumentStorageService } from '../storage/document-storage.service';
import { Prisma } from '../generated/prisma/client';
import { DIPLOMA_PRINT_TEMPLATE } from '../database/diploma-print-data';
import {
  diplomaInclude,
  diplomaProjection,
} from '../database/diploma-projection';
import { reviewedDiplomaErrors } from '../cert/reviewed-diploma';

const printFields = [
  'degreeType',
  'issuedOn',
  'fullNameLatin',
  'majorNameEn',
  'issuePlace',
  'diplomaSignerName',
  'diplomaSignerTitle',
] as const;

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
  'fullNameLatin',
  'majorNameEn',
  'issuePlace',
  'diplomaSignerName',
  'diplomaSignerTitle',
]);

@Injectable()
export class RegistryImportService {
  constructor(
    private readonly database: DatabaseService,
    private readonly storage: DocumentStorageService,
  ) {}
  private staff(actor: AuthActor) {
    if (
      actor.role !== 'university' ||
      !actor.canApproveDiplomas ||
      !actor.isHeadquarters
    )
      throw new ForbiddenException(
        'Chỉ cán bộ được cấp quyền tại cơ sở chính được rà soát sổ gốc',
      );
  }
  private scope(actor: AuthActor): Prisma.ImportBatchWhereInput {
    return {
      institutionId: actor.institutionId,
      ...(actor.role === 'admin' ? {} : { campusId: actor.campusId }),
    };
  }
  private async assertPrintCatalog(actor: AuthActor) {
    const institution = await this.database.institution.findUnique({
      where: { id: actor.institutionId },
      select: { nameEn: true },
    });
    if (!institution?.nameEn?.trim())
      throw new BadRequestException(
        'Danh mục trường chưa có tên tiếng Anh; cần hoàn thiện trước khi kiểm tra và lưu hồ sơ cấp bằng',
      );
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
    await this.assertPrintCatalog(actor);
    const aliases = await this.database.programAlias.findMany({
      where: { institutionId: actor.institutionId },
      select: { normalizedName: true, programId: true },
    });
    const rows = await parseRegistryWorkbook(
      buffer,
      new Map(aliases.map((alias) => [alias.normalizedName, alias.programId])),
      new Map(
        (
          await this.database.program.findMany({
            where: { institutionId: actor.institutionId },
            select: { id: true, nameEn: true },
          })
        ).map((program) => [program.id, program.nameEn]),
      ),
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
      ready: rows.filter((row) => !registryIssuesRequireReview(row.issues))
        .length,
      needsReview: rows.filter((row) => registryIssuesRequireReview(row.issues))
        .length,
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
              status: registryIssuesRequireReview(row.issues)
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
    if (!data.length) return { data: [], total, page, limit };
    const batchScope = { batchId: { in: data.map((batch) => batch.id) } };
    const [rowCounts, graduationOnlyCounts, draftCounts] = await Promise.all([
      this.database.importRow.groupBy({
        by: ['batchId', 'status'],
        where: batchScope,
        _count: { _all: true },
      }),
      this.database.importRow.groupBy({
        by: ['batchId'],
        where: {
          ...batchScope,
          status: 'IMPORTED',
          graduation: { is: { diplomas: { none: {} } } },
        },
        _count: { _all: true },
      }),
      this.database.importRow.groupBy({
        by: ['batchId'],
        where: {
          ...batchScope,
          status: 'IMPORTED',
          graduation: {
            is: {
              diplomas: { some: { status: 'DRAFT', workflowStatus: 'DRAFT' } },
            },
          },
        },
        _count: { _all: true },
      }),
    ]);
    return {
      data: data.map((batch) => {
        const countRows = (status: string) =>
          rowCounts.find(
            (row) => row.batchId === batch.id && row.status === status,
          )?._count._all || 0;
        return {
          ...batch,
          reviewSummary: {
            readyRows: countRows('READY'),
            needsReviewRows: countRows('NEEDS_REVIEW'),
            importedRows: countRows('IMPORTED'),
            graduationOnlyRows:
              graduationOnlyCounts.find((row) => row.batchId === batch.id)
                ?._count._all || 0,
            draftRows:
              draftCounts.find((row) => row.batchId === batch.id)?._count
                ._all || 0,
          },
        };
      }),
      total,
      page,
      limit,
    };
  }
  async programs(actor: AuthActor) {
    this.staff(actor);
    return this.database.program.findMany({
      where: { institutionId: actor.institutionId },
      select: {
        id: true,
        code: true,
        name: true,
        nameEn: true,
        nationalCode: true,
      },
      orderBy: { name: 'asc' },
    });
  }
  async rows(
    batchId: string,
    actor: AuthActor,
    page = 1,
    limit = 20,
    status?: string,
    rowId?: string,
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
      ...(rowId ? { id: rowId } : {}),
      ...(status ? { status: status as any } : {}),
    };
    const [data, total] = await Promise.all([
      this.database.importRow.findMany({
        where,
        include: {
          issues: true,
          graduation: {
            select: {
              diplomas: { include: diplomaInclude },
            },
          },
        },
        orderBy: [{ sheetName: 'asc' }, { rowNumber: 'asc' }],
        ...pagination(page, limit),
      }),
      this.database.importRow.count({ where }),
    ]);
    return {
      data: data.map((row) => ({
        ...row,
        submissionIssues:
          row.graduation?.diplomas.flatMap(reviewedDiplomaErrors) || [],
        graduation: row.graduation
          ? {
              diplomas: row.graduation.diplomas.map((diploma) => ({
                ...diplomaProjection(diploma),
                workflowStatus: diploma.workflowStatus,
                status: diploma.status,
              })),
            }
          : null,
      })),
      total,
      page,
      limit,
    };
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
    await this.assertPrintCatalog(actor);
    return this.database.$transaction(async (transaction) => {
      await transaction.$queryRaw`SELECT id FROM import_rows WHERE id = ${rowId}::uuid FOR UPDATE`;
      const row = await transaction.importRow.findFirst({
        where: { id: rowId, batchId, batch: this.scope(actor) },
      });
      if (!row) throw new NotFoundException();
      if (row.status === 'IMPORTED') {
        if (
          !Object.keys(corrections).length ||
          Object.keys(corrections).some(
            (field) => !(printFields as readonly string[]).includes(field),
          )
        )
          throw new ConflictException(
            'Hồ sơ đã lưu chỉ được bổ sung thông tin in bằng khi chưa gửi yêu cầu',
          );
        await transaction.$queryRaw`SELECT d.id FROM diplomas d JOIN graduation_records g ON g.id = d.graduation_id WHERE g.source_row_id = ${row.id}::uuid FOR UPDATE OF d`;
        const diplomas = await transaction.diploma.findMany({
          where: { graduation: { sourceRowId: row.id } },
          include: diplomaInclude,
        });
        if (
          !diplomas.length ||
          diplomas.some(
            (diploma) =>
              diploma.status !== 'DRAFT' ||
              diploma.workflowStatus !== 'DRAFT' ||
              diploma.signedDocuments.length > 0,
          )
        )
          throw new ConflictException(
            'Chỉ sửa thông tin in bằng của hồ sơ nháp chưa ký, chưa gửi yêu cầu',
          );
        const issuedOn =
          corrections.issuedOn === undefined
            ? undefined
            : parseDateOnly(corrections.issuedOn);
        if (
          corrections.issuedOn !== undefined &&
          (!issuedOn ||
            issuedOn > new Date() ||
            diplomas.some(
              (diploma) =>
                !diploma.graduation.student.dateOfBirth ||
                issuedOn < diploma.graduation.student.dateOfBirth ||
                issuedOn.getUTCFullYear() < diploma.graduation.graduationYear,
            ))
        )
          throw new BadRequestException(
            'Ngày cấp phải đúng hồ sơ gốc, không ở tương lai và không trước ngày sinh hoặc năm tốt nghiệp',
          );
        const overrides = {
          ...((row.overrides as object) || {}),
          ...corrections,
        };
        for (const diploma of diplomas) {
          const input = {
            ...(row.normalizedData as object),
            ...((row.overrides as object) || {}),
          } as RegistryInput;
          input.degreeType = diploma.graduation.degreeType || input.degreeType;
          input.issuedOn = dateOnly(diploma.issuedOn) || input.issuedOn;
          for (const field of printFields.filter(
            (field) => field !== 'degreeType' && field !== 'issuedOn',
          ))
            input[field] = diploma[field] || input[field];
          Object.assign(input, corrections);
          const issues = validateRegistryInput(input);
          if (issues.some((issue) => issue.severity === 'ERROR'))
            throw new BadRequestException(
              issues.map((issue) => issue.message).join('; '),
            );
          if (diploma.graduation.degreeType !== input.degreeType)
            await transaction.graduationRecord.update({
              where: { id: diploma.graduationId },
              data: { degreeType: input.degreeType },
            });
          await transaction.diploma.update({
            where: { id: diploma.id },
            data: {
              issuedOn: parseDateOnly(input.issuedOn),
              ...Object.fromEntries(
                printFields
                  .filter(
                    (field) => field !== 'degreeType' && field !== 'issuedOn',
                  )
                  .map((field) => [field, normalizeText(input[field]) || null]),
              ),
            },
          });
        }
        await transaction.importRow.update({
          where: { id: row.id },
          data: {
            overrides: jsonData(overrides),
            reviewedById: actor.id,
            reviewedAt: new Date(),
          },
        });
        await transaction.validationIssue.updateMany({
          where: { rowId, field: { in: [...printFields] }, resolvedAt: null },
          data: { resolvedAt: new Date() },
        });
        await transaction.diplomaEvent.createMany({
          data: diplomas.map((diploma) => ({
            diplomaId: diploma.id,
            actorId: actor.id,
            eventType: 'REVIEWED_PRINT_DATA',
            metadata: jsonData({
              note,
              corrections,
              previousIssuedOn: dateOnly(diploma.issuedOn),
              sourceRowId: row.id,
            }),
          })),
        });
        await transaction.auditLog.create({
          data: {
            institutionId: actor.institutionId,
            actorId: actor.id,
            actorEmail: actor.email,
            action: 'REVIEW_IMPORTED_PRINT_DATA',
            target: row.id,
            result: 'SUCCESS',
            metadata: jsonData({ note, corrections }),
          },
        });
        return { success: true, ready: true, issues: [] };
      }
      if (row.status === 'SKIPPED')
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
  async recheck(batchId: string, actor: AuthActor) {
    this.staff(actor);
    const batch = await this.database.importBatch.findFirst({
      where: { id: batchId, ...this.scope(actor) },
      include: { document: true },
    });
    if (!batch) throw new NotFoundException();
    await this.assertPrintCatalog(actor);
    const buffer = await this.storage.getWorkbook(
      batch.document.storageKey,
      batch.document.sha256,
    );
    const [aliases, programs] = await Promise.all([
      this.database.programAlias.findMany({
        where: { institutionId: actor.institutionId },
      }),
      this.database.program.findMany({
        where: { institutionId: actor.institutionId },
        select: { id: true, nameEn: true },
      }),
    ]);
    const parsed = await parseRegistryWorkbook(
      buffer,
      new Map(aliases.map((alias) => [alias.normalizedName, alias.programId])),
      new Map(programs.map((program) => [program.id, program.nameEn])),
    );
    const sources = new Map(
      parsed.map((row) => [row.sheetName + ':' + row.rowNumber, row]),
    );
    const rows = await this.database.importRow.findMany({
      where: { batchId, status: { not: 'SKIPPED' } },
      select: { id: true },
    });
    let repairedDrafts = 0,
      updatedIssues = 0,
      protectedRows = 0;
    for (const candidate of rows) {
      await this.database.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT id FROM import_rows WHERE id = ${candidate.id}::uuid FOR UPDATE`;
        const row = await transaction.importRow.findUniqueOrThrow({
          where: { id: candidate.id },
          include: { issues: { where: { resolvedAt: null } } },
        });
        const fresh = sources.get(row.sheetName + ':' + row.rowNumber);
        if (!fresh || row.status === 'SKIPPED') return;
        await transaction.$queryRaw`SELECT d.id FROM diplomas d JOIN graduation_records g ON g.id = d.graduation_id WHERE g.source_row_id = ${row.id}::uuid FOR UPDATE OF d`;
        const diplomas = await transaction.diploma.findMany({
          where: { graduation: { sourceRowId: row.id } },
          include: diplomaInclude,
        });
        if (
          diplomas.some(
            (diploma) =>
              diploma.status !== 'DRAFT' ||
              diploma.workflowStatus !== 'DRAFT' ||
              diploma.signedDocuments.length,
          )
        ) {
          protectedRows++;
          return;
        }
        const normalized = row.normalizedData as unknown as RegistryInput;
        const existingOverrides = (row.overrides || {}) as Record<
          string,
          unknown
        >;
        const recovered: Record<string, unknown> = {};
        for (const field of ['programId', ...printFields] as const)
          if (
            !Object.hasOwn(existingOverrides, field) &&
            !normalized[field] &&
            fresh.normalizedData[field]
          )
            recovered[field] = fresh.normalizedData[field];
        const overrides = { ...recovered, ...existingOverrides };
        const input = { ...normalized, ...overrides } as RegistryInput;
        // Previously confirmed draft values take precedence over the source during repair.
        const first = diplomas[0];
        if (first) {
          input.degreeType = first.graduation.degreeType || input.degreeType;
          input.issuedOn = dateOnly(first.issuedOn) || input.issuedOn;
          for (const field of printFields.filter(
            (field) => field !== 'degreeType' && field !== 'issuedOn',
          ))
            input[field] = first[field] || input[field];
        }
        const issues = validateRegistryInput(input);
        if (row.status !== 'IMPORTED') {
          const validationCodes = new Set(
            validateRegistryInput(fresh.normalizedData).map(
              (issue) => issue.code,
            ),
          );
          if (!row.reviewedAt)
            issues.push(
              ...fresh.issues.filter(
                (issue) => !validationCodes.has(issue.code),
              ),
            );
          issues.push(
            ...row.issues
              .filter((issue) => issue.code === 'COMMIT_CONFLICT')
              .map(({ field, code, severity, message }) => ({
                field,
                code,
                severity,
                message,
              })),
          );
        }
        const ready =
          !issues.some((issue) => issue.severity === 'ERROR') &&
          (row.status === 'IMPORTED' ||
            !!row.reviewedAt ||
            !registryIssuesRequireReview(issues));
        if (row.status === 'IMPORTED' && ready) {
          for (const diploma of diplomas) {
            const changes: Prisma.DiplomaUpdateInput = {};
            if (!diploma.issuedOn && input.issuedOn)
              changes.issuedOn = parseDateOnly(input.issuedOn);
            for (const field of printFields.filter(
              (field) => field !== 'degreeType' && field !== 'issuedOn',
            ))
              if (!diploma[field] && input[field])
                changes[field] = input[field];
            const degreeChanged =
              !diploma.graduation.degreeType && !!input.degreeType;
            if (degreeChanged)
              await transaction.graduationRecord.update({
                where: { id: diploma.graduationId },
                data: { degreeType: input.degreeType },
              });
            if (Object.keys(changes).length)
              await transaction.diploma.update({
                where: { id: diploma.id },
                data: changes,
              });
            if (degreeChanged || Object.keys(changes).length) {
              repairedDrafts++;
              await transaction.diplomaEvent.create({
                data: {
                  diplomaId: diploma.id,
                  actorId: actor.id,
                  eventType: 'RESTORED_IMPORT_PRINT_DATA',
                  metadata: jsonData({
                    sourceRowId: row.id,
                    sourceSha256: batch.document.sha256,
                    changes,
                    degreeType: input.degreeType,
                  }),
                },
              });
            }
          }
        }
        if (Object.keys(recovered).length || row.status !== 'IMPORTED')
          await transaction.importRow.update({
            where: { id: row.id },
            data: {
              ...(Object.keys(recovered).length
                ? { overrides: jsonData(overrides) }
                : {}),
              ...(row.status === 'IMPORTED'
                ? {}
                : { status: ready ? 'READY' : 'NEEDS_REVIEW' }),
            },
          });
        const relevant =
          row.status === 'IMPORTED'
            ? row.issues.filter(
                (issue) =>
                  (printFields as readonly string[]).includes(issue.field) ||
                  issue.code === 'MISSING_ISSUE_DATE',
              )
            : row.issues;
        const issueKey = (issue: RowIssue) =>
          JSON.stringify([
            issue.field,
            issue.code,
            issue.severity,
            issue.message,
          ]);
        const currentKeys = new Set(row.issues.map(issueKey));
        const nextKeys = new Set(issues.map(issueKey));
        const resolved = relevant.filter(
          (issue) => !nextKeys.has(issueKey(issue)),
        );
        if (resolved.length) {
          await transaction.validationIssue.updateMany({
            where: { id: { in: resolved.map((issue) => issue.id) } },
            data: { resolvedAt: new Date() },
          });
          updatedIssues += resolved.length;
        }
        const additions = issues.filter(
          (issue, index) =>
            !currentKeys.has(issueKey(issue)) &&
            issues.findIndex((other) => issueKey(other) === issueKey(issue)) ===
              index,
        );
        if (additions.length)
          await transaction.validationIssue.createMany({
            data: additions.map((issue) => ({ ...issue, rowId: row.id })),
          });
      });
    }
    const [readyRows, needsReviewRows] = await Promise.all([
      this.database.importRow.count({ where: { batchId, status: 'READY' } }),
      this.database.importRow.count({
        where: { batchId, status: 'NEEDS_REVIEW' },
      }),
    ]);
    await this.database.importBatch.update({
      where: { id: batchId },
      data: {
        status: needsReviewRows
          ? 'REVIEW_REQUIRED'
          : readyRows
            ? 'READY'
            : 'COMPLETED',
        completedAt: readyRows || needsReviewRows ? null : new Date(),
      },
    });
    await this.database.auditLog.create({
      data: {
        institutionId: actor.institutionId,
        actorId: actor.id,
        actorEmail: actor.email,
        action: 'RECHECK_REGISTRY_PRINT_DATA',
        target: batchId,
        result: 'SUCCESS',
        metadata: {
          repairedDrafts,
          updatedIssues,
          protectedRows,
          sourceSha256: batch.document.sha256,
        },
      },
    });
    return {
      success: true,
      readyRows,
      needsReviewRows,
      repairedDrafts,
      updatedIssues,
      protectedRows,
    };
  }
  async commit(
    batchId: string,
    actor: AuthActor,
    originType: 'DIGITIZATION' | 'ISSUANCE' = 'ISSUANCE',
  ) {
    this.staff(actor);
    if (!['DIGITIZATION', 'ISSUANCE'].includes(originType))
      throw new BadRequestException('Cách tạo hồ sơ không hợp lệ');
    const batch = await this.database.importBatch.findFirst({
      where: { id: batchId, ...this.scope(actor) },
    });
    if (!batch) throw new NotFoundException();
    await this.assertPrintCatalog(actor);
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
          const errors = validateRegistryInput(input).filter(
            (issue) => issue.severity === 'ERROR',
          );
          if (errors.length)
            throw new BadRequestException(
              errors.map((issue) => issue.message).join('; '),
            );
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
                fullNameLatin: input.fullNameLatin,
                majorNameEn: input.majorNameEn,
                issuePlace: input.issuePlace,
                diplomaSignerName: input.diplomaSignerName,
                diplomaSignerTitle: input.diplomaSignerTitle,
                printTemplate: DIPLOMA_PRINT_TEMPLATE,
                originType,
                workflowStatus: 'DRAFT',
                status: 'DRAFT',
              },
            });
            diplomaId = diploma.id;
            await transaction.diplomaEvent.create({
              data: {
                diplomaId,
                actorId: actor.id,
                eventType: 'IMPORTED_DRAFT',
                metadata: { sourceRowId: row.id, originType },
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
              metadata: { graduationId: graduation.id, diplomaId, originType },
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
      note: 'Đã lưu hồ sơ rà soát. Cán bộ cơ sở chính có thể duyệt và phát hành từng hồ sơ hoặc hàng loạt; dữ liệu chưa được ghi blockchain ở bước này',
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
    const existingAlias = await this.database.programAlias.findUnique({
      where: {
        institutionId_normalizedName: {
          institutionId: actor.institutionId,
          normalizedName: lookupText(originalName),
        },
      },
    });
    if (existingAlias)
      throw new ConflictException('Tên này đã có ánh xạ; không được ghi đè');
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
          metadata: { note, programId, originalName: normalizeText(originalName) },
        },
      });
      return alias;
    }).catch((error: unknown) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException('Tên này đã có ánh xạ; không được ghi đè');
      throw error;
    });
  }
}
