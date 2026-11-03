import { randomBytes } from 'node:crypto';
import type { Server } from 'node:http';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { requestRateLimits, trustedProxyRanges } from './rate-limit';

const secret = randomBytes(32).toString('hex');
const options = () =>
  requestRateLimits(secret) as Exclude<
    ReturnType<typeof requestRateLimits>,
    unknown[]
  >;

describe('proxy-aware request identities', () => {
  const tracker = options().getTracker!;
  const login = (email: unknown, ip = '127.0.0.1') => ({
    method: 'POST',
    path: '/api/auth/login',
    ip,
    body: { email },
  });

  it('separates two login accounts behind the same web server', async () => {
    expect(await tracker(login('one@example.invalid'), {} as never)).not.toBe(
      await tracker(login('two@example.invalid'), {} as never),
    );
  });
  it('normalizes the target account and does not reset its budget when the IP changes', async () => {
    expect(await tracker(login(' One@Example.invalid '), {} as never)).toBe(
      await tracker(login('one@example.invalid', '192.0.2.10'), {} as never),
    );
  });
  it('does not let a bearer token change the target login account budget', async () => {
    const jwt = new JwtService({ secret });
    const token = jwt.sign({
      id: 'another-account',
      sessionId: 'fixture-family',
    });
    expect(
      await tracker(
        {
          ...login('one@example.invalid'),
          headers: { authorization: 'Bearer ' + token },
        },
        {} as never,
      ),
    ).toBe(await tracker(login('one@example.invalid'), {} as never));
  });
  it('separates authenticated users without trusting unverified JWT claims', async () => {
    const jwt = new JwtService({ secret });
    const first = jwt.sign({ id: 'account-one', sessionId: 'family-one' });
    const second = jwt.sign({ id: 'account-two', sessionId: 'family-two' });
    const identity = (token: string) => ({
      ip: '127.0.0.1',
      headers: { authorization: 'Bearer ' + token },
    });
    expect(await tracker(identity(first), {} as never)).not.toBe(
      await tracker(identity(second), {} as never),
    );
    const forged = new JwtService({
      secret: 'a different signing secret',
    }).sign({ id: 'account-one', sessionId: 'family-one' });
    expect(await tracker(identity(forged), {} as never)).toBe('ip:127.0.0.1');
  });
  it('does not use a client-supplied forwarded header as a trusted IP', async () => {
    expect(
      await tracker(
        { ip: '127.0.0.1', headers: { 'x-forwarded-for': '192.0.2.10' } },
        {} as never,
      ),
    ).toBe('ip:127.0.0.1');
  });
  it('disables proxy trust unless explicit IP ranges are configured', () => {
    expect(trustedProxyRanges()).toBe(false);
    expect(trustedProxyRanges('127.0.0.1/32,::1/128')).toEqual([
      '127.0.0.1/32',
      '::1/128',
    ]);
  });
  it.each([
    'true',
    '1',
    '*',
    'loopback',
    '0.0.0.0/0',
    '::/0',
    '127.0.0.1/99',
    '127.0.0.1,',
    '127.0.0.1/24/1',
  ])('rejects ambiguous proxy trust: %s', (value) => {
    expect(() => trustedProxyRanges(value)).toThrow();
  });
});

describe('HTTP login rate limit isolation', () => {
  let app: INestApplication<Server>;
  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot(requestRateLimits(secret))],
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: { login: jest.fn().mockResolvedValue({ success: true }) },
        },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();
    app = module.createNestApplication<INestApplication<Server>>();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });
  afterEach(async () => {
    await app?.close();
  });

  it('blocks a sixth attempt but does not block a different account behind the same proxy', async () => {
    for (let attempt = 0; attempt < 5; attempt++)
      await request(app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', '192.0.2.' + (attempt + 1))
        .send({
          email: 'one@example.invalid',
          password: 'fixture',
          role: 'university',
        })
        .expect(201);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'ONE@example.invalid',
        password: 'fixture',
        role: 'university',
      })
      .expect(429);
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        email: 'two@example.invalid',
        password: 'fixture',
        role: 'university',
      })
      .expect(201);
  });
});
