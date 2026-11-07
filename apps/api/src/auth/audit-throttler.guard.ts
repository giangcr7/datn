import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  type ThrottlerLimitDetail,
  type ThrottlerModuleOptions,
  type ThrottlerStorage,
} from '@nestjs/throttler';
import type { Request } from 'express';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class AuditThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storage: ThrottlerStorage,
    reflector: Reflector,
    private readonly audit: AuditService,
  ) {
    super(options, storage, reflector);
  }

  protected async throwThrottlingException(
    context: import('@nestjs/common').ExecutionContext,
    detail: ThrottlerLimitDetail,
  ) {
    const request = context.switchToHttp().getRequest<
      Request & {
        body?: Record<string, unknown>;
      }
    >();
    const email = request.body?.email;
    const institutionId =
      typeof email === 'string'
        ? await this.audit.institutionIdForEmail(email)
        : undefined;
    await this.audit.log({
      institutionId,
      userEmail: typeof email === 'string' && email.trim() ? email : 'unknown',
      action: 'RATE_LIMITED',
      result: 'FAILED',
      target: request.originalUrl || request.url,
      ip: request.ip,
      userAgent: request.get('user-agent'),
      errorMessage: 'Request bị chặn do vượt giới hạn tần suất',
      metadata: {
        method: request.method,
        route: request.originalUrl || request.url,
        throttler: 'request',
        limit: detail.limit,
        ttlSeconds: Math.ceil(detail.ttl / 1000),
        retryAfterSeconds: detail.timeToBlockExpire
          ? Math.ceil(detail.timeToBlockExpire / 1000)
          : null,
      },
    });
    return super.throwThrottlingException(context, detail);
  }
}
