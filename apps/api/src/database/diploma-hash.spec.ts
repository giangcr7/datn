import { payloadHash, legacyHash } from './diploma-hash';

describe('diploma snapshots', () => {
  it('canonical hash does not depend on JSON key order', () => {
    expect(
      payloadHash({ b: null, a: { name: 'Nguyễn An', gpa: '2.50' } }),
    ).toBe(payloadHash({ a: { gpa: '2.50', name: 'Nguyễn An' }, b: null }));
  });
  it('preserves the distinction between unknown, zero and a value', () => {
    expect(payloadHash({ gpa: null })).not.toBe(payloadHash({ gpa: 0 }));
    expect(payloadHash({ gpa: '2.50' })).not.toBe(payloadHash({ gpa: '2.51' }));
  });
  it('keeps the legacy 11-field hash stable', () => {
    const record = {
      uuid: 'old-id',
      mssv: '0012345678',
      fullName: 'Nguyễn An',
      major: 'Kỹ thuật xây dựng',
      gpa: 2.5,
      grade: 'Khá',
      issueDate: '2023-01-01',
      soHieu: 'CERT1',
      soVaoSo: 'REG1',
      className: 'C01',
      namTotNghiep: 2023,
    };
    expect(legacyHash(record)).toBe(legacyHash({ ...record, gpa: '2.50' }));
    expect(legacyHash({ ...record, fullName: 'Nguyễn Bình' })).not.toBe(
      legacyHash(record),
    );
  });
});
