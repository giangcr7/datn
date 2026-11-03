import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';
import { RegisterQueryDto } from '../cert/register-query.dto';
import { ReportExportQueryDto } from './report-query.dto';
import { statisticsQuery } from './reports-query';
import { ReportsService } from './reports.service';
import { exportReportXlsx } from './report-xlsx';
import { exportReportPdf } from './report-pdf';
import type { Prisma } from '../generated/prisma/client';

jest.mock('./report-xlsx', () => ({
  exportReportXlsx: jest.fn(() => Promise.resolve(Buffer.from('xlsx'))),
}));
jest.mock('./report-pdf', () => ({
  exportReportPdf: jest.fn(() => Promise.resolve(Buffer.from('pdf'))),
}));
const actor = {
  role: 'university',
  institutionId: 'institution1',
  campusId: 'campus1',
  isHeadquarters: true,
  canApproveDiplomas: true,
} as AuthActor;
const summary = { total: 0, active: 0, revoked: 0, replaced: 0 };
const statistics = {
  summary,
  byMajor: [],
  byYear: [],
  byGrade: [],
  byStatus: [],
};
function setup() {
  const transaction = {
    institution: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ name: 'Trường kiểm thử' }),
    },
    $queryRaw: jest
      .fn<Promise<unknown[]>, [Prisma.Sql]>()
      .mockResolvedValue([statistics]),
    diploma: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const database = {
    $transaction: jest.fn((callback: (client: typeof transaction) => unknown) =>
      callback(transaction),
    ),
  };
  return {
    transaction,
    database,
    service: new ReportsService(database as unknown as DatabaseService),
  };
}

describe('reports', () => {
  beforeEach(() => jest.clearAllMocks());
  it.each([
    {},
    { format: 'pdf', kind: 'register', year: '2024', grade: 'Khá' },
  ])('validates export defaults and typed filters %p', async (input) => {
    const query = plainToInstance(ReportExportQueryDto, input, {
      enableImplicitConversion: true,
    });
    expect(
      await validate(query, { whitelist: true, forbidNonWhitelisted: true }),
    ).toEqual([]);
    expect(query.page).toBe(1);
    expect(query.limit).toBe(20);
  });
  it.each([
    { kind: 'all' },
    { format: 'csv' },
    { grade: 'invalid' },
    { institutionId: 'foreign' },
    { status: 'DRAFT' },
    { issuedFrom: '2023-02-29' },
  ])('rejects unexpected export query %p', async (input) => {
    expect(
      (
        await validate(plainToInstance(ReportExportQueryDto, input), {
          whitelist: true,
          forbidNonWhitelisted: true,
        })
      ).length,
    ).toBeGreaterThan(0);
  });
  it.each([
    { role: 'student' },
    { role: 'employer' },
    { institutionId: '' },
    { campusId: undefined },
    { isHeadquarters: false },
    { canApproveDiplomas: false },
  ])('denies both read and download before querying %p', async (flags) => {
    const { database, service } = setup();
    const denied = { ...actor, ...flags } as AuthActor;
    await expect(
      service.overview(new RegisterQueryDto(), denied),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.export(new ReportExportQueryDto(), denied),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
  it('rejects reversed date ranges', async () => {
    const { database, service } = setup();
    await expect(
      service.overview(
        Object.assign(new RegisterQueryDto(), {
          issuedFrom: '2024-02-01',
          issuedTo: '2024-01-01',
        }),
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(database.$transaction).not.toHaveBeenCalled();
  });
  it.each(['university', 'admin'] as const)(
    'reads a scoped consistent summary for %s',
    async (role) => {
      const { database, transaction, service } = setup();
      const result = await service.overview(new RegisterQueryDto(), {
        ...actor,
        role,
      });
      expect(result.summary).toEqual(summary);
      expect(result.institutionName).toBe('Trường kiểm thử');
      expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
      });
      expect(transaction.$queryRaw.mock.calls[0][0].values).toContain(
        actor.institutionId,
      );
      expect(transaction.diploma.findMany).not.toHaveBeenCalled();
    },
  );
  it('never replaces a failed query with zero statistics', async () => {
    const { transaction, service } = setup();
    transaction.$queryRaw.mockRejectedValue(new Error('database offline'));
    await expect(
      service.overview(new RegisterQueryDto(), actor),
    ).rejects.toThrow('database offline');
  });
  it('parameterizes filters and counts only the latest committed published snapshot', () => {
    const query = statisticsQuery(
      actor.institutionId,
      Object.assign(new RegisterQueryDto(), {
        major: "50%_'; DROP TABLE diplomas;--",
        grade: 'Khá',
      }),
    );
    expect(query.text).not.toContain('DROP TABLE');
    expect(query.values).toContain(
      String.raw`%50\%\_'; DROP TABLE diplomas;--%`,
    );
    expect(query.values).toContain('Khá');
    expect(query.text).toContain('ORDER BY version DESC LIMIT 1');
    expect(query.text).toContain("anchor.status = 'COMMITTED'");
    expect(query.text).toContain('version.payload ->>');
  });
  it.each(['xlsx', 'pdf'] as const)(
    'exports a complete empty register in %s without writes',
    async (format) => {
      const { database, transaction, service } = setup();
      transaction.$queryRaw.mockResolvedValue([{ total: 0, ids: [] }]);
      const result = await service.export(
        Object.assign(new ReportExportQueryDto(), {
          kind: 'register',
          format,
          page: 5,
          limit: 1,
        }),
        actor,
      );
      expect(result.filename.startsWith('SoPhatHanh_')).toBe(true);
      expect(result.filename.endsWith('.' + format)).toBe(true);
      expect(result.data.toString()).toBe(format);
      expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
        timeout: 30000,
      });
      expect(transaction.diploma.findMany).not.toHaveBeenCalled();
      expect(transaction.$queryRaw.mock.calls[0][0].values).toContain(
        format === 'pdf' ? 1000 : 10000,
      );
    },
  );
  it.each([
    ['xlsx', 10001],
    ['pdf', 1001],
  ] as const)(
    'rejects oversize %s instead of silently truncating',
    async (format, total) => {
      const { transaction, service } = setup();
      transaction.$queryRaw.mockResolvedValue([{ total, ids: [] }]);
      await expect(
        service.export(
          Object.assign(new ReportExportQueryDto(), {
            kind: 'register',
            format,
          }),
          actor,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(transaction.diploma.findMany).not.toHaveBeenCalled();
      expect(exportReportXlsx).not.toHaveBeenCalled();
      expect(exportReportPdf).not.toHaveBeenCalled();
    },
  );
  it('rejects incomplete data rather than delivering a partial workbook', async () => {
    const { transaction, service } = setup();
    transaction.$queryRaw.mockResolvedValue([{ total: 1, ids: ['id1'] }]);
    await expect(
      service.export(
        Object.assign(new ReportExportQueryDto(), { kind: 'register' }),
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(exportReportXlsx).not.toHaveBeenCalled();
  });
  it('exports statistics without loading individual student data', async () => {
    const { transaction, service } = setup();
    await service.export(new ReportExportQueryDto(), actor);
    expect(transaction.diploma.findMany).not.toHaveBeenCalled();
    const document = jest.mocked(exportReportXlsx).mock.calls[0][0];
    expect(document.total).toBe(0);
    expect(document.tables.some((table) => table.name === 'TheoNganh')).toBe(
      true,
    );
  });
});
