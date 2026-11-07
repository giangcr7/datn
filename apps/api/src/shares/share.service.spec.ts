import { GoneException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ShareService } from './share.service';
import type { DatabaseService } from '../database/database.service';
import type { NotifyService } from '../notify/notify.service';
import type { VerifyService } from '../verify/verify.service';
import type { AuditService } from '../audit/audit.service';
import type { ConfigService } from '@nestjs/config';

describe('ShareService', () => {
  function fixture() {
    const database = {
      diplomaShare: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const verifyService = {
      verify: jest.fn().mockResolvedValue({
        success: true,
        isValid: true,
        verificationStatus: 'VERIFIED',
        message: 'verified',
        details: {
          studentName: 'Student',
          major: 'Program',
          grade: 'Good',
          issueDate: '2026-01-01',
        },
      }),
    };
    const service = new ShareService(
      database as unknown as DatabaseService,
      {} as NotifyService,
      verifyService as unknown as VerifyService,
      {} as AuditService,
      {} as ConfigService,
    );
    return { database, verifyService, service };
  }

  it('accepts only an active, unexpired token and records access', async () => {
    const { database, verifyService, service } = fixture();
    const token = 'a'.repeat(64);
    const share = {
      id: 'share-id',
      diplomaId: 'diploma-id',
      revokedAt: null,
      firstAccessedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    };
    database.diplomaShare.findUnique.mockResolvedValue(share);

    const result = await service.verify(token);

    expect(database.diplomaShare.findUnique).toHaveBeenCalledWith({
      where: {
        tokenHash: createHash('sha256').update(token).digest('hex'),
      },
    });
    expect(database.diplomaShare.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'share-id' },
        data: expect.objectContaining({ firstAccessedAt: expect.any(Date) }),
      }),
    );
    expect(verifyService.verify).toHaveBeenCalledWith({ uuid: 'diploma-id' });
    expect(result).toMatchObject({ success: true, isValid: true });
  });

  it.each([
    { revokedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) },
    { revokedAt: null, expiresAt: new Date(Date.now() - 60_000) },
  ])('rejects unavailable shares', async (share) => {
    const { database, service } = fixture();
    database.diplomaShare.findUnique.mockResolvedValue({
      id: 'share-id',
      diplomaId: 'diploma-id',
      firstAccessedAt: null,
      ...share,
    });

    await expect(service.verify('b'.repeat(64))).rejects.toBeInstanceOf(
      GoneException,
    );
    expect(database.diplomaShare.update).not.toHaveBeenCalled();
  });
});
