import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthActor } from '../auth/auth-actor';
import type { DatabaseService } from '../database/database.service';
import { ReadInboxDto } from './inbox.controller';
import { inboxItems, InboxService } from './inbox.service';

describe('work inbox', () => {
  const group = { key: 'approvals', count: 2, version: 'snapshot-1' };
  it('shows scoped groups with stable fingerprints and priority order', () => {
    const items = inboxItems(
      [
        group,
        { key: 'blockchain-failed', count: 1, version: 'failed' },
        { key: 'unknown', count: 9, version: '' },
        { key: 'rejected', count: 0, version: '' },
      ],
      [],
    );
    expect(items.map((item) => item.key)).toEqual([
      'blockchain-failed',
      'approvals',
    ]);
    expect(items[1].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(inboxItems([group], [])[0].fingerprint).toBe(items[1].fingerprint);
  });
  it('read markers apply to an exact task snapshot, not just its count', () => {
    const initial = inboxItems([group], [])[0];
    const receipt = {
      key: initial.key,
      fingerprint: initial.fingerprint,
      readAt: new Date(),
    };
    expect(inboxItems([group], [receipt])[0].read).toBe(true);
    expect(
      inboxItems(
        [{ ...group, version: 'different-job-same-count' }],
        [receipt],
      )[0].read,
    ).toBe(false);
    expect(inboxItems([{ ...group, count: 3 }], [receipt])[0].read).toBe(false);
    expect(inboxItems([], [receipt])).toEqual([]);
  });
  it('replacement jobs link to replacement tabs, not normal approvals', () => {
    const items = inboxItems(
      [
        { key: 'replacement-approvals', count: 1, version: 'x' },
        { key: 'replacement-rejected', count: 1, version: 'x' },
      ],
      [],
    );
    expect(items[0].href).toBe('/pending?view=replacements&stage=REQUESTED');
    expect(items[1].href).toBe('/pending?view=replacements&stage=REJECTED');
  });
  it('student supplementary notices link to the matching filtered list', () => {
    expect(
      inboxItems([{ key: 'student-supplement', count: 1, version: 'x' }], [])[0]
        .href,
    ).toBe('/student/requests?status=NEEDS_INFORMATION');
  });
  it('validates read markers and rejects spoofed keys / fingerprints', async () => {
    expect(
      await validate(
        plainToInstance(ReadInboxDto, {
          key: 'approvals',
          fingerprint: 'a'.repeat(64),
        }),
      ),
    ).toHaveLength(0);
    for (const body of [
      { key: '../../other', fingerprint: 'a'.repeat(64) },
      { key: 'approvals', fingerprint: 'not-a-digest' },
      { key: '', fingerprint: 'a'.repeat(64) },
    ])
      expect(
        (await validate(plainToInstance(ReadInboxDto, body))).length,
      ).toBeGreaterThan(0);
  });
  it('rejects incomplete actors and non-business roles before touching the database', async () => {
    const transaction = jest.fn();
    const service = new InboxService({
      $transaction: transaction,
    } as unknown as DatabaseService);
    const actor = {
      id: 'user',
      institutionId: 'school',
      campusId: 'campus',
      membershipId: 'member',
      role: 'university',
      isHeadquarters: true,
      canApproveDiplomas: true,
    } as AuthActor;
    for (const flags of [
      { membershipId: '' },
      { role: 'employer' },
      { role: 'student', studentId: null },
      { canApproveDiplomas: false },
      { isHeadquarters: false },
      { institutionId: '' },
    ])
      await expect(
        service.list({ ...actor, ...flags } as AuthActor),
      ).rejects.toThrow();
    expect(transaction).not.toHaveBeenCalled();
  });
});
