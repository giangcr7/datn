import { ForbiddenException } from '@nestjs/common';
import { PdfSignatureService } from './pdf-signature.service';
import type { AuthActor } from '../auth/auth-actor';
import type { DiplomaWithRelations } from '../database/diploma-projection';
import type { Prisma } from '../generated/prisma/client';
import { envValidationSchema } from '../config/env.validation';

describe('PDF signature security boundaries', () => {
  const service = new PdfSignatureService({} as never);
  it.each([
    { role: 'admin', org: 'ORG2' },
    { role: 'student', org: 'ORG2' },
    {
      role: 'university',
      org: 'ORG2',
      isHeadquarters: true,
      canApproveDiplomas: false,
    },
    { role: 'university', org: 'ORG2', campusId: 'other-campus' },
  ])('rejects unauthorized campus signing: %j', async (actor) => {
    await expect(
      service.prepareFinal(
        {} as Prisma.TransactionClient,
        { campusId: 'campus' } as DiplomaWithRelations,
        actor as AuthActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each([
    {
      role: 'admin',
      org: 'ORG1',
      isHeadquarters: true,
      canApproveDiplomas: true,
    },
    {
      role: 'university',
      org: 'ORG2',
      isHeadquarters: false,
      canApproveDiplomas: true,
    },
    {
      role: 'university',
      org: 'ORG1',
      isHeadquarters: true,
      canApproveDiplomas: false,
    },
  ])('rejects unauthorized final signing: %j', async (actor) => {
    await expect(
      service.prepareFinal(
        {} as Prisma.TransactionClient,
        {} as DiplomaWithRelations,
        actor as AuthActor,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
  const base = {
    DATABASE_URL: 'postgresql://localhost/test',
    JWT_SECRET: 'x'.repeat(32),
    NODE_ENV: 'production',
  };
  it('forbids demo certificates in production', () => {
    expect(
      envValidationSchema.validate({ ...base, PDF_SIGNING_MODE: 'demo' }).error
        ?.message,
    ).toContain('demo');
  });
  it('refuses missing real certificate configuration', () => {
    expect(
      envValidationSchema.validate({ ...base, PDF_SIGNING_MODE: 'certificate' })
        .error?.message,
    ).toContain('ORG2');
  });
  it('keeps disabled signing explicit without granting signing rights', () => {
    expect(
      envValidationSchema.validate({ ...base, PDF_SIGNING_MODE: 'disabled' })
        .error,
    ).toBeUndefined();
  });
});
