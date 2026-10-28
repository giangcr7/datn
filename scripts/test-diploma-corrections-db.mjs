import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { config } from 'dotenv';

config({ path: new URL('../apps/api/.env', import.meta.url), quiet: true });
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require('../apps/api/dist/database/database.service.js');
const { CertService } = require('../apps/api/dist/cert/cert.service.js');
const { CertController } = require('../apps/api/dist/cert/cert.controller.js');
const { CertModule } = require('../apps/api/dist/cert/cert.module.js');
const {
  ReplacementService,
} = require('../apps/api/dist/cert/replacement.service.js');
const {
  CorrectionService,
} = require('../apps/api/dist/cert/correction.service.js');
const {
  CorrectionController,
} = require('../apps/api/dist/cert/correction.controller.js');
const {
  CorrectionQueryDto,
} = require('../apps/api/dist/cert/correction.dto.js');
const {
  RegisterQueryDto,
} = require('../apps/api/dist/cert/register-query.dto.js');
const { JwtAuthGuard } = require('../apps/api/dist/auth/jwt.guard.js');
const { payloadHash } = require('../apps/api/dist/database/diploma-hash.js');
const { Test } = require('@nestjs/testing');
const { ValidationPipe: NestValidationPipe } = require('@nestjs/common');
const database = new DatabaseService({
  getOrThrow: () => process.env.DATABASE_URL,
});
const rollback = new Error('ROLLBACK_CORRECTION_FIXTURES');
const institutionIds = [];
let checks = 0;
function check(label, value) {
  assert(value, label);
  checks++;
}
async function rejected(label, operation, status) {
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
      const scoped = {
        diploma: transaction.diploma,
        diplomaEvent: transaction.diplomaEvent,
        campus: transaction.campus,
        $transaction: async (callback) => {
          const name = 'correction_' + ++savepoint;
          await transaction.$executeRawUnsafe('SAVEPOINT ' + name);
          try {
            const result = await callback(transaction);
            await transaction.$executeRawUnsafe('RELEASE SAVEPOINT ' + name);
            return result;
          } catch (error) {
            await transaction.$executeRawUnsafe(
              'ROLLBACK TO SAVEPOINT ' + name,
            );
            await transaction.$executeRawUnsafe('RELEASE SAVEPOINT ' + name);
            throw error;
          }
        },
      };
      async function school() {
        const institution = await transaction.institution.create({
          data: {
            code: 'FIX_' + randomUUID().slice(0, 24),
            name: 'Trường kiểm thử',
            nameEn: 'Regression University',
          },
        });
        institutionIds.push(institution.id);
        const campus = await transaction.campus.create({
          data: {
            institutionId: institution.id,
            code: 'MAIN',
            name: 'Cơ sở chính',
            isHeadquarters: true,
            fabricMspId: 'Test_' + randomUUID(),
          },
        });
        const account = await transaction.account.create({
          data: {
            email: randomUUID() + '@example.test',
            displayName: 'Cán bộ kiểm thử',
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
            org: 'MAIN',
            isHeadquarters: true,
            canApproveDiplomas: true,
          },
        };
      }
      const main = await school();
      const foreign = await school();
      let sequence = 0;
      async function fixture({
        target = main,
        imported = false,
        workflowStatus = 'REQUESTED',
      } = {}) {
        const number = ++sequence;
        const student = await transaction.student.create({
          data: {
            institutionId: target.institution.id,
            studentCode: String(number).padStart(10, '0'),
            fullName: 'Nguyễn Văn ' + number,
            dateOfBirth: new Date('2000-01-01'),
          },
        });
        let sourceRowId;
        if (imported) {
          const document = await transaction.sourceDocument.create({
            data: {
              institutionId: target.institution.id,
              fileName: 'Nguồn gốc.xlsx',
              sha256: randomUUID().replaceAll('-', '').padEnd(64, '0'),
              byteSize: 1,
              mediaType: 'test',
              storageKey: 'test/' + randomUUID(),
            },
          });
          const batch = await transaction.importBatch.create({
            data: {
              institutionId: target.institution.id,
              campusId: target.campus.id,
              documentId: document.id,
              createdById: target.account.id,
              mappingVersion: 'correction-test',
            },
          });
          const row = await transaction.importRow.create({
            data: {
              batchId: batch.id,
              sheetName: '2024',
              rowNumber: 2,
              status: 'IMPORTED',
              rawData: { original: 'untouched' },
              normalizedData: {
                issuedOn: '2024-06-01',
                fullName: student.fullName,
              },
            },
          });
          sourceRowId = row.id;
        }
        const graduation = await transaction.graduationRecord.create({
          data: {
            institutionId: target.institution.id,
            studentId: student.id,
            programId: target.program.id,
            graduationYear: 2024,
            classification: 'GOOD',
            degreeType: 'ENGINEER',
            gpa: 3.2,
            sourceRowId,
          },
        });
        const diploma = await transaction.diploma.create({
          data: {
            institutionId: target.institution.id,
            campusId: target.campus.id,
            graduationId: graduation.id,
            status: 'DRAFT',
            workflowStatus,
            certificateNo: '000VB' + number,
            registryNo: '000VS' + number,
            requestedById:
              workflowStatus === 'REQUESTED' ? target.account.id : null,
            requestedAt: workflowStatus === 'REQUESTED' ? new Date() : null,
            issuedOn: new Date('2024-06-01'),
            printTemplate: 'tlu-bilingual-v1',
            originType: imported ? 'DIGITIZATION' : 'ISSUANCE',
            majorNameEn: 'Information Technology',
            issuePlace: 'TP. Hồ Chí Minh',
            diplomaSignerName: 'Nguyễn Văn A',
            diplomaSignerTitle: 'HIỆU TRƯỞNG',
          },
        });
        return { student, graduation, diploma, sourceRowId };
      }
      const cert = new CertService(scoped);
      const service = new CorrectionService(scoped);
      const query = (stage = 'REJECTED', extra = {}) =>
        Object.assign(new CorrectionQueryDto(), { stage, ...extra });
      const list = (stage) => service.list(query(stage), main.actor);
      async function current(id, stage = 'DRAFT') {
        return (await list(stage)).data.find((record) => record.uuid === id);
      }
      const action = (record) => ({
        note: 'Đã đối chiếu với hồ sơ gốc',
        expectedUpdatedAt: record.updatedAt.toISOString(),
      });
      const manual = await fixture();
      const imported = await fixture({ imported: true });
      const foreignRecord = await fixture({ target: foreign });
      const ordinaryDraft = await fixture({ workflowStatus: 'DRAFT' });
      await cert.rejectCert(
        manual.diploma.id,
        'Tên người ký chưa đúng',
        main.actor,
      );
      await cert.rejectCert(
        imported.diploma.id,
        'Sai hạng tốt nghiệp',
        main.actor,
      );
      await cert.rejectCert(
        foreignRecord.diploma.id,
        'Foreign reason',
        foreign.actor,
      );
      const firstList = await list('REJECTED');
      check(
        'lists exactly two own-campus rejected records',
        firstList.pagination.total === 2 && firstList.data.length === 2,
      );
      check(
        'preserves rejection actor, reason and time',
        firstList.data.every(
          (record) =>
            record.rejection.rejectedBy === main.account.displayName &&
            record.rejection.reason,
        ),
      );
      check(
        'does not show ordinary drafts as reopened records',
        (await list('DRAFT')).pagination.total === 0,
      );
      check(
        'searches rejected records by leading-zero registry number',
        (
          await service.list(
            query('REJECTED', { search: imported.diploma.registryNo }),
            main.actor,
          )
        ).pagination.total === 1,
      );
      check(
        'paginates with unchanged total',
        (
          await service.list(
            query('REJECTED', { limit: 1, page: 2 }),
            main.actor,
          )
        ).data.length === 1,
      );
      for (const flags of [
        { role: 'admin' },
        { role: 'student' },
        { isHeadquarters: false },
        { canApproveDiplomas: false },
        { institutionId: undefined },
        { campusId: undefined },
      ])
        await rejected(
          'scope and role enforced ' + JSON.stringify(flags),
          () => service.list(query(), { ...main.actor, ...flags }),
          403,
        );
      const manualRejected = await current(manual.diploma.id, 'REJECTED');
      await rejected(
        'blank note cannot reopen',
        () =>
          service.reopen(
            manual.diploma.id,
            { ...action(manualRejected), note: '   ' },
            main.actor,
          ),
        400,
      );
      await rejected(
        'another institution cannot reopen',
        () =>
          service.reopen(
            manual.diploma.id,
            action(manualRejected),
            foreign.actor,
          ),
        404,
      );
      await rejected(
        'stale timestamp cannot reopen',
        () =>
          service.reopen(
            manual.diploma.id,
            {
              ...action(manualRejected),
              expectedUpdatedAt: '2020-01-01T00:00:00Z',
            },
            main.actor,
          ),
        409,
      );
      const ledgerFingerprint = async () =>
        JSON.stringify({
          versions: await transaction.diplomaVersion.count(),
          anchors: await transaction.blockchainAnchor.count(),
          outbox: await transaction.outboxEvent.count(),
          signed: await transaction.signedDiplomaDocument.count(),
        });
      const originalLedger = await ledgerFingerprint();
      await service.reopen(
        manual.diploma.id,
        action(manualRejected),
        main.actor,
      );
      const reopened = await current(manual.diploma.id);
      await rejected(
        'generic submission cannot bypass resubmission note',
        () => cert.submitDraft(manual.diploma.id, undefined, main.actor),
        409,
      );
      await rejected(
        'direct approval cannot sign a still-supplementing record',
        () => cert.approveCert(manual.diploma.id, main.actor),
        409,
      );
      check(
        'reopens the same ID and preserves original rejection',
        reopened.uuid === manual.diploma.id &&
          reopened.rejection.reason === 'Tên người ký chưa đúng',
      );
      check(
        'removes reopened record from rejected stage',
        (await list('REJECTED')).pagination.total === 1,
      );
      check(
        'clears active request fields while supplementing',
        reopened.requestedAt === null && reopened.requestedBy === null,
      );
      const edit = (record) => ({
        ...action(record),
        fullName: record.fullName,
        dob: record.dob,
        programId: record.programId,
        namTotNghiep: record.namTotNghiep,
        grade: record.grade,
        gpa: record.gpa,
        degreeType: record.degreeType,
        className: record.className,
        soHieu: record.soHieu,
        soVaoSo: record.soVaoSo,
        issueDate: record.issueDate,
        fullNameLatin: record.printedDiploma.fullNameLatin,
        majorNameEn: record.printedDiploma.majorNameEn,
        issuePlace: record.printedDiploma.issuePlace,
        diplomaSignerName: record.printedDiploma.diplomaSignerName,
        diplomaSignerTitle: record.printedDiploma.diplomaSignerTitle,
      });
      await service.revise(
        manual.diploma.id,
        {
          ...edit(reopened),
          diplomaSignerName: 'Nguyễn Văn Đúng',
          fullName: 'Nguyễn Văn Đối Chiếu',
        },
        main.actor,
      );
      const revised = await current(manual.diploma.id);
      check(
        'saved corrections keep DRAFT rather than silently publishing',
        revised.workflowStatus === 'DRAFT' &&
          revised.fullName === 'Nguyễn Văn Đối Chiếu' &&
          revised.printedDiploma.diplomaSignerName === 'Nguyễn Văn Đúng',
      );
      check(
        'keeps leading zeros and original recorded issue date',
        revised.soHieu === manual.diploma.certificateNo &&
          revised.issueDate === '2024-06-01',
      );
      await rejected(
        'stale editor cannot overwrite saved corrections',
        () => service.revise(manual.diploma.id, edit(reopened), main.actor),
        409,
      );
      await rejected(
        'server validates corrected dates',
        () =>
          service.revise(
            manual.diploma.id,
            { ...edit(revised), issueDate: '1999-01-01' },
            main.actor,
          ),
        400,
      );
      await rejected(
        'server checks inactive or foreign program',
        () =>
          service.revise(
            manual.diploma.id,
            { ...edit(revised), programId: foreign.program.id },
            main.actor,
          ),
        400,
      );
      await rejected(
        'duplicate registry number rolls back all field changes',
        () =>
          service.revise(
            manual.diploma.id,
            {
              ...edit(revised),
              soVaoSo: ordinaryDraft.diploma.registryNo,
              fullName: 'Không được lưu',
            },
            main.actor,
          ),
        409,
      );
      check(
        'failed correction fully rolls back student identity',
        (await current(manual.diploma.id)).fullName === revised.fullName,
      );
      await service.resubmit(manual.diploma.id, action(revised), main.actor);
      check(
        'resubmission returns to ordinary pending queue',
        (
          await cert.findPendingPaginated(1, 20, '', undefined, main.actor)
        ).data.some((record) => record.uuid === manual.diploma.id),
      );
      check(
        'resubmission removes record from supplementing queue',
        !(await list('DRAFT')).data.some(
          (record) => record.uuid === manual.diploma.id,
        ),
      );
      check(
        'resubmission is not an issued register entry',
        (await cert.findRegister(new RegisterQueryDto(), main.actor)).pagination
          .total === 0,
      );
      await rejected(
        'repeated resubmit cannot create duplicate request',
        () => service.resubmit(manual.diploma.id, action(revised), main.actor),
        409,
      );
      await cert.rejectCert(
        manual.diploma.id,
        'Cần đối chiếu quyết định lần hai',
        main.actor,
      );
      const secondRejected = await current(manual.diploma.id, 'REJECTED');
      check(
        'shows latest reason after another rejection',
        secondRejected.rejection.reason === 'Cần đối chiếu quyết định lần hai',
      );
      const history = (await cert.history(manual.diploma.id, main.actor))
        .history;
      check(
        'history retains both rejections and every recovery action',
        history.filter((event) => event.eventType === 'REJECTED').length ===
          2 &&
          ['REOPENED', 'CORRECTED', 'RESUBMITTED'].every((type) =>
            history.some((event) => event.eventType === type),
          ),
      );
      const audit = await transaction.auditLog.findFirst({
        where: {
          target: manual.diploma.id,
          action: 'CORRECT_REJECTED_DIPLOMA',
        },
      });
      check(
        'audit retains before/after and handling note',
        audit.metadata.before.fullName !== audit.metadata.after.fullName &&
          audit.metadata.note,
      );
      const importedRejected = await current(imported.diploma.id, 'REJECTED');
      await service.reopen(
        imported.diploma.id,
        action(importedRejected),
        main.actor,
      );
      const importedDraft = await current(imported.diploma.id);
      check(
        'reopened imports are not duplicated in ordinary preparation queue',
        !(
          await cert.findRequestCandidates(1, 20, '', undefined, main.actor)
        ).data.some((record) => record.uuid === imported.diploma.id),
      );
      const sourceBefore = await transaction.importRow.findUnique({
        where: { id: imported.sourceRowId },
      });
      await service.revise(
        imported.diploma.id,
        { ...edit(importedDraft), grade: 'Giỏi', gpa: 3.7 },
        main.actor,
      );
      const sourceAfter = await transaction.importRow.findUnique({
        where: { id: imported.sourceRowId },
      });
      check(
        'import correction preserves raw and normalized source',
        JSON.stringify(sourceBefore.rawData) ===
          JSON.stringify(sourceAfter.rawData) &&
          JSON.stringify(sourceBefore.normalizedData) ===
            JSON.stringify(sourceAfter.normalizedData),
      );
      check(
        'import correction writes explicit override with reviewer identity',
        sourceAfter.overrides.classification === 'VERY_GOOD' &&
          sourceAfter.reviewedById === main.actor.id,
      );
      await service.resubmit(
        imported.diploma.id,
        action(await current(imported.diploma.id)),
        main.actor,
      );
      check(
        'both imported and manually entered records rejoin approval queue',
        (
          await cert.findPendingPaginated(1, 20, '', undefined, main.actor)
        ).data.some((record) => record.uuid === imported.diploma.id),
      );
      check(
        'no signed PDF, immutable version, anchor or outbox was created',
        (await ledgerFingerprint()) === originalLedger,
      );
      await service.reopen(
        manual.diploma.id,
        action(secondRejected),
        main.actor,
      );
      await transaction.graduationRecord.create({
        data: {
          institutionId: main.institution.id,
          studentId: manual.student.id,
          programId: main.program.id,
          graduationYear: 2023,
        },
      });
      const sharedDraft = await current(manual.diploma.id);
      await rejected(
        'cannot change student identity used in another graduation',
        () =>
          service.revise(
            manual.diploma.id,
            { ...edit(sharedDraft), fullName: 'Không sửa lan' },
            main.actor,
          ),
        409,
      );
      const blocked = await fixture();
      await cert.rejectCert(
        blocked.diploma.id,
        'Protected version',
        main.actor,
      );
      await transaction.diplomaVersion.create({
        data: {
          diplomaId: blocked.diploma.id,
          version: 1,
          schemaVersion: 'diploma-v1',
          payload: { uuid: blocked.diploma.id, version: 1 },
          payloadHash: payloadHash({ uuid: blocked.diploma.id, version: 1 }),
        },
      });
      const blockedRecord = await current(blocked.diploma.id, 'REJECTED');
      check(
        'versioned rejected record is read-only in UI data',
        !!blockedRecord.blockedReason,
      );
      await rejected(
        'cannot reopen any immutable version',
        () =>
          service.reopen(blocked.diploma.id, action(blockedRecord), main.actor),
        409,
      );

      let httpActor = main.actor;
      const module = await Test.createTestingModule({
        controllers: Reflect.getMetadata('controllers', CertModule),
        providers: [
          { provide: CertService, useValue: cert },
          { provide: CorrectionService, useValue: service },
          {
            provide: ReplacementService,
            useValue: new ReplacementService(scoped, cert),
          },
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
        new NestValidationPipe({
          whitelist: true,
          forbidNonWhitelisted: true,
          transform: true,
        }),
      );
      await app.listen(0, '127.0.0.1');
      const base = await app.getUrl();
      try {
        const response = await fetch(base + '/cert/corrections');
        check(
          'actual CertModule routes corrections before generic uuid lookup',
          response.ok && (await response.json()).pagination.total === 1,
        );
        for (const invalid of [
          'page=0',
          'limit=101',
          'stage=APPROVED',
          'institutionId=other',
        ])
          check(
            'HTTP rejects invalid query ' + invalid,
            (await fetch(base + '/cert/corrections?' + invalid)).status === 400,
          );
        const post = (path, body, method = 'POST') =>
          fetch(base + path, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
        check(
          'HTTP validates UUID before querying',
          (await post('/cert/corrections/invalid/reopen', action(sharedDraft)))
            .status === 400,
        );
        check(
          'HTTP rejects injection of immutable identity fields',
          (
            await post(
              '/cert/corrections/' + manual.diploma.id,
              { ...edit(sharedDraft), mssv: 'other' },
              'PATCH',
            )
          ).status === 400,
        );
        for (const flags of [
          { role: 'admin' },
          { role: 'student' },
          { isHeadquarters: false },
          { canApproveDiplomas: false },
        ]) {
          httpActor = { ...main.actor, ...flags };
          check(
            'HTTP read authorization ' + JSON.stringify(flags),
            (await fetch(base + '/cert/corrections')).status === 403,
          );
          check(
            'HTTP mutation authorization ' + JSON.stringify(flags),
            (
              await post(
                '/cert/corrections/' + manual.diploma.id + '/resubmit',
                action(sharedDraft),
              )
            ).status === 403,
          );
        }
        httpActor = main.actor;
        const httpResult = await post(
          '/cert/corrections/' + manual.diploma.id + '/resubmit',
          action(sharedDraft),
        );
        check(
          'HTTP resubmission returns pending without signing',
          httpResult.status === 201 &&
            (await httpResult.json()).status === 'PENDING',
        );
      } finally {
        await app.close();
      }
      throw rollback;
    },
    { timeout: 90000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  try {
    check(
      'all correction fixtures rolled back',
      (await database.institution.count({
        where: { id: { in: institutionIds } },
      })) === 0,
    );
  } finally {
    await database.$disconnect();
  }
}
console.log(
  'Rejected diploma PostgreSQL/HTTP checks passed: ' +
    checks +
    '. Fixtures rolled back; no ledger/PDF changes.',
);
