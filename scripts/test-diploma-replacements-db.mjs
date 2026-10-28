import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { config } from 'dotenv';

config({ path: new URL('../apps/api/.env', import.meta.url), quiet: true });
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require('../apps/api/dist/database/database.service.js');
const {
  diplomaInclude,
  diplomaProjection,
} = require('../apps/api/dist/database/diploma-projection.js');
const {
  diplomaPayload,
  payloadHash,
} = require('../apps/api/dist/database/diploma-hash.js');
const { Prisma } = require('../apps/api/dist/generated/prisma/client.js');
const { CertService } = require('../apps/api/dist/cert/cert.service.js');
const {
  CorrectionService,
} = require('../apps/api/dist/cert/correction.service.js');
const {
  ReplacementService,
} = require('../apps/api/dist/cert/replacement.service.js');
const {
  ReplacementQueryDto,
} = require('../apps/api/dist/cert/replacement.dto.js');
const { CertModule } = require('../apps/api/dist/cert/cert.module.js');
const { JwtAuthGuard } = require('../apps/api/dist/auth/jwt.guard.js');
const { OutboxService } = require('../apps/api/dist/outbox/outbox.service.js');
const { VerifyService } = require('../apps/api/dist/verify/verify.service.js');
const { Test } = require('@nestjs/testing');
const { ValidationPipe } = require('@nestjs/common');
const database = new DatabaseService({
  getOrThrow: () => process.env.DATABASE_URL,
});
const rollback = new Error('ROLLBACK_REPLACEMENT_FIXTURES');
const institutions = [];
let checks = 0;
function check(label, value) {
  assert(value, label);
  checks++;
}
async function denied(label, operation, status) {
  await assert.rejects(
    operation,
    (error) => error.getStatus?.() === status,
    label,
  );
  checks++;
}

try {
  await database.$transaction(
    async (transaction) => {
      let savepoint = 0;
      const scoped = new Proxy(transaction, {
        get(target, key) {
          if (key === '$transaction')
            return async (callback) => {
              const name = 'replacement_' + ++savepoint;
              await transaction.$executeRawUnsafe('SAVEPOINT ' + name);
              try {
                const result = await callback(transaction);
                await transaction.$executeRawUnsafe(
                  'RELEASE SAVEPOINT ' + name,
                );
                return result;
              } catch (error) {
                await transaction.$executeRawUnsafe(
                  'ROLLBACK TO SAVEPOINT ' + name,
                );
                await transaction.$executeRawUnsafe(
                  'RELEASE SAVEPOINT ' + name,
                );
                throw error;
              }
            };
          return target[key];
        },
      });
      async function school() {
        const institution = await transaction.institution.create({
          data: {
            code: 'FIX_' + randomUUID().slice(0, 24),
            name: 'Trường kiểm thử',
            nameEn: 'Replacement University',
          },
        });
        institutions.push(institution.id);
        const campus = await transaction.campus.create({
          data: {
            institutionId: institution.id,
            code: 'MAIN',
            name: 'Cơ sở chính',
            isHeadquarters: true,
            fabricMspId: 'Fixture_' + randomUUID(),
          },
        });
        const account = await transaction.account.create({
          data: {
            email: randomUUID() + '@example.test',
            displayName: 'Cán bộ',
            passwordHash: 'not-a-login-secret',
          },
        });
        await transaction.accountMembership.create({
          data: {
            accountId: account.id,
            campusId: campus.id,
            role: 'UNIVERSITY',
            canApproveDiplomas: true,
          },
        });
        const program = await transaction.program.create({
          data: {
            institutionId: institution.id,
            code: 'IT',
            name: 'Công nghệ thông tin',
            nameEn: 'Information Technology',
          },
        });
        return {
          institution,
          campus,
          account,
          program,
          actor: {
            id: account.id,
            email: account.email,
            role: 'university',
            institutionId: institution.id,
            campusId: campus.id,
            isHeadquarters: true,
            canApproveDiplomas: true,
          },
        };
      }
      const main = await school();
      const foreign = await school();
      let sequence = 0;
      const load = (uuid) =>
        transaction.diploma.findUniqueOrThrow({
          where: { id: uuid },
          include: diplomaInclude,
        });
      const view = async (uuid) => diplomaProjection(await load(uuid));
      async function issued(target = main) {
        const number = ++sequence;
        const student = await transaction.student.create({
          data: {
            institutionId: target.institution.id,
            studentCode: String(number).padStart(10, '0'),
            fullName: 'Nguyễn Văn Gốc ' + number,
            dateOfBirth: new Date('2000-01-01'),
          },
        });
        const graduation = await transaction.graduationRecord.create({
          data: {
            institutionId: target.institution.id,
            studentId: student.id,
            programId: target.program.id,
            graduationYear: 2024,
            gpa: 3.2,
            classification: 'GOOD',
            degreeType: 'ENGINEER',
          },
        });
        const diploma = await transaction.diploma.create({
          data: {
            institutionId: target.institution.id,
            campusId: target.campus.id,
            issuingCampusId: target.campus.id,
            graduationId: graduation.id,
            certificateNo: '000VB' + number,
            registryNo: '000VS' + number,
            issuedOn: new Date('2024-06-01'),
            status: 'ACTIVE',
            workflowStatus: 'APPROVED',
            approvedById: target.account.id,
            approvedAt: new Date(),
            requestedById: target.account.id,
            requestedAt: new Date(),
            printTemplate: 'tlu-bilingual-v1',
            majorNameEn: 'Information Technology',
            issuePlace: 'TP. Hồ Chí Minh',
            diplomaSignerName: 'Nguyễn Văn A',
            diplomaSignerTitle: 'HIỆU TRƯỞNG',
          },
        });
        const payload = diplomaPayload(await load(diploma.id));
        const version = await transaction.diplomaVersion.create({
          data: {
            diplomaId: diploma.id,
            version: 1,
            schemaVersion: 'diploma-v1',
            payload,
            payloadHash: payloadHash(payload),
            createdById: target.account.id,
          },
        });
        await transaction.blockchainAnchor.create({
          data: {
            versionId: version.id,
            eventType: 'ISSUE',
            status: 'COMMITTED',
            channel: 'test',
            chaincode: 'test',
            payloadHash: version.payloadHash,
            issuerMspId: target.campus.fabricMspId,
            transactionId: 'fixture_' + randomUUID(),
            committedAt: new Date(),
          },
        });
        await transaction.outboxEvent.create({
          data: {
            versionId: version.id,
            eventType: 'ISSUE',
            status: 'COMPLETED',
            completedAt: new Date(),
            payload: {},
          },
        });
        return { diploma, version, student, graduation };
      }
      let signingFails = false;
      const signatures = {
        prepareFinal: async (_transaction, record) => {
          if (signingFails) throw new Error('Simulated signing failure');
          return { payload: diplomaPayload(record) };
        },
        attachVersion: async () => undefined,
      };
      const cert = new CertService(scoped, signatures);
      const service = new ReplacementService(scoped, cert);
      const query = (stage = 'DRAFT', extra = {}) =>
        Object.assign(new ReplacementQueryDto(), { stage, ...extra });
      const list = (stage) => service.list(query(stage), main.actor);
      const action = async (uuid) => ({
        note: 'Đã đối chiếu quyết định thay thế',
        expectedUpdatedAt: (await load(uuid)).updatedAt.toISOString(),
      });
      const createBody = async (uuid) => ({
        ...(await action(uuid)),
        basis: 'Quyết định 10/QĐ-TH ngày 01/10/2026',
        soHieu: '000NEW' + ++sequence,
        soVaoSo: '000NEWS' + sequence,
        issueDate: '2026-10-01',
      });
      const source = await issued();
      const other = await issued(foreign);
      const originalPayload = JSON.stringify(source.version.payload);
      const originalStudent = JSON.stringify(source.student);
      const originalGraduation = JSON.stringify(source.graduation);
      for (const flags of [
        { role: 'admin' },
        { role: 'student' },
        { canApproveDiplomas: false },
        { isHeadquarters: false },
        { campusId: undefined },
      ]) {
        await denied(
          'list authority ' + JSON.stringify(flags),
          () => service.list(query(), { ...main.actor, ...flags }),
          403,
        );
        await denied(
          'create authority ' + JSON.stringify(flags),
          async () =>
            service.create(
              source.diploma.id,
              await createBody(source.diploma.id),
              { ...main.actor, ...flags },
            ),
          403,
        );
      }
      await denied(
        'cross-institution source is hidden',
        async () =>
          service.create(
            other.diploma.id,
            await createBody(other.diploma.id),
            main.actor,
          ),
        404,
      );
      await denied(
        'cannot reuse certificate number',
        async () =>
          service.create(
            source.diploma.id,
            {
              ...(await createBody(source.diploma.id)),
              soHieu: source.diploma.certificateNo,
            },
            main.actor,
          ),
        400,
      );
      await denied(
        'cannot issue before old document',
        async () =>
          service.create(
            source.diploma.id,
            {
              ...(await createBody(source.diploma.id)),
              issueDate: '2024-01-01',
            },
            main.actor,
          ),
        400,
      );
      await denied(
        'basis cannot be blank',
        async () =>
          service.create(
            source.diploma.id,
            { ...(await createBody(source.diploma.id)), basis: '   ' },
            main.actor,
          ),
        400,
      );
      const created = await service.create(
        source.diploma.id,
        await createBody(source.diploma.id),
        main.actor,
      );
      const uuid = created.uuid;
      check(
        'separate draft and immutable predecessor reference',
        uuid !== source.diploma.id &&
          (await view(uuid)).replacementReference.payloadHash ===
            source.version.payloadHash,
      );
      check(
        'draft does not retire original or create a new anchor',
        (await load(source.diploma.id)).status === 'ACTIVE' &&
          (await load(uuid)).versions.length === 0,
      );
      check(
        'draft list and total agree',
        (await list('DRAFT')).pagination.total === 1 &&
          (await list('DRAFT')).data[0].uuid === uuid,
      );
      await denied(
        'one replacement request per predecessor',
        async () =>
          service.create(
            source.diploma.id,
            await createBody(source.diploma.id),
            main.actor,
          ),
        409,
      );
      await denied(
        'generic submit cannot bypass dedicated review',
        () => cert.submitDraft(uuid, undefined, main.actor),
        409,
      );
      const edit = async () => {
        const current = await view(uuid);
        return {
          ...current.printedDiploma,
          ...(await action(uuid)),
          fullName: current.fullName,
          dob: current.dob,
          programId: current.programId,
          namTotNghiep: current.namTotNghiep,
          grade: current.grade,
          gpa: current.gpa,
          degreeType: current.degreeType,
          className: current.className,
          soHieu: current.soHieu,
          soVaoSo: current.soVaoSo,
          issueDate: current.issueDate,
        };
      };
      await denied(
        'foreign program rejected',
        async () =>
          service.revise(
            uuid,
            { ...(await edit()), programId: foreign.program.id },
            main.actor,
          ),
        400,
      );
      await denied(
        'invalid GPA rejected',
        async () =>
          service.revise(uuid, { ...(await edit()), gpa: 9 }, main.actor),
        400,
      );
      await denied(
        'future date rejected',
        async () =>
          service.revise(
            uuid,
            { ...(await edit()), issueDate: '2099-01-01' },
            main.actor,
          ),
        400,
      );
      await denied(
        'stale edit rejected',
        async () =>
          service.revise(
            uuid,
            { ...(await edit()), expectedUpdatedAt: '2020-01-01T00:00:00Z' },
            main.actor,
          ),
        409,
      );
      await service.revise(
        uuid,
        {
          ...(await edit()),
          fullName: 'Nguyễn Văn Đã Sửa',
          fullNameLatin: 'NGUYEN VAN DA SUA',
          dob: '2000-02-02',
          grade: 'Giỏi',
          gpa: 3.7,
        },
        main.actor,
      );
      check(
        'corrected identity and result are used by projection',
        (await view(uuid)).fullName === 'Nguyễn Văn Đã Sửa' &&
          (await view(uuid)).grade === 'Giỏi',
      );
      check(
        'shared student remains unchanged',
        JSON.stringify(
          await transaction.student.findUnique({
            where: { id: source.student.id },
          }),
        ) === originalStudent,
      );
      check(
        'shared graduation remains unchanged',
        JSON.stringify(
          await transaction.graduationRecord.findUnique({
            where: { id: source.graduation.id },
          }),
        ) === originalGraduation,
      );
      await service.transition(uuid, await action(uuid), main.actor, 'submit');
      const preview = await cert.previewPdf(uuid, main.actor);
      check(
        'submitted replacement has a PDF preview before approval',
        preview.subarray(0, 5).toString('ascii') === '%PDF-',
      );
      check(
        'dedicated queue excludes ordinary pending',
        (await list('REQUESTED')).pagination.total === 1 &&
          !(
            await cert.findPendingPaginated(1, 20, '', undefined, main.actor)
          ).data.some((record) => record.uuid === uuid),
      );
      await denied(
        'submitted data cannot be edited',
        async () => service.revise(uuid, await edit(), main.actor),
        409,
      );
      await service.transition(
        uuid,
        { ...(await action(uuid)), note: 'Cần kiểm tra tên người ký' },
        main.actor,
        'reject',
      );
      check(
        'rejection preserves original validity',
        (await load(source.diploma.id)).status === 'ACTIVE' &&
          (await list('REJECTED')).data[0].rejection.reason ===
            'Cần kiểm tra tên người ký',
      );
      await service.transition(uuid, await action(uuid), main.actor, 'reopen');
      await service.transition(uuid, await action(uuid), main.actor, 'submit');
      await denied(
        'generic approval cannot bypass replacement confirmation',
        () => cert.approveCert(uuid, main.actor),
        409,
      );
      signingFails = true;
      await assert.rejects(() =>
        service.approve(
          uuid,
          { note: 'Duyệt sau đối chiếu', expectedUpdatedAt: '2020-01-01' },
          main.actor,
        ),
      );
      checks++;
      await assert.rejects(
        async () => service.approve(uuid, await action(uuid), main.actor),
        /Simulated signing failure/,
      );
      checks++;
      check(
        'failed signing leaves source active and replacement unsigned',
        (await load(source.diploma.id)).status === 'ACTIVE' &&
          (await load(uuid)).versions.length === 0 &&
          (await load(uuid)).workflowStatus === 'REQUESTED',
      );
      signingFails = false;
      await service.approve(uuid, await action(uuid), main.actor);
      check(
        'approval invalidates original locally but new certificate remains pending',
        (await view(source.diploma.id)).status === 'REPLACED' &&
          (await view(uuid)).status === 'ANCHOR_PENDING',
      );
      const newVersion = (await load(uuid)).versions[0];
      check(
        'new immutable payload contains correction and predecessor hash',
        newVersion.payload.fullName === 'Nguyễn Văn Đã Sửa' &&
          newVersion.payload.replacement.payloadHash ===
            source.version.payloadHash &&
          newVersion.payloadHash !== source.version.payloadHash,
      );
      check(
        'old immutable payload preserved',
        JSON.stringify((await load(source.diploma.id)).versions[0].payload) ===
          originalPayload,
      );
      await denied(
        'double approval blocked',
        async () => service.approve(uuid, await action(uuid), main.actor),
        409,
      );
      await denied(
        'editing issued replacement blocked',
        async () => service.revise(uuid, await edit(), main.actor),
        409,
      );
      const jobs = await transaction.outboxEvent.findMany({
        where: { versionId: { in: [source.version.id, newVersion.id] } },
      });
      check(
        'exactly one old revocation and one new issuance queued',
        jobs.filter((job) => job.eventType === 'REVOKE').length === 1 &&
          jobs.filter(
            (job) =>
              job.versionId === newVersion.id && job.eventType === 'ISSUE',
          ).length === 1,
      );

      const calls = [];
      let failRevocation = true;
      const ledger = new Map([
        [
          source.diploma.id,
          {
            payloadHash: source.version.payloadHash,
            issuerMspId: main.campus.fabricMspId,
            isRevoked: false,
          },
        ],
      ]);
      const fabric = {
        enabled: true,
        execute: async (_mode, _method, id) => ({ result: ledger.get(id) }),
        executeForMsp: async (_msp, _mode, method, id, _version, ...args) => {
          calls.push({ method, id });
          if (method === 'RevokeDiplomaAnchor') {
            if (failRevocation) throw new Error('Simulated revoke outage');
            ledger.set(id, { ...ledger.get(id), isRevoked: true });
            return {
              payload: JSON.stringify({ success: true, txId: 'revoke_' + id }),
              blockNumber: '2',
            };
          }
          ledger.set(id, {
            payloadHash: args[1],
            issuerMspId: args[2],
            isRevoked: false,
          });
          return {
            payload: JSON.stringify({
              success: true,
              txId: 'issue_' + id,
              hash: args[1],
            }),
            blockNumber: '3',
          };
        },
      };
      const verify = new VerifyService(fabric, scoped);
      check(
        'old QR reports replacement pending, not valid',
        (await verify.verify({ uuid: source.diploma.id }))
          .verificationStatus === 'REPLACEMENT_PENDING',
      );
      check(
        'new QR is not valid before commit',
        !(await verify.verify({ uuid })).isValid,
      );
      const isolatedOutbox = new Proxy(scoped, {
        get(target, key) {
          if (key === '$queryRaw')
            return (strings, ...values) => {
              const head = strings[0];
              const position = head.indexOf(
                'ORDER BY candidate_event.created_at',
              );
              assert(position >= 0, 'only expected claim SQL is isolated');
              return transaction.$queryRaw(
                Prisma.sql(
                  [
                    head.slice(0, position) +
                      ' AND candidate_event.version_id IN (SELECT version.id FROM diploma_versions version JOIN diplomas diploma ON diploma.id = version.diploma_id WHERE diploma.institution_id = ',
                    '::uuid) ' + head.slice(position),
                    ...strings.slice(1),
                  ],
                  main.institution.id,
                  ...values,
                ),
              );
            };
          return target[key];
        },
      });
      const worker = new OutboxService(isolatedOutbox, fabric);
      await transaction.outboxEvent.updateMany({
        where: {
          versionId: { in: [source.version.id, newVersion.id] },
          status: 'PENDING',
        },
        data: { availableAt: new Date('2000-01-01') },
      });
      await worker.processOne();
      check(
        'first attempted transaction is old revocation',
        calls.length === 1 &&
          calls[0].method === 'RevokeDiplomaAnchor' &&
          calls[0].id === source.diploma.id,
      );
      check(
        'failed revocation prevents new issuance from being claimed',
        (await worker.processOne()) === false && calls.length === 1,
      );
      failRevocation = false;
      await transaction.outboxEvent.updateMany({
        where: { versionId: source.version.id, eventType: 'REVOKE' },
        data: { availableAt: new Date('2000-01-01') },
      });
      await worker.processOne();
      check(
        'new issuance only allowed after committed old revocation',
        ledger.get(source.diploma.id).isRevoked &&
          (await worker.processOne()) === true &&
          calls.at(-1).id === uuid,
      );
      check(
        'new certificate is valid after commit',
        (await verify.verify({ uuid })).isValid,
      );
      const priorState = ledger.get(source.diploma.id);
      ledger.set(source.diploma.id, { ...priorState, isRevoked: false });
      check(
        'verification rejects replacement when predecessor is still active on chain',
        !(await verify.verify({ uuid })).isValid,
      );
      ledger.set(source.diploma.id, {
        ...priorState,
        payloadHash: 'f'.repeat(64),
      });
      check(
        'verification rejects mismatched predecessor hash',
        !(await verify.verify({ uuid })).isValid,
      );
      ledger.delete(source.diploma.id);
      check(
        'missing predecessor evidence does not produce a valid replacement',
        !(await verify.verify({ uuid })).isValid,
      );
      ledger.set(source.diploma.id, priorState);
      const oldVerification = await verify.verify({ uuid: source.diploma.id });
      check(
        'old certificate stays invalid and links to replacement',
        !oldVerification.isValid &&
          oldVerification.verificationStatus === 'SUPERSEDED' &&
          oldVerification.details.replacementUuid === uuid,
      );
      check(
        'register contains both immutable entries',
        (await cert.findRegister({ page: 1, limit: 20 }, main.actor)).data
          .length === 2,
      );
      check(
        'replacement edits and approval have append-only audit',
        (await transaction.auditLog.count({
          where: {
            target: uuid,
            action: {
              in: [
                'CREATE_REPLACEMENT',
                'EDIT_REPLACEMENT',
                'SUBMIT_REPLACEMENT',
                'REJECT_REPLACEMENT',
                'REOPEN_REPLACEMENT',
                'APPROVE_REPLACEMENT',
              ],
            },
          },
        })) === 7,
      );

      let httpActor = main.actor;
      const next = await service.create(
        uuid,
        await createBody(uuid),
        main.actor,
      );
      check(
        'an issued replacement can itself be replaced with the correct immutable predecessor',
        (await view(next.uuid)).replacementReference.payloadHash ===
          newVersion.payloadHash &&
          (await view(next.uuid)).fullName === 'Nguyễn Văn Đã Sửa',
      );
      check(
        'creating a successor does not retire its current predecessor',
        (await load(uuid)).status === 'ACTIVE',
      );
      const module = await Test.createTestingModule({
        controllers: Reflect.getMetadata('controllers', CertModule),
        providers: [
          { provide: CertService, useValue: cert },
          {
            provide: CorrectionService,
            useValue: new CorrectionService(scoped),
          },
          { provide: ReplacementService, useValue: service },
        ],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate(context) {
            context.switchToHttp().getRequest().user = httpActor;
            return true;
          },
        })
        .compile();
      const app = module.createNestApplication({ logger: false });
      app.useGlobalPipes(
        new ValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.listen(0, '127.0.0.1');
      const base = await app.getUrl();
      try {
        check(
          'real controller ordering exposes replacement collection',
          (await fetch(base + '/cert/replacements?stage=APPROVED')).status ===
            200,
        );
        for (const invalid of ['page=0', 'limit=101', 'stage=INVALID'])
          check(
            'HTTP query validation ' + invalid,
            (await fetch(base + '/cert/replacements?' + invalid)).status ===
              400,
          );
        const post = (path, body) =>
          fetch(base + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
        check(
          'HTTP UUID validation',
          (await post('/cert/replacements/not-a-uuid/create', {})).status ===
            400,
        );
        check(
          'HTTP prevents identity injection',
          (
            await post('/cert/replacements/' + other.diploma.id + '/create', {
              ...(await createBody(other.diploma.id)),
              mssv: 'hijack',
            })
          ).status === 400,
        );
        for (const flags of [
          { role: 'admin' },
          { role: 'student' },
          { canApproveDiplomas: false },
          { isHeadquarters: false },
        ]) {
          httpActor = { ...main.actor, ...flags };
          check(
            'HTTP unauthorized list ' + JSON.stringify(flags),
            (await fetch(base + '/cert/replacements')).status === 403,
          );
          check(
            'HTTP unauthorized mutation ' + JSON.stringify(flags),
            (
              await post(
                '/cert/replacements/' + source.diploma.id + '/create',
                await createBody(source.diploma.id),
              )
            ).status === 403,
          );
        }
      } finally {
        await app.close();
      }
      throw rollback;
    },
    { timeout: 120000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  try {
    check(
      'all replacement fixtures rolled back',
      (await database.institution.count({
        where: { id: { in: institutions } },
      })) === 0,
    );
  } finally {
    await database.$disconnect();
  }
}
console.log(
  'Replacement PostgreSQL/HTTP/outbox checks passed: ' +
    checks +
    '. Fixtures rolled back; no real PDF or Fabric writes.',
);
