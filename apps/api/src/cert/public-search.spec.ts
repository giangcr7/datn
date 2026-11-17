import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { DatabaseService } from '../database/database.service';
import { publicSearchQuery } from './public-search';
import {
  PUBLIC_SEARCH_MAX_LENGTH,
  PublicSearchQueryDto,
} from './public-search.dto';
import { CertService } from './cert.service';

describe('public diploma search', () => {
  it('normalizes Vietnamese input and builds ranked committed-only SQL', () => {
    const query = publicSearchQuery('  Nguyễn   Văn  Đức  ');

    expect(query.text).toContain("diploma.workflow_status = 'APPROVED'");
    expect(query.text).toContain("diploma.status = 'ACTIVE'");
    expect(query.text).toContain('diploma_search_snapshot(version.payload)');
    expect(query.text).toContain('candidate.version_id = version.id');
    expect(query.text).toContain("anchor.event_type = 'ISSUE'");
    expect(query.text).toContain("anchor.status = 'COMMITTED'");
    expect(query.text).toContain(
      'ORDER BY search_rank, search_similarity DESC',
    );
    expect(query.text).toContain('LIMIT 20');
    expect(query.values).toEqual(
      expect.arrayContaining(['%nguyen%', '%van%', '%duc%']),
    );
    expect(query.values).not.toContain(expect.stringContaining('Nguyễn'));
  });

  it('escapes wildcard input and keeps actor scope parameterized', () => {
    const query = publicSearchQuery("50%_\\'", {
      institutionId: 'institution1',
      campusId: 'campus1',
    });

    expect(query.text).not.toContain('DROP TABLE');
    expect(query.text).toContain('diploma.institution_id');
    expect(query.text).toContain('diploma.campus_id');
    expect(query.values).toContain("%50\\%\\_\\\\'%");
  });

  it('validates the bounded public query DTO', async () => {
    const valid = plainToInstance(PublicSearchQueryDto, { q: 'Nguyễn An' });
    expect(await validate(valid)).toEqual([]);
    for (const q of ['', 'a', 'x'.repeat(PUBLIC_SEARCH_MAX_LENGTH + 1)]) {
      const errors = await validate(
        plainToInstance(PublicSearchQueryDto, { q }),
      );
      expect(errors.length).toBeGreaterThan(0);
    }
  });

  it('keeps the anonymous directory closed and rejects overlong direct calls', async () => {
    const previous = process.env.PUBLIC_DIRECTORY_ENABLED;
    delete process.env.PUBLIC_DIRECTORY_ENABLED;
    try {
      const service = new CertService({} as DatabaseService);
      await expect(service.search('Nguyen')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      process.env.PUBLIC_DIRECTORY_ENABLED = 'true';
      await expect(
        service.search('x'.repeat(PUBLIC_SEARCH_MAX_LENGTH + 1)),
      ).rejects.toBeInstanceOf(BadRequestException);
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_DIRECTORY_ENABLED;
      else process.env.PUBLIC_DIRECTORY_ENABLED = previous;
    }
  });

  it('hydrates ranked IDs in database order without exposing MSSV', async () => {
    const first = {
      id: 'first',
      status: 'ACTIVE',
      workflowStatus: 'APPROVED',
      certificateNo: 'CERT-1',
      registryNo: 'REG-1',
      issuedOn: new Date('2025-01-01'),
      printTemplate: null,
      campus: { code: 'MAIN', name: 'Main' },
      issuingCampus: null,
      graduation: {
        student: {
          studentCode: 'PRIVATE-1',
          fullName: 'Nguyen Van An',
          dateOfBirth: new Date('2001-01-01'),
        },
        program: { name: 'Information Technology' },
        programId: 'program1',
        degreeType: 'BACHELOR',
        graduationYear: 2025,
        gpa: null,
        gpaScale: 4,
        classification: 'GOOD',
        enrollment: null,
        decision: null,
        sourceRow: null,
      },
      versions: [
        {
          version: 1,
          schemaVersion: 'v1',
          payloadHash: 'a'.repeat(64),
          payload: {},
          anchors: [{ eventType: 'ISSUE', status: 'COMMITTED' }],
        },
      ],
      signedDocuments: [],
      supersedes: null,
      supersedesId: null,
      replacement: null,
    };
    const second = { ...first, id: 'second' };
    const transaction = {
      $queryRaw: jest
        .fn()
        .mockResolvedValue([{ id: 'second' }, { id: 'first' }]),
      diploma: { findMany: jest.fn().mockResolvedValue([first, second]) },
    };
    const database = {
      $transaction: jest.fn(
        (callback: (value: typeof transaction) => unknown) =>
          callback(transaction),
      ),
    };
    const previous = process.env.PUBLIC_DIRECTORY_ENABLED;
    process.env.PUBLIC_DIRECTORY_ENABLED = 'true';
    try {
      const results = await new CertService(
        database as unknown as DatabaseService,
      ).search('Nguyen');
      expect(results.map((result) => result.uuid)).toEqual(['second', 'first']);
      expect(results[0]).not.toHaveProperty('mssv');
    } finally {
      if (previous === undefined) delete process.env.PUBLIC_DIRECTORY_ENABLED;
      else process.env.PUBLIC_DIRECTORY_ENABLED = previous;
    }
  });
});
