import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { BlockList, isIP } from 'node:net';

export type PkiFailure =
  | 'UNAVAILABLE'
  | 'INVALID'
  | 'STALE'
  | 'REVOKED'
  | 'UNKNOWN'
  | 'NOT_CONFIGURED';

export class PkiError extends Error {
  constructor(
    public readonly code: PkiFailure,
    message: string,
  ) {
    super(message);
  }
}

const privateNetworks = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 3],
] as const)
  privateNetworks.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of [
  ['::', 96],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['2001:db8::', 32],
  ['2001::', 32],
  ['2002::', 16],
  ['64:ff9b::', 96],
] as const)
  privateNetworks.addSubnet(address, prefix, 'ipv6');

export function isPublicPkiAddress(address: string) {
  const normalized = address.replace(/^::ffff:/i, '');
  const family = isIP(normalized);
  return (
    !!family &&
    !privateNetworks.check(normalized, family === 4 ? 'ipv4' : 'ipv6')
  );
}

export function pkiEndpoint(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PkiError('NOT_CONFIGURED', 'Địa chỉ dịch vụ PKI không hợp lệ');
  }
  const allowed = (process.env.PDF_PKI_ALLOWED_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hash ||
    !allowed.includes(url.host.toLowerCase())
  )
    throw new PkiError(
      'NOT_CONFIGURED',
      'Dịch vụ PKI phải nằm trong danh sách host được cho phép',
    );
  return url;
}

export async function pkiRequest(
  value: string,
  body?: Uint8Array,
  contentType?: string,
) {
  const url = pkiEndpoint(value);
  const timeout = Number(process.env.PDF_PKI_TIMEOUT_MS || 5000);
  const maximumBytes = 5 * 1024 * 1024;
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const demo =
    process.env.PDF_SIGNING_MODE === 'demo' &&
    process.env.NODE_ENV !== 'production';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const controller = new AbortController();
  try {
    timer = setTimeout(() => controller.abort(), timeout);
    const addresses = await Promise.race([
      lookup(hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) =>
        controller.signal.addEventListener(
          'abort',
          () =>
            reject(
              new PkiError('UNAVAILABLE', 'Dịch vụ PKI hết thời gian phản hồi'),
            ),
          { once: true },
        ),
      ),
    ]);
    if (
      !addresses.length ||
      addresses.some(
        (entry) =>
          !isPublicPkiAddress(entry.address) &&
          !(demo && ['127.0.0.1', '::1'].includes(entry.address)),
      )
    )
      throw new PkiError(
        'INVALID',
        'Chặn dịch vụ PKI trỏ tới địa chỉ mạng nội bộ',
      );
    if (controller.signal.aborted)
      throw new PkiError('UNAVAILABLE', 'Dịch vụ PKI hết thời gian phản hồi');
    return await new Promise<Buffer>((resolve, reject) => {
      const transport = url.protocol === 'https:' ? httpsRequest : httpRequest;
      const request = transport(
        url,
        {
          method: body ? 'POST' : 'GET',
          agent: false,
          signal: controller.signal,
          headers: body
            ? {
                'Content-Type': contentType || 'application/octet-stream',
                'Content-Length': body.byteLength,
              }
            : {},
          lookup: ((
            _: string,
            options: { all?: boolean },
            callback: (...args: any[]) => void,
          ) => {
            if (options.all) callback(null, addresses);
            else callback(null, addresses[0].address, addresses[0].family);
          }) as never,
        },
        (response) => {
          if (response.statusCode !== 200) {
            response.resume();
            reject(
              new PkiError(
                'UNAVAILABLE',
                'Dịch vụ PKI không trả kết quả thành công; không theo redirect',
              ),
            );
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > maximumBytes)
              response.destroy(
                new PkiError('INVALID', 'Phản hồi PKI vượt quá 5 MB'),
              );
            else chunks.push(chunk);
          });
          response.on('end', () => resolve(Buffer.concat(chunks)));
          response.on('error', reject);
        },
      );
      request.on('error', reject);
      request.end(body ? Buffer.from(body) : undefined);
    });
  } catch (error) {
    if (error instanceof PkiError) throw error;
    throw new PkiError(
      'UNAVAILABLE',
      'Không kết nối được dịch vụ PKI hoặc kết nối hết thời gian',
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}
