import { randomBytes } from 'node:crypto';
import {
  decodeProtectedBase64,
  openPasswordBackup,
  sealPasswordBackup,
} from './protected-data';

describe('portable key backups', () => {
  const password = Buffer.from(
    'isolated-test-passphrase-' + randomBytes(16).toString('hex'),
  );
  const data = Buffer.from('synthetic signing material; never a real key');
  afterAll(() => password.fill(0));

  it('authenticates and restores the original data', () => {
    const envelope = sealPasswordBackup(data, password);
    const recovered = openPasswordBackup(envelope, password);
    expect(recovered.equals(data)).toBe(true);
    recovered.fill(0);
  });
  it('uses fresh salt and nonce for every backup', () => {
    const first = sealPasswordBackup(data, password);
    const second = sealPasswordBackup(data, password);
    expect(first.salt).not.toBe(second.salt);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });
  it('rejects an incorrect passphrase', () => {
    const envelope = sealPasswordBackup(data, password);
    expect(() => openPasswordBackup(envelope, Buffer.alloc(32, 7))).toThrow(
      'authentication failed',
    );
  });
  it.each(['salt', 'nonce', 'tag', 'ciphertext'] as const)(
    'rejects modified %s',
    (field) => {
      const envelope = sealPasswordBackup(data, password);
      const changed = Buffer.from(envelope[field], 'base64');
      changed[0] ^= 1;
      envelope[field] = changed.toString('base64');
      expect(() => openPasswordBackup(envelope, password)).toThrow();
    },
  );
  it('rejects short passphrases', () =>
    expect(() => sealPasswordBackup(data, Buffer.from('short'))).toThrow());
  it('rejects invalid base64 and unsupported formats', () => {
    expect(() => decodeProtectedBase64('not base64')).toThrow();
    const envelope = sealPasswordBackup(data, password);
    expect(() =>
      openPasswordBackup(
        { ...envelope, format: 'untrusted' } as never,
        password,
      ),
    ).toThrow();
  });
});
