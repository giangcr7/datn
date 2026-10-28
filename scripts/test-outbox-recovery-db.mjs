import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { config } from 'dotenv';

config({ path: new URL('../apps/api/.env', import.meta.url), quiet: true });
const require = createRequire(import.meta.url);
const { DatabaseService } = require('../apps/api/dist/database/database.service.js');
const { Prisma } = require('../apps/api/dist/generated/prisma/client.js');
const { payloadHash } = require('../apps/api/dist/database/diploma-hash.js');
const { ExplorerService } = require('../apps/api/dist/explorer/explorer.service.js');
const { ExplorerController } = require('../apps/api/dist/explorer/explorer.controller.js');
const { AnchorQueryDto } = require('../apps/api/dist/explorer/anchor-query.dto.js');
const { JwtAuthGuard } = require('../apps/api/dist/auth/jwt.guard.js');
const { OutboxService } = require('../apps/api/dist/outbox/outbox.service.js');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const database = new DatabaseService({ getOrThrow: () => process.env.DATABASE_URL });
const rollback = new Error('ROLLBACK_RECOVERY_FIXTURES');
const institutions = [];
const originalWorkerFlag = process.env.OUTBOX_ENABLED;
process.env.OUTBOX_ENABLED = 'true';
let checks = 0;
function check(label, condition) { assert(condition, label); checks++; }
async function denied(label, operation, status) {
  await assert.rejects(operation, (error) => error.getStatus?.() === status, label);
  checks++;
}

try {
  await database.$transaction(async (transaction) => {
    let savepoint = 0;
    const scoped = new Proxy(transaction, {
      get(target, key) {
        if (key === '$transaction') return async (callback) => {
          const name = 'recovery_' + ++savepoint;
          await transaction.$executeRawUnsafe('SAVEPOINT ' + name);
          try {
            const result = await callback(transaction);
            await transaction.$executeRawUnsafe('RELEASE SAVEPOINT ' + name);
            return result;
          } catch (error) {
            await transaction.$executeRawUnsafe('ROLLBACK TO SAVEPOINT ' + name);
            await transaction.$executeRawUnsafe('RELEASE SAVEPOINT ' + name);
            throw error;
          }
        };
        return target[key];
      },
    });
    async function school() {
      const institution = await transaction.institution.create({ data: { code: 'REC_' + randomUUID().slice(0, 24), name: 'Recovery fixture' } });
      institutions.push(institution.id);
      const campus = await transaction.campus.create({ data: { institutionId: institution.id, code: 'MAIN', name: 'Main campus', isHeadquarters: true, fabricMspId: 'Recovery_' + randomUUID() } });
      const account = await transaction.account.create({ data: { email: randomUUID() + '@example.test', displayName: 'Recovery officer', passwordHash: 'not-a-login-secret' } });
      await transaction.accountMembership.create({ data: { accountId: account.id, campusId: campus.id, role: 'UNIVERSITY', canApproveDiplomas: true } });
      const program = await transaction.program.create({ data: { institutionId: institution.id, code: 'IT', name: 'Information Technology' } });
      return { institution, campus, account, program, actor: { id: account.id, email: account.email, role: 'university', institutionId: institution.id, campusId: campus.id, isHeadquarters: true, canApproveDiplomas: true } };
    }
    const main = await school();
    const foreign = await school();
    let sequence = 0;
    async function fixture(options = {}) {
      const target = options.school || main;
      const number = ++sequence;
      const student = await transaction.student.create({ data: { institutionId: target.institution.id, studentCode: 'REC-' + number, fullName: 'Recovery fixture ' + number } });
      const graduation = await transaction.graduationRecord.create({ data: { institutionId: target.institution.id, studentId: student.id, programId: target.program.id, graduationYear: 2025 } });
      const diploma = await transaction.diploma.create({ data: {
        institutionId: target.institution.id, campusId: target.campus.id, issuingCampusId: target.campus.id,
        graduationId: options.previous?.diploma.graduationId || graduation.id, certificateNo: 'REC-VB-' + number, registryNo: 'REC-VS-' + number, issuedOn: new Date('2025-01-01'),
        status: options.status || 'ACTIVE', workflowStatus: 'APPROVED', requestedById: target.account.id, requestedAt: new Date(),
        approvedById: target.account.id, approvedAt: new Date(), revokedReason: options.reason || null,
        ...(options.previous ? { supersedesId: options.previous.diploma.id, replacementData: { previousVersion: 1 } } : {}),
      } });
      const payload = { uuid: diploma.id, version: 1, schemaVersion: 'diploma-v1', institutionId: target.institution.id };
      const version = await transaction.diplomaVersion.create({ data: { diplomaId: diploma.id, version: 1, schemaVersion: 'diploma-v1', payload, payloadHash: payloadHash(payload) } });
      const eventType = options.eventType || 'ISSUE';
      if (eventType === 'REVOKE') await transaction.blockchainAnchor.create({ data: {
        versionId: version.id, eventType: 'ISSUE', status: 'COMMITTED', channel: 'recovery', chaincode: 'educert',
        payloadHash: version.payloadHash, issuerMspId: target.campus.fabricMspId, transactionId: 'issued-' + randomUUID(), committedAt: new Date(),
      } });
      const anchor = await transaction.blockchainAnchor.create({ data: {
        versionId: version.id, eventType, status: 'FAILED', channel: 'recovery', chaincode: 'educert',
        payloadHash: version.payloadHash, issuerMspId: target.campus.fabricMspId, lastError: 'Commit response lost',
      } });
      const event = await transaction.outboxEvent.create({ data: {
        versionId: version.id, eventType, status: 'FAILED', attempts: 10, lastError: 'Commit response lost',
        payload: { uuid: diploma.id, version: 1, schemaVersion: 'diploma-v1', payloadHash: version.payloadHash, issuerMspId: target.campus.fabricMspId, ...(eventType === 'REVOKE' ? { reasonHash: payloadHash({ reason: options.reason }) } : {}) },
      } });
      return { diploma, version, anchor, event };
    }
    const fabricCalls = [];
    const fabric = {
      enabled: true, channel: 'recovery', chaincode: 'educert', checkConnection: async () => ({ connected: true }),
      executeForMsp: async (...args) => {
        fabricCalls.push(args);
        const version = await transaction.diplomaVersion.findFirstOrThrow({ where: { diplomaId: args[3] } });
        return { blockNumber: '9999', payload: JSON.stringify({ success: true, txId: 'original-' + args[3], hash: version.payloadHash, idempotent: true }) };
      },
    };
    const service = new ExplorerService(scoped, fabric);
    const list = (status = 'EXHAUSTED', eventType) => service.getAnchors(Object.assign(new AnchorQueryDto(), { status, eventType }), main.actor);
    const getEntry = async (record) => (await list()).data.find((entry) => entry.id === record.anchor.id);
    const body = async (record) => ({ reason: 'Đã kiểm tra và khôi phục kết nối', expectedRetryToken: (await getEntry(record)).outbox.retryToken });
    const record = await fixture();
    const foreignRecord = await fixture({ school: foreign });
    check('exhausted filter is institution scoped', (await list()).pagination.total === 1);
    check('operation filter excludes exhausted ISSUE for REVOKE view', (await list('EXHAUSTED', 'REVOKE')).pagination.total === 0);
    await denied('cross-institution request hidden', async () => service.retryAnchor(foreignRecord.anchor.id, await body(record), main.actor), 404);
    const beforePayload = JSON.stringify(record.event.payload);
    const beforeVersion = JSON.stringify(await transaction.diplomaVersion.findUnique({ where: { id: record.version.id } }));
    const firstBody = await body(record);
    const result = await service.retryAnchor(record.anchor.id, firstBody, main.actor, '127.0.0.1');
    const queued = await transaction.outboxEvent.findUniqueOrThrow({ where: { id: record.event.id } });
    check('same task requeued with a fresh bounded attempt cycle', queued.status === 'PENDING' && queued.attempts === 0 && queued.lastError === null);
    check('original submission identity and payload unchanged', JSON.stringify(queued.payload) === beforePayload && result.anchor.status === 'QUEUED');
    check('signed version remains byte-for-byte unchanged', JSON.stringify(await transaction.diplomaVersion.findUnique({ where: { id: record.version.id } })) === beforeVersion);
    check('previous failure retained in visible history', result.anchor.retryHistory[0].previousAttempts === 10 && result.anchor.retryHistory[0].previousError === 'Commit response lost');
    await denied('double click does not requeue again', () => service.retryAnchor(record.anchor.id, firstBody, main.actor), 409);
    check('exactly one audit event persisted', await transaction.auditLog.count({ where: { action: 'RETRY_BLOCKCHAIN', target: record.diploma.id } }) === 1);
    check('exhausted listing removes recovered task', (await list()).pagination.total === 0);
    check('manual request never submits to Fabric', fabricCalls.length === 0);

    function workerFor(record, implementation = fabric) {
      const isolated = new Proxy(scoped, { get(target, key) {
        if (key === '$queryRaw') return (strings, ...values) => {
          const position = strings[0].indexOf('ORDER BY candidate_event.created_at');
          assert(position >= 0, 'only the worker claim query is isolated');
          return transaction.$queryRaw(Prisma.sql([
            strings[0].slice(0, position) + ' AND candidate_event.id = ',
            '::uuid ' + strings[0].slice(position), ...strings.slice(1),
          ], record.event.id, ...values));
        };
        return target[key];
      } });
      return new OutboxService(isolated, implementation);
    }
    await transaction.outboxEvent.update({ where: { id: record.event.id }, data: { availableAt: new Date('2000-01-01') } });
    check('recovered task claimed by the normal worker', await workerFor(record).processOne());
    const committed = await transaction.blockchainAnchor.findUniqueOrThrow({ where: { id: record.anchor.id } });
    check('lost-response retry preserves the original chain transaction ID without inventing block evidence', committed.status === 'COMMITTED' && committed.transactionId === 'original-' + record.diploma.id && committed.blockNumber === null);
    check('original MSP and immutable arguments reused', fabricCalls[0][0] === main.campus.fabricMspId && fabricCalls[0][3] === record.diploma.id && fabricCalls[0][6] === record.version.payloadHash);
    await denied('committed task cannot be retried manually', () => service.retryAnchor(record.anchor.id, firstBody, main.actor), 409);

    const abandoned = await fixture();
    await transaction.blockchainAnchor.update({ where: { id: abandoned.anchor.id }, data: { status: 'QUEUED' } });
    await transaction.outboxEvent.update({ where: { id: abandoned.event.id }, data: { status: 'PROCESSING', lockedUntil: new Date('2000-01-01'), lockToken: randomUUID(), lastError: null } });
    const callsBeforeAbandoned = fabricCalls.length;
    check('expired last-attempt lease is processed without another submit', await workerFor(abandoned).processOne() && fabricCalls.length === callsBeforeAbandoned);
    const abandonedEvent = await transaction.outboxEvent.findUniqueOrThrow({ where: { id: abandoned.event.id } });
    check('expired final lease becomes exhausted with cleared fencing token', abandonedEvent.status === 'FAILED' && abandonedEvent.attempts === 10 && abandonedEvent.lockToken === null && abandonedEvent.lockedUntil === null);
    check('expired final lease records unknown commit evidence', abandonedEvent.lastError.includes('commit status unknown'));
    const abandonedAnchor = await transaction.blockchainAnchor.findUniqueOrThrow({ where: { id: abandoned.anchor.id } });
    check('expired final lease atomically marks its anchor failed without a transaction ID', abandonedAnchor.status === 'FAILED' && abandonedAnchor.lastError === abandonedEvent.lastError && abandonedAnchor.transactionId === null);
    await service.retryAnchor(abandoned.anchor.id, await body(abandoned), main.actor);

    const exhaustedAgain = await fixture();
    await transaction.outboxEvent.update({ where: { id: exhaustedAgain.event.id }, data: { status: 'PENDING', attempts: 9, availableAt: new Date('2000-01-01') } });
    const failureWorker = workerFor(exhaustedAgain, { ...fabric, executeForMsp: async () => { throw new Error('Peer unavailable'); } });
    await failureWorker.processOne();
    const dead = await transaction.outboxEvent.findUniqueOrThrow({ where: { id: exhaustedAgain.event.id } });
    check('tenth failed attempt becomes dead letter', dead.status === 'FAILED' && dead.attempts === 10);
    check('dead-letter tasks are never claimed automatically', await failureWorker.processOne() === false);
    const deadBody = await body(exhaustedAgain);
    await service.retryAnchor(exhaustedAgain.anchor.id, deadBody, main.actor);
    await transaction.outboxEvent.update({ where: { id: exhaustedAgain.event.id }, data: { status: 'FAILED', attempts: 10, lastError: 'Peer unavailable again', availableAt: new Date('2026-10-28T05:00:00Z') } });
    await transaction.blockchainAnchor.update({ where: { id: exhaustedAgain.anchor.id }, data: { status: 'FAILED' } });
    await denied('a prior cycle token cannot authorize a later cycle', () => service.retryAnchor(exhaustedAgain.anchor.id, deadBody, main.actor), 409);
    await service.retryAnchor(exhaustedAgain.anchor.id, await body(exhaustedAgain), main.actor);
    check('multiple recovery cycles retain separate attempt/error history', await transaction.diplomaEvent.count({ where: { diplomaId: exhaustedAgain.diploma.id, eventType: 'ANCHOR_RETRY_REQUESTED' } }) === 2);

    const revoke = await fixture({ eventType: 'REVOKE', status: 'SUPERSEDED', reason: 'Sửa sai văn bằng' });
    const replacement = await fixture({ previous: revoke });
    await denied('replacement ISSUE waits for exact predecessor revocation', async () => service.retryAnchor(replacement.anchor.id, await body(replacement), main.actor), 409);
    await service.retryAnchor(revoke.anchor.id, await body(revoke), main.actor);
    await transaction.outboxEvent.update({ where: { id: revoke.event.id }, data: { availableAt: new Date('2000-01-01') } });
    check('superseded predecessor REVOKE can recover via original worker', await workerFor(revoke).processOne());
    await service.retryAnchor(replacement.anchor.id, await body(replacement), main.actor);
    check('replacement recovery allowed only after predecessor commit', (await transaction.outboxEvent.findUnique({ where: { id: replacement.event.id } })).status === 'PENDING');

    const auditFailure = await fixture();
    const failingDatabase = new Proxy(scoped, { get(target, key) {
      if (key === '$transaction') return (callback) => scoped.$transaction((inner) => callback(new Proxy(inner, { get(client, model) {
        if (model === 'auditLog') return { create: async () => { throw new Error('Audit unavailable'); } };
        return client[model];
      } })));
      return target[key];
    } });
    await assert.rejects(async () => new ExplorerService(failingDatabase, fabric).retryAnchor(auditFailure.anchor.id, await body(auditFailure), main.actor), /Audit unavailable/);
    check('audit failure rolls back requeue and diploma history', (await transaction.outboxEvent.findUnique({ where: { id: auditFailure.event.id } })).status === 'FAILED' && await transaction.diplomaEvent.count({ where: { diplomaId: auditFailure.diploma.id, eventType: 'ANCHOR_RETRY_REQUESTED' } }) === 0);

    const httpRecord = await fixture();
    let httpActor = main.actor;
    const module = await Test.createTestingModule({ controllers: [ExplorerController], providers: [{ provide: ExplorerService, useValue: service }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate(context) {
        if (!httpActor) return false;
        context.switchToHttp().getRequest().user = httpActor; return true;
      } }).compile();
    const app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.listen(0, '127.0.0.1');
    const base = await app.getUrl();
    const post = (id, data) => fetch(base + '/explorer/anchors/' + id + '/retry', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    try {
      const data = await body(httpRecord);
      check('HTTP rejects invalid UUID', (await post('invalid', data)).status === 400);
      for (const invalid of [{ ...data, reason: '    ' }, { ...data, reason: 'a'.repeat(2001) }, { ...data, expectedRetryToken: 'bad' }, { ...data, force: true }])
        check('HTTP validates reason, token and rejects extra fields', (await post(httpRecord.anchor.id, invalid)).status === 400);
      for (const flags of [{ role: 'student' }, { role: 'employer' }, { isHeadquarters: false }, { canApproveDiplomas: false }]) {
        httpActor = { ...main.actor, ...flags };
        check('HTTP denies unprivileged actors ' + JSON.stringify(flags), (await post(httpRecord.anchor.id, data)).status === 403);
      }
      httpActor = foreign.actor;
      check('HTTP hides foreign-school task', (await post(httpRecord.anchor.id, data)).status === 404);
      httpActor = main.actor;
      fabric.enabled = false;
      check('HTTP refuses recovery with Fabric disabled', (await post(httpRecord.anchor.id, data)).status === 503);
      fabric.enabled = true;
      httpActor = { ...main.actor, role: 'admin', canApproveDiplomas: false };
      check('technical admin can request recovery without approval authority', (await post(httpRecord.anchor.id, data)).status === 201);
      check('HTTP stale resubmission returns conflict', (await post(httpRecord.anchor.id, data)).status === 409);
      httpActor = null;
      check('HTTP blocks missing session', (await post(httpRecord.anchor.id, data)).status === 403);
    } finally { await app.close(); }
    throw rollback;
  }, { timeout: 90000 });
} catch (error) { if (error !== rollback) throw error; }
finally {
  if (originalWorkerFlag === undefined) delete process.env.OUTBOX_ENABLED;
  else process.env.OUTBOX_ENABLED = originalWorkerFlag;
  try { check('all test institutions rolled back', await database.institution.count({ where: { id: { in: institutions } } }) === 0); }
  finally { await database.$disconnect(); }
}
console.log('Outbox recovery database/HTTP/worker checks passed: ' + checks + '. Fixtures rolled back; no real Fabric submissions.');
