import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { JwtService } from '@nestjs/jwt';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

type RequestIdentity = {
  ip?: string;
  path?: string;
  method?: string;
  headers?: Record<string, unknown>;
  body?: Record<string, unknown>;
};

const authPost = (request: RequestIdentity) =>
  request.method === 'POST' && request.path?.startsWith('/api/auth/');
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');

function verifiedAccountId(jwt: JwtService, authorization: unknown) {
  if (typeof authorization !== 'string' || !authorization.startsWith('Bearer '))
    return undefined;
  try {
    const payload = jwt.verify<{ id?: string; sessionId?: string }>(
      authorization.slice(7),
      { algorithms: ['HS256'] },
    );
    return typeof payload.id === 'string' &&
      typeof payload.sessionId === 'string'
      ? payload.id
      : undefined;
  } catch {
    return undefined;
  }
}

export function requestRateLimits(secret: string): ThrottlerModuleOptions {
  const jwt = new JwtService({ secret });
  return {
    getTracker: (request: RequestIdentity) => {
      if (authPost(request)) {
        const email = request.body?.email;
        if (typeof email === 'string' && email.trim() && email.length <= 320)
          return 'email:' + digest(email.trim().toLowerCase());
      }
      const accountId = verifiedAccountId(jwt, request.headers?.authorization);
      if (accountId) return 'account:' + digest(accountId);
      if (authPost(request)) {
        const refresh = request.body?.refreshToken;
        if (typeof refresh === 'string' && /^[0-9a-f]{80}$/.test(refresh))
          return 'refresh:' + digest(refresh);
      }
      return 'ip:' + (request.ip || 'unknown');
    },
    throttlers: [
      { name: 'short', ttl: 1000, limit: 5 },
      { name: 'medium', ttl: 60000, limit: 60 },
      {
        name: 'auth-ip',
        ttl: 60000,
        limit: 300,
        skipIf: (context) => !authPost(context.switchToHttp().getRequest()),
        getTracker: (request: RequestIdentity) =>
          'ip:' + (request.ip || 'unknown'),
      },
    ],
  };
}

export function trustedProxyRanges(value?: string): false | string[] {
  if (!value?.trim()) return false;
  const ranges = value.split(',').map((range) => range.trim());
  for (const range of ranges) {
    const [address, bits, extra] = range.split('/');
    const family = isIP(address);
    if (
      !family ||
      extra !== undefined ||
      (bits !== undefined &&
        (!/^\d+$/.test(bits) ||
          Number(bits) < 1 ||
          Number(bits) > (family === 4 ? 32 : 128)))
    )
      throw new Error(
        'TRUSTED_PROXY_CIDRS chỉ nhận địa chỉ IP hoặc CIDR cụ thể',
      );
  }
  return ranges;
}
