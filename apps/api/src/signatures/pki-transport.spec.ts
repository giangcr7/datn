import { createServer, type Server } from 'node:http';
import { isPublicPkiAddress, pkiEndpoint, pkiRequest } from './pki-transport';
import { envValidationSchema } from '../config/env.validation';

describe('PKI transport and configuration', () => {
  const environment = { ...process.env };
  let server: Server | undefined;
  afterEach(async () => {
    if (server)
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    server = undefined;
    process.env = { ...environment };
  });

  it.each([
    '127.0.0.1',
    '10.0.0.1',
    '192.168.1.1',
    '169.254.169.254',
    '100.64.0.1',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    'fc00::1',
    'fe80::1',
    '2001:db8::1',
    '::7f00:1',
  ])('rejects non-public IP %s', (address) => {
    expect(isPublicPkiAddress(address)).toBe(false);
  });
  it.each(['8.8.8.8', '1.1.1.1', '2606:4700:4700::1111'])(
    'allows public IP %s',
    (address) => {
      expect(isPublicPkiAddress(address)).toBe(true);
    },
  );
  it('requires an exact host allowlist and rejects credentials', () => {
    process.env.PDF_PKI_ALLOWED_HOSTS = 'tsa.example.org';
    expect(pkiEndpoint('https://tsa.example.org/timestamp').host).toBe(
      'tsa.example.org',
    );
    for (const url of [
      'https://tsa.example.org.evil.test/',
      'https://user:password@tsa.example.org/',
      'file:///secret',
      'https://tsa.example.org:4431/',
      'https://tsa.example.org/#fragment',
    ])
      expect(() => pkiEndpoint(url)).toThrow();
  });
  async function local(handler: Parameters<typeof createServer>[0]) {
    server = createServer(handler);
    await new Promise<void>((resolve) =>
      server!.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('No test listener');
    const host = '127.0.0.1:' + address.port;
    process.env.NODE_ENV = 'test';
    process.env.PDF_SIGNING_MODE = 'demo';
    process.env.PDF_PKI_ALLOWED_HOSTS = host;
    return 'http://' + host;
  }
  it('only permits local responders in non-production demo mode', async () => {
    const url = await local((_request, response) => response.end('DER'));
    expect((await pkiRequest(url)).toString()).toBe('DER');
    process.env.PDF_SIGNING_MODE = 'certificate';
    await expect(pkiRequest(url)).rejects.toMatchObject({ code: 'INVALID' });
    process.env.PDF_SIGNING_MODE = 'demo';
    process.env.NODE_ENV = 'production';
    await expect(pkiRequest(url)).rejects.toMatchObject({ code: 'INVALID' });
  });
  it('never follows redirects', async () => {
    const url = await local((_request, response) => {
      response.writeHead(302, { Location: '/redirect' });
      response.end();
    });
    await expect(pkiRequest(url)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });
  it('limits responses to five megabytes', async () => {
    const url = await local((_request, response) =>
      response.end(Buffer.alloc(5 * 1024 * 1024 + 1)),
    );
    await expect(pkiRequest(url)).rejects.toMatchObject({ code: 'INVALID' });
  });
  it('times out stalled responders', async () => {
    const url = await local(() => undefined);
    process.env.PDF_PKI_TIMEOUT_MS = '100';
    await expect(pkiRequest(url)).rejects.toMatchObject({
      code: 'UNAVAILABLE',
    });
  });
  const certificateConfig = {
    DATABASE_URL: 'postgresql://localhost/test',
    JWT_SECRET: 'x'.repeat(32),
    NODE_ENV: 'production',
    PDF_SIGNING_MODE: 'certificate',
    PDF_ORG1_P12_PATH: 'org1.p12',
    PDF_ORG2_P12_PATH: 'org2.p12',
    PDF_ORG1_PASSWORD: 'test',
    PDF_ORG2_PASSWORD: 'test',
    PDF_ORG1_CERT_SHA256: 'a'.repeat(64),
    PDF_ORG2_CERT_SHA256: 'b'.repeat(64),
  };
  it('requires timestamping and revocation in production certificate mode', () => {
    expect(
      envValidationSchema.validate(certificateConfig).error?.message,
    ).toContain('thu hồi');
  });
  it('requires a trust bundle and endpoint map', () => {
    expect(
      envValidationSchema.validate({
        ...certificateConfig,
        PDF_PKI_ENABLED: true,
      }).error?.message,
    ).toContain('Thiếu cấu hình TSA');
  });
  it('accepts explicitly configured production PKI', () => {
    expect(
      envValidationSchema.validate({
        ...certificateConfig,
        PDF_PKI_ENABLED: true,
        PDF_TSA_URL: 'https://tsa.example.org/tsa',
        PDF_PKI_ALLOWED_HOSTS: 'tsa.example.org',
        PDF_PKI_TRUST_BUNDLE_PATH: 'roots.pem',
        PDF_PKI_ENDPOINTS_PATH: 'endpoints.json',
      }).error,
    ).toBeUndefined();
  });
});
