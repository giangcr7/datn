import { ForbiddenException } from '@nestjs/common';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';
import { DashboardService } from './dashboard.service';

const actor = {
  role: 'university',
  institutionId: '00000000-0000-4000-8000-000000000001',
  campusId: '00000000-0000-4000-8000-000000000002',
  isHeadquarters: true,
  canApproveDiplomas: true,
} as AuthActor;

function setup() {
  const records = {
    summary: { registered: 5 },
    byMajor: [],
    byYear: [],
    byMonth: [],
    recentIssued: [],
  };
  const imports = {
    counts: { needsReview: 2, ready: 1, graduationOnly: 1, prepare: 1 },
    batches: [],
  };
  const transaction = {
    $queryRaw: jest
      .fn()
      .mockResolvedValueOnce([records])
      .mockResolvedValueOnce([imports]),
    student: { count: jest.fn().mockResolvedValue(10) },
    blockchainAnchor: { count: jest.fn().mockResolvedValue(2) },
  };
  const database = {
    $transaction: jest.fn(
      async (callback: (reader: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
  };
  return {
    service: new DashboardService(database as unknown as DatabaseService),
    transaction,
    database,
  };
}

describe('dashboard overview', () => {
  it.each([
    { role: 'student' },
    { role: 'employer' },
    { isHeadquarters: false },
    { canApproveDiplomas: false },
    { institutionId: undefined },
    { institutionId: '' },
    { campusId: undefined },
    { role: 'admin', institutionId: undefined },
  ])(
    'denies unauthorized or unscoped reader %p before any query',
    async (flags) => {
      const { service, database } = setup();
      await expect(
        service.overview({ ...actor, ...flags } as AuthActor),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(database.$transaction).not.toHaveBeenCalled();
    },
  );

  it.each(['university', 'admin'] as const)(
    'allows scoped %s read in a consistent snapshot',
    async (role) => {
      const { service, transaction, database } = setup();
      const result = await service.overview({ ...actor, role });
      expect(result.summary).toEqual({
        registered: 5,
        students: 10,
        failedTransactions: 2,
      });
      expect(result.timezone).toBe('Asia/Ho_Chi_Minh');
      expect(Number.isFinite(Date.parse(result.generatedAt))).toBe(true);
      expect(database.$transaction).toHaveBeenCalledWith(expect.any(Function), {
        isolationLevel: 'RepeatableRead',
      });
      for (const [query] of transaction.$queryRaw.mock.calls)
        expect((query as { values: unknown[] }).values).toContain(
          actor.institutionId,
        );
      expect(transaction.student.count).toHaveBeenCalledWith({
        where: { institutionId: actor.institutionId },
      });
      expect(transaction.blockchainAnchor.count).toHaveBeenCalledWith({
        where: {
          version: { diploma: { institutionId: actor.institutionId } },
          eventType: { in: ['ISSUE', 'REVOKE'] },
          status: 'FAILED',
        },
      });
    },
  );

  it('does not substitute zero statistics when the database fails', async () => {
    const { service, transaction } = setup();
    transaction.$queryRaw
      .mockReset()
      .mockRejectedValue(new Error('database offline'));
    await expect(service.overview(actor)).rejects.toThrow('database offline');
  });
});
