import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthActor } from '../auth/auth-actor';
import { assertRequestTransition, requestScope } from './change-request-state';
import {
  ChangeRequestActionDto,
  CreateChangeRequestDto,
  REQUEST_STATUSES,
} from './change-request.dto';

describe('student correction request state', () => {
  const base = {
    id: 'actor',
    institutionId: 'school',
    campusId: 'main',
    role: 'university',
    isHeadquarters: true,
    canApproveDiplomas: true,
  } as AuthActor;
  it('allows only an authorized main-campus officer or identified student', () => {
    expect(requestScope(base)).toBe('officer');
    expect(
      requestScope({ ...base, role: 'student', studentId: 'student' }),
    ).toBe('student');
    for (const actor of [
      { ...base, role: 'admin' },
      { ...base, role: 'employer' },
      { ...base, isHeadquarters: false },
      { ...base, canApproveDiplomas: false },
      { ...base, role: 'student', studentId: null },
      { ...base, institutionId: '' },
    ])
      expect(() => requestScope(actor as AuthActor)).toThrow();
  });
  const studentMoves = new Set([
    'PENDING:CANCELLED',
    'NEEDS_INFORMATION:PENDING',
    'NEEDS_INFORMATION:CANCELLED',
  ]);
  const officerMoves = new Set([
    'PENDING:IN_REVIEW',
    'PENDING:REJECTED',
    'IN_REVIEW:NEEDS_INFORMATION',
    'IN_REVIEW:RESOLVED',
    'IN_REVIEW:REJECTED',
    'NEEDS_INFORMATION:REJECTED',
  ]);
  for (const student of [true, false])
    for (const current of REQUEST_STATUSES)
      for (const next of REQUEST_STATUSES) {
        it(
          (student ? 'student ' : 'officer ') + current + ' -> ' + next,
          () => {
            const operation = () =>
              assertRequestTransition(current, next, student);
            if (
              (student ? studentMoves : officerMoves).has(current + ':' + next)
            )
              expect(operation).not.toThrow();
            else expect(operation).toThrow();
          },
        );
      }
  it('rejects duplicate, unknown, empty or oversized changes and short reasons', async () => {
    const body = {
      diplomaId: '66a2e1e9-d44f-4518-b7e9-f42f844252ae',
      reason: 'Đối chiếu giấy khai sinh',
      changes: [{ field: 'fullName', value: 'Nguyễn Văn An' }],
    };
    expect(
      await validate(plainToInstance(CreateChangeRequestDto, body)),
    ).toHaveLength(0);
    for (const extra of [
      { changes: [] },
      { changes: [body.changes[0], body.changes[0]] },
      { changes: [{ field: 'status', value: 'APPROVED' }] },
      { changes: [{ field: 'major', value: ' '.repeat(3) }] },
      { reason: 'abc' },
      { reason: 'x'.repeat(2001) },
      { diplomaId: 'not-uuid' },
    ])
      expect(
        (
          await validate(
            plainToInstance(CreateChangeRequestDto, { ...body, ...extra }),
          )
        ).length,
      ).toBeGreaterThan(0);
  });
  it('requires revision and a meaningful handling note', async () => {
    expect(
      await validate(
        plainToInstance(ChangeRequestActionDto, {
          status: 'IN_REVIEW',
          expectedRevision: 1,
          note: 'Đã tiếp nhận',
        }),
      ),
    ).toHaveLength(0);
    for (const body of [
      { status: 'APPROVED', expectedRevision: 1, note: 'Tiếp nhận' },
      { status: 'IN_REVIEW', expectedRevision: 0, note: 'Tiếp nhận' },
      { status: 'IN_REVIEW', expectedRevision: 1, note: '   ' },
    ])
      expect(
        (await validate(plainToInstance(ChangeRequestActionDto, body))).length,
      ).toBeGreaterThan(0);
  });
});
