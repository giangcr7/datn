import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ExpressAdapter } from '@nestjs/platform-express';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DatabaseService } from '../database/database.service';
import type { DiplomaWithRelations } from '../database/diploma-projection';
import { CertService } from './cert.service';
import { CertController } from './cert.controller';
import {
  diplomaLookupProjection,
  diplomaLookupQuery,
  lookupName,
} from './diploma-lookup';
import { LookupDiplomaDto } from './lookup-diploma.dto';

const input = {
  fullName: 'Nguyễn Văn Đức',
  dob: '2001-02-28',
  mssv: '0012345678',
  className: '64CNTT',
  major: 'Công nghệ thông tin',
  degreeType: 'BACHELOR',
  namTotNghiep: 2025,
  grade: 'Khá',
  gpa: 3.25,
  soHieu: 'TLU.001',
  soVaoSo: '2025/001',
  issueDate: '2025-07-15',
  decisionNo: '123/QĐ-ĐHTL',
  decisionDate: '2025-06-15',
};
const transform = (value: object) =>
  plainToInstance(LookupDiplomaDto, value, { enableImplicitConversion: true });
const validation = (value: object) =>
  validate(transform(value), { whitelist: true, forbidNonWhitelisted: true });
const record = () =>
  ({
    id: '00000000-0000-0000-0000-000000000001',
    status: 'ACTIVE',
    workflowStatus: 'APPROVED',
    certificateNo: 'CURRENT',
    registryNo: 'CURRENT',
    campus: { code: 'MAIN' },
    graduation: {
      student: {
        studentCode: 'CURRENT',
        fullName: 'Changed name',
        dateOfBirth: new Date('1999-01-01'),
      },
      program: { name: 'Changed program' },
      programId: 'program1',
      graduationYear: 2024,
      gpa: null,
      gpaScale: 4,
      classification: 'GOOD',
      enrollment: null,
      decision: null,
    },
    versions: [
      {
        version: 1,
        payload: input,
        payloadHash: 'a'.repeat(64),
        anchors: [
          {
            eventType: 'ISSUE',
            status: 'COMMITTED',
            transactionId: 'PRIVATE_TX',
          },
        ],
      },
    ],
  }) as unknown as DiplomaWithRelations;

describe('personal diploma lookup', () => {
  it('accepts and normalizes all 14 business fields', async () => {
    const query = transform({
      ...input,
      fullName: '  Nguyễn   Văn Đức  ',
      mssv: ' 0012345678 ',
      namTotNghiep: '2025',
      gpa: '3.25',
    });
    expect(await validate(query)).toEqual([]);
    expect(query).toMatchObject(input);
  });

  it.each([
    { fullName: '' },
    { fullName: 'a' },
    { fullName: 'a'.repeat(256) },
    { dob: '2023-02-29' },
    { dob: '2001-02-28T00:00:00Z' },
    { dob: '' },
    { mssv: '1' },
    { mssv: '001 2345678' },
    { mssv: 'a'.repeat(41) },
    { soHieu: 'a'.repeat(121) },
    { soVaoSo: 'a'.repeat(181) },
    { namTotNghiep: 1899 },
    { namTotNghiep: 2025.5 },
    { namTotNghiep: 'invalid' },
    { gpa: -1 },
    { gpa: 10.01 },
    { gpa: 3.256 },
    { gpa: 'NaN' },
    { degreeType: 'INVALID' },
    { grade: 'INVALID' },
    { issueDate: '2025-02-30' },
    { decisionDate: '2025-02-29' },
    { className: 'a'.repeat(101) },
    { major: 'a'.repeat(256) },
    { decisionNo: 'a'.repeat(121) },
    { institutionId: 'other-school' },
    { status: 'DRAFT' },
    { limit: 1000 },
    { fullName: ['Nguyễn Văn Đức'] },
  ])('rejects invalid or unauthorized input %p', async (change) => {
    expect((await validation({ ...input, ...change })).length).toBeGreaterThan(
      0,
    );
  });

  it('normalizes Vietnamese names without losing identity boundaries', () => {
    expect(lookupName('  NGUYỄN  VĂN ĐỨC  ')).toBe('nguyen van duc');
    expect(lookupName('Nguyễn Văn Đức')).toBe('nguyen van duc');
    expect(lookupName('Nguyễn Đức')).not.toBe(lookupName(input.fullName));
  });

  it('parameterizes every supplied field and combines filters with AND', () => {
    const query = diplomaLookupQuery(transform(input));
    for (const value of Object.values(input)) {
      const expected =
        value === input.fullName || value === input.major
          ? lookupName(String(value))
          : value === input.namTotNghiep
            ? String(value)
            : value;
      expect(query.values).toContain(expected);
    }
    expect(query.text).toContain('birth_date =');
    expect(query.text).toContain('lower(student_code) = lower(');
    expect(query.text).toContain('lower(registry_no) = lower(');
    expect(query.text).toContain('NULLIF(gpa,');
    expect(query.text).not.toContain(' ILIKE ');
    expect(query.text).not.toContain(' OR ');
    expect(query.text).toContain('LIMIT 20');
  });

  it('does not interpolate SQL or turn wildcard characters into broad searches', () => {
    const attack = "TLU%_'; DROP TABLE diplomas;--";
    const query = diplomaLookupQuery(transform({ ...input, soHieu: attack }));
    expect(query.text).not.toContain(attack);
    expect(query.values).toContain(attack);
    expect(query.text).not.toContain('DROP TABLE');
    expect(query.text).toContain('lower(certificate_no) = lower(');
  });

  it('only searches the latest approved, committed snapshot, including revoked/replaced documents', () => {
    const query = diplomaLookupQuery(transform(input));
    expect(query.text).toContain('ORDER BY version DESC LIMIT 1');
    expect(query.text).toContain("diploma.workflow_status = 'APPROVED'");
    expect(query.text).toContain(
      "diploma.status IN ('ACTIVE', 'REVOKED', 'SUPERSEDED')",
    );
    expect(query.text).toContain("anchor.status = 'COMMITTED'");
    expect(query.text).toContain('anchor.version_id = version.id');
    expect(query.text).toContain('CASE WHEN version.payload ?');
    for (const field of Object.keys(input))
      expect(query.values).toContain(field);
  });

  it.each(['mssv', 'soHieu', 'soVaoSo'] as const)(
    'accepts %s as the required exact identifier',
    async (identifier) => {
      const transaction = {
        $queryRaw: jest.fn().mockResolvedValue([]),
        diploma: { findMany: jest.fn() },
      };
      const database = {
        $transaction: jest.fn(
          (callback: (value: typeof transaction) => unknown) =>
            callback(transaction),
        ),
      };
      const query = transform({
        fullName: input.fullName,
        dob: input.dob,
        [identifier]: input[identifier],
      });
      expect(
        await new CertService(database as unknown as DatabaseService).lookup(
          query,
        ),
      ).toEqual([]);
      expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
      expect(transaction.diploma.findMany).not.toHaveBeenCalled();
    },
  );

  it.each([
    { fullName: input.fullName, dob: input.dob },
    { fullName: input.fullName, mssv: input.mssv, dob: 'invalid' },
    { fullName: input.fullName, mssv: input.mssv, dob: '2199-01-01' },
  ])(
    'rejects incomplete personal criteria before reading the database',
    async (value) => {
      const database = { $transaction: jest.fn() };
      await expect(
        new CertService(database as unknown as DatabaseService).lookup(
          transform(value),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(database.$transaction).not.toHaveBeenCalled();
    },
  );

  it('returns only matched IDs in a repeatable-read transaction, with a minimal snapshot projection', async () => {
    const diploma = record();
    const transaction = {
      $queryRaw: jest.fn().mockResolvedValue([{ id: diploma.id }]),
      diploma: { findMany: jest.fn().mockResolvedValue([diploma]) },
    };
    const database = {
      $transaction: jest.fn(
        (callback: (value: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const results = await new CertService(
      database as unknown as DatabaseService,
    ).lookup(transform(input));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      fullName: input.fullName,
      mssv: input.mssv,
      major: input.major,
      soVaoSo: input.soVaoSo,
      status: 'ON_CHAIN',
    });
    expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'RepeatableRead',
    });
    expect(transaction.diploma.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: [diploma.id] } } }),
    );
    for (const key of [
      'dob',
      'gpa',
      'proof',
      'payload',
      'payloadHash',
      'txId',
      'printedDiploma',
      'requestedBy',
      'approvedBy',
    ])
      expect(results[0]).not.toHaveProperty(key);
  });

  it.each([
    ['REVOKED', 'REVOKED'],
    ['SUPERSEDED', 'REPLACED'],
  ] as const)(
    'preserves %s rather than declaring it active',
    (status, expected) => {
      const diploma = record();
      diploma.status = status;
      expect(diplomaLookupProjection(diploma).status).toBe(expected);
    },
  );
});

describe('public diploma lookup HTTP boundary', () => {
  async function application() {
    const service = {
      lookup: jest.fn().mockResolvedValue([diplomaLookupProjection(record())]),
    };
    const module = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot([{ name: 'medium', ttl: 60000, limit: 30 }]),
      ],
      controllers: [CertController],
      providers: [
        { provide: CertService, useValue: service },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();
    const app = module.createNestApplication(new ExpressAdapter(), {
      logger: false,
    });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    await app.init();
    return { app, service };
  }

  it('accepts the complete form without login and does not cache personal results', async () => {
    const { app, service } = await application();
    try {
      const response = await request(app.getHttpServer())
        .post('/cert/lookup')
        .send(input)
        .expect(200);
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.body[0]).toMatchObject({
        fullName: input.fullName,
        status: 'ON_CHAIN',
      });
      expect(service.lookup).toHaveBeenCalledWith(
        expect.objectContaining(input),
      );
    } finally {
      await app.close();
    }
  });

  it('validates every request body before calling the service', async () => {
    const { app, service } = await application();
    try {
      for (const value of [
        { ...input, fullName: '' },
        { ...input, dob: '2023-02-29' },
        { ...input, institutionId: 'other-school' },
        { ...input, gpa: 20 },
        { ...input, degreeType: 'INVALID' },
        { ...input, soHieu: ['TLU.001'] },
      ])
        await request(app.getHttpServer())
          .post('/cert/lookup')
          .send(value)
          .expect(400);
      expect(service.lookup).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rate-limits repeated personal lookups', async () => {
    const { app, service } = await application();
    try {
      for (let attempt = 0; attempt < 10; attempt++)
        await request(app.getHttpServer())
          .post('/cert/lookup')
          .send(input)
          .expect(200);
      await request(app.getHttpServer())
        .post('/cert/lookup')
        .send(input)
        .expect(429);
      expect(service.lookup).toHaveBeenCalledTimes(10);
    } finally {
      await app.close();
    }
  });
});
