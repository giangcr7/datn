import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
config({ path: resolve(root, "apps/api/.env"), quiet: true });
const {
  DatabaseService,
} = require("../apps/api/dist/database/database.service.js");
const { CertService } = require("../apps/api/dist/cert/cert.service.js");
const { VerifyService } = require("../apps/api/dist/verify/verify.service.js");
const { AuditService } = require("../apps/api/dist/audit/audit.service.js");
const { AuthService } = require("../apps/api/dist/auth/auth.service.js");
const {
  writeAcademicRecord,
} = require("../apps/api/dist/database/academic-record-writer.js");
const {
  BadRequestException,
  ForbiddenException,
  ConflictException,
  NotFoundException,
} = require("@nestjs/common");
const database = new DatabaseService({
  getOrThrow: () => {
    assert(process.env.DATABASE_URL, "DATABASE_URL is required");
    return process.env.DATABASE_URL;
  },
});
const rollback = new Error("ROLLBACK_WORKFLOW_FIXTURES");
const suffix = randomUUID().slice(0, 8);
const institutionId = randomUUID();
let checks = 0;
const expectReject = async (label, action, exception) => {
  await assert.rejects(action, exception, label);
  checks++;
};
const check = (label, condition) => {
  assert(condition, label);
  checks++;
};
try {
  await database.$transaction(
    async (transaction) => {
      await transaction.institution.create({
        data: {
          id: institutionId,
          code: "WORKFLOW_" + suffix,
          name: "Rollback workflow fixture",
        },
      });
      const campus = await transaction.campus.create({
        data: {
          institutionId,
          code: "ORG2",
          name: "Workflow campus",
          fabricMspId: "WorkflowMSP_" + suffix,
        },
      });
      const otherCampus = await transaction.campus.create({
        data: {
          institutionId,
          code: "OTHER",
          name: "Other fixture campus",
          isHeadquarters: true,
          fabricMspId: "HeadquartersMSP_" + suffix,
        },
      });
      const program = await transaction.program.create({
        data: {
          institutionId,
          code: "TEST",
          name: "Workflow program",
        },
      });
      await transaction.programAlias.create({
        data: {
          institutionId,
          programId: program.id,
          originalName: program.name,
          normalizedName: "workflow program",
        },
      });
      const actors = [];
      for (const [index, role] of [
        "UNIVERSITY",
        "UNIVERSITY",
        "ADMIN",
      ].entries()) {
        const accountCampus = index === 0 ? campus : otherCampus;
        const account = await transaction.account.create({
          data: {
            email: "workflow-" + suffix + "-" + index + "@example.test",
            displayName: "Workflow " + role,
            passwordHash: "rollback-only-not-a-login-secret",
          },
        });
        const membership = await transaction.accountMembership.create({
          data: {
            accountId: account.id,
            campusId: accountCampus.id,
            role,
            canApproveDiplomas: index === 1,
          },
        });
        actors.push({
          id: account.id,
          email: account.email,
          role: role.toLowerCase(),
          institutionId,
          campusId: accountCampus.id,
          org: accountCampus.code,
          isHeadquarters: accountCampus.isHeadquarters,
          canApproveDiplomas: membership.canApproveDiplomas,
          membershipId: membership.id,
        });
      }
      const [maker, checker, administrator] = actors;
      const scoped = new Proxy(transaction, {
        get(target, property) {
          if (property === "$transaction")
            return async (callback) => callback(transaction);
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const service = new CertService(scoped);
      const verify = new VerifyService({ enabled: false }, scoped);
      const audit = new AuditService(scoped);
      const auth = new AuthService(scoped, {}, audit, {});
      const student = await transaction.student.create({
        data: {
          institutionId,
          studentCode: "0099999991",
          fullName: "Workflow student",
          dateOfBirth: new Date("2002-01-01"),
        },
      });
      const body = {
        mssv: student.studentCode,
        fullName: student.fullName,
        major: program.name,
        dob: "2002-01-01",
        grade: "GOOD",
        gpa: null,
        namTotNghiep: 2024,
        issueDate: "2024-10-15",
        soHieu: "WF-" + suffix,
        soVaoSo: "WF/" + suffix,
        degreeType: "BACHELOR",
        majorNameEn: "Test program",
        issuePlace: "Hà Nội",
        diplomaSignerName: "Workflow printed signer",
        diplomaSignerTitle: "HIỆU TRƯỞNG",
      };
      for (const [label, values] of [
        ["missing student", { mssv: "0099999999" }],
        ["missing issue date", { issueDate: undefined }],
        ["before birth", { issueDate: "2000-01-01" }],
        ["before graduation year", { issueDate: "2023-12-31" }],
        ["future issue date", { issueDate: "2099-01-01" }],
      ])
        await expectReject(
          label,
          () => service.requestCert({ ...body, ...values }, maker),
          BadRequestException,
        );
      check(
        "invalid requests must not create diplomas",
        (await transaction.diploma.count({ where: { institutionId } })) === 0,
      );
      check(
        "unknown MSSV must not create students",
        (await transaction.student.count({ where: { institutionId } })) === 1,
      );
      const requested = await service.requestCert(body, maker);
      const initial = await service.findOne(requested.uuid, maker);
      check(
        "request must remain pending without a version",
        initial.status === "PENDING" && initial.certHash === null,
      );
      await expectReject(
        "maker cannot approve",
        () => service.approveCert(requested.uuid, maker),
        ForbiddenException,
      );
      await expectReject(
        "admin cannot approve on behalf of headquarters",
        () => service.approveCert(requested.uuid, administrator),
        ForbiddenException,
      );
      await expectReject(
        "HCM cannot reject a request",
        () => service.rejectCert(requested.uuid, "Forbidden rejection", maker),
        ForbiddenException,
      );
      check(
        "headquarters can see branch requests",
        (await service.findPending(checker)).some(
          (item) => item.uuid === requested.uuid,
        ),
      );
      check(
        "another institution cannot see branch requests",
        (await service.findPending({ ...checker, institutionId: randomUUID() }))
          .length === 0,
      );
      await expectReject(
        "headquarters without approval permission cannot approve",
        () =>
          service.approveCert(requested.uuid, {
            ...checker,
            canApproveDiplomas: false,
          }),
        ForbiddenException,
      );
      await expectReject(
        "other campus cannot read",
        () =>
          service.findOne(requested.uuid, {
            ...maker,
            campusId: otherCampus.id,
          }),
        NotFoundException,
      );
      const approved = await service.approveCert(requested.uuid, checker);
      check(
        "headquarters signs for a branch without changing origin",
        approved.issuerMspId === otherCampus.fabricMspId &&
          (
            await transaction.diploma.findUnique({
              where: { id: requested.uuid },
            })
          ).campusId === campus.id,
      );
      check(
        "issuing campus is persisted separately",
        (
          await transaction.diploma.findUnique({
            where: { id: requested.uuid },
          })
        ).issuingCampusId === otherCampus.id,
      );
      check(
        "outbox uses headquarters identity",
        (
          await transaction.outboxEvent.findFirst({
            where: {
              version: { diplomaId: requested.uuid },
              eventType: "ISSUE",
            },
          })
        ).payload.issuerMspId === otherCampus.fabricMspId,
      );
      check(
        "approval is not a blockchain commit",
        approved.status === "ANCHOR_PENDING",
      );
      await expectReject(
        "cannot approve twice",
        () => service.approveCert(requested.uuid, checker),
        ConflictException,
      );
      check(
        "one immutable version",
        (await transaction.diplomaVersion.count({
          where: { diplomaId: requested.uuid },
        })) === 1,
      );
      check(
        "one issue outbox",
        (await transaction.outboxEvent.count({
          where: { version: { diplomaId: requested.uuid }, eventType: "ISSUE" },
        })) === 1,
      );
      const pendingProof = await verify.verify({ certUUID: requested.uuid });
      check(
        "verify must not claim valid before chain commit",
        !pendingProof.isValid &&
          pendingProof.verificationStatus === "ANCHOR_PENDING",
      );
      await service.revoke(
        requested.uuid,
        "Rollback-only test revocation",
        checker,
      );
      check(
        "revocation keeps the original issuing MSP",
        (
          await transaction.outboxEvent.findFirst({
            where: {
              version: { diplomaId: requested.uuid },
              eventType: "REVOKE",
            },
          })
        ).payload.issuerMspId === otherCampus.fabricMspId,
      );
      const revokedProof = await verify.verify({ certUUID: requested.uuid });
      check(
        "revoked diploma fails verification",
        !revokedProof.isValid && revokedProof.verificationStatus === "REVOKED",
      );
      check(
        "one revoke outbox",
        (await transaction.outboxEvent.count({
          where: {
            version: { diplomaId: requested.uuid },
            eventType: "REVOKE",
          },
        })) === 1,
      );
      const history = await transaction.diplomaEvent.findMany({
        where: { diplomaId: requested.uuid },
      });
      check(
        "business history is complete",
        ["REQUESTED", "APPROVED", "REVOKED"].every((event) =>
          history.some((item) => item.eventType === event),
        ),
      );
      const second = await transaction.student.create({
        data: {
          institutionId,
          studentCode: "0099999992",
          fullName: "Draft fixture",
          dateOfBirth: new Date("2002-01-01"),
        },
      });
      const graduation = await transaction.graduationRecord.create({
        data: {
          institutionId,
          studentId: second.id,
          programId: program.id,
          graduationYear: 2024,
          classification: "GOOD",
        },
      });
      const draft = await transaction.diploma.create({
        data: {
          institutionId,
          campusId: campus.id,
          graduationId: graduation.id,
          certificateNo: "DRAFT-" + suffix,
          registryNo: "DRAFT/" + suffix,
        },
      });
      await expectReject(
        "draft date before birth",
        () => service.submitDraft(draft.id, "2000-01-01", maker),
        BadRequestException,
      );
      await expectReject(
        "draft date before graduation",
        () => service.submitDraft(draft.id, "2023-12-31", maker),
        BadRequestException,
      );
      await service.submitDraft(draft.id, "2024-10-15", maker);
      await service.rejectCert(draft.id, "Rollback-only reject", checker);
      const rejected = await service.findOne(draft.id, maker);
      check(
        "reject does not issue a version",
        rejected.status === "REJECTED" && rejected.certHash === null,
      );
      const accounts = await auth.findAllUsers(checker);
      check(
        "account list is institution scoped",
        accounts.length === 3 &&
          accounts.every((item) => item.email.includes(suffix)),
      );
      const events = await audit.findAll(checker);
      check(
        "audit list is institution scoped",
        events.data.length >= 5 &&
          events.data.every((item) => item.institutionId === institutionId),
      );
      const unrelatedAudit = await audit.findByUser(maker.id, {
        ...checker,
        institutionId: randomUUID(),
      });
      check(
        "other institution cannot read user audit",
        unrelatedAudit.length === 0,
      );
      const imported = await writeAcademicRecord(
        transaction,
        { institutionId, campusId: campus.id },
        {
          studentCode: "0099999993",
          fullName: "Import-only fixture",
          dateOfBirth: "2002-01-01",
          programId: program.id,
          graduationYear: 2024,
          classification: "GOOD",
        },
      );
      check(
        "registry writer can still create students from reviewed import data",
        !!imported.id &&
          (await transaction.student.count({
            where: { institutionId, studentCode: "0099999993" },
          })) === 1,
      );
      throw rollback;
    },
    { timeout: 60000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  try {
    check(
      "fixture institution was rolled back",
      (await database.institution.findUnique({
        where: { id: institutionId },
      })) === null,
    );
    check(
      "fixture diplomas were rolled back",
      (await database.diploma.count({ where: { institutionId } })) === 0,
    );
  } finally {
    await database.$disconnect();
  }
}
console.log(
  "Workflow checks passed: " +
    checks +
    ". Request/submit/approve/reject/revoke/verify, scope and audit tested against PostgreSQL. All fixtures rolled back. Fabric NOT exercised.",
);
