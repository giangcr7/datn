import { redactLogText, redactLogValue } from './log-redaction';

describe('security log redaction', () => {
  it('masks camelCase session and refresh tokens', () => {
    expect(
      JSON.stringify(
        redactLogValue({
          accessToken: 'fixture-secret',
          refreshToken: 'fixture-secret',
          idToken: 'fixture-secret',
        }),
      ),
    ).not.toContain('fixture-secret');
  });
  it('masks nested credentials and binary data without changing the input', () => {
    const value = {
      message: 'OK',
      nested: {
        password: 'fixture-secret',
        privateKey: 'fixture-key',
        apiKey: 'fixture-api',
        authorization: 'fixture-auth',
      },
      bytes: Buffer.from('fixture-bytes'),
    };
    const output = JSON.stringify(redactLogValue(value));
    for (const secret of [
      'fixture-secret',
      'fixture-key',
      'fixture-api',
      'fixture-auth',
      'fixture-bytes',
    ])
      expect(output).not.toContain(secret);
    expect(value.nested.password).toBe('fixture-secret');
  });
  it.each([
    'password=fixture-secret',
    'JWT_SECRET="fixture-secret"',
    '{"api_key":"fixture-secret"}',
    'Authorization: Bearer fixture-secret',
    'postgresql://user:fixture-secret@localhost/db',
    '-----BEGIN PRIVATE KEY-----\nfixture-secret\n-----END PRIVATE KEY-----',
  ])('masks unstructured text: %s', (input) =>
    expect(redactLogText(input)).not.toContain('fixture-secret'),
  );
  it('sanitizes error stacks and Winston symbol metadata', () => {
    const value = {
      error: new Error('password=fixture-secret'),
      [Symbol.for('splat')]: [{ password: 'fixture-secret' }],
      [Symbol.for('level')]: 'info',
    };
    const output = redactLogValue(value) as Record<string | symbol, unknown>;
    expect(JSON.stringify(output)).not.toContain('fixture-secret');
    expect(JSON.stringify(output[Symbol.for('splat')])).not.toContain(
      'fixture-secret',
    );
    expect(output[Symbol.for('level')]).toBe('info');
  });
  it('handles circular input safely', () => {
    const value: { self?: unknown } = {};
    value.self = value;
    expect(() => JSON.stringify(redactLogValue(value))).not.toThrow();
  });
});
