import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

assert(
  process.env.WORKDESK_TEST_DATABASE_URL,
  "Set WORKDESK_TEST_DATABASE_URL to a disposable local database",
);
const target = new URL(process.env.WORKDESK_TEST_DATABASE_URL);
assert(
  ["localhost", "127.0.0.1"].includes(target.hostname) &&
    target.pathname === "/diplomachain_workdesk_test",
  "Refusing to test against a business database",
);
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require("../apps/api/dist/database/database.service.js");
const { InboxService } = require("../apps/api/dist/inbox/inbox.service.js");
const {
  InboxController,
} = require("../apps/api/dist/inbox/inbox.controller.js");
const {
  ChangeRequestService,
} = require("../apps/api/dist/requests/change-request.service.js");
const { JwtAuthGuard } = require("../apps/api/dist/auth/jwt.guard.js");
const { Test } = require("@nestjs/testing");
const { ValidationPipe } = require("@nestjs/common");
const database = new DatabaseService({ getOrThrow: () => target.href });
const rollback = new Error("ROLLBACK_INBOX_FIXTURES");
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
try {
  await database.$transaction(
    async (transaction) => {
      let savepoint = 0;
      async function fails(label, operation, status) {
        const name = "inbox_check_" + ++savepoint;
        await transaction.$executeRawUnsafe("SAVEPOINT " + name);
        let error;
        try {
          await operation();
        } catch (cause) {
          error = cause;
        } finally {
          await transaction.$executeRawUnsafe("ROLLBACK TO SAVEPOINT " + name);
          await transaction.$executeRawUnsafe("RELEASE SAVEPOINT " + name);
        }
        check(label, !!error && (!status || error.getStatus?.() === status));
      }
      async function school() {
        const institution = await transaction.institution.create({
          data: {
            code: "INBOX_" + randomUUID().slice(0, 16),
            name: "Trường kiểm thử thông báo",
          },
        });
        const campus = await transaction.campus.create({
          data: {
            institutionId: institution.id,
            code: "MAIN",
            name: "Cơ sở chính",
            isHeadquarters: true,
            fabricMspId: "TEST_" + randomUUID(),
          },
        });
        const account = await transaction.account.create({
          data: {
            email: randomUUID() + "@example.test",
            passwordHash: "not-a-login-secret",
            displayName: "Cán bộ kiểm thử",
          },
        });
        const membership = await transaction.accountMembership.create({
          data: {
            accountId: account.id,
            campusId: campus.id,
            role: "UNIVERSITY",
            canApproveDiplomas: true,
          },
        });
        const program = await transaction.program.create({
          data: { institutionId: institution.id, code: "XD", name: "Xây dựng" },
        });
        return {
          institution,
          campus,
          account,
          program,
          actor: {
            id: account.id,
            email: account.email,
            membershipId: membership.id,
            role: "university",
            institutionId: institution.id,
            campusId: campus.id,
            studentId: null,
            isHeadquarters: true,
            canApproveDiplomas: true,
          },
        };
      }
      const main = await school(),
        foreign = await school();
      let sequence = 0;
      async function fixture(
        school = main,
        workflowStatus = "REQUESTED",
        anchorStatus = null,
        supersedes = null,
      ) {
        const student =
          supersedes?.student ||
          (await transaction.student.create({
            data: {
              institutionId: school.institution.id,
              studentCode: "INBOX" + ++sequence,
              fullName: "Sinh viên kiểm thử riêng tư",
              dateOfBirth: new Date("2002-01-01"),
            },
          }));
        const account =
          supersedes?.account ||
          (await transaction.account.create({
            data: {
              email: randomUUID() + "@example.test",
              passwordHash: "not-a-login-secret",
              displayName: student.fullName,
              studentId: student.id,
            },
          }));
        const membership = supersedes
          ? { id: supersedes.actor.membershipId }
          : await transaction.accountMembership.create({
              data: {
                accountId: account.id,
                campusId: school.campus.id,
                role: "STUDENT",
              },
            });
        const graduation = supersedes
          ? { id: supersedes.diploma.graduationId }
          : await transaction.graduationRecord.create({
              data: {
                institutionId: school.institution.id,
                studentId: student.id,
                programId: school.program.id,
                graduationYear: 2024,
                classification: "GOOD",
                degreeType: "ENGINEER",
              },
            });
        const diploma = await transaction.diploma.create({
          data: {
            institutionId: school.institution.id,
            campusId: school.campus.id,
            graduationId: graduation.id,
            certificateNo: "VB-" + randomUUID(),
            registryNo: "VS-" + randomUUID(),
            workflowStatus,
            requestedById: school.account.id,
            requestedAt: new Date(),
            ...(supersedes ? { supersedesId: supersedes.diploma.id } : {}),
            ...(workflowStatus === "APPROVED"
              ? {
                  status: "ACTIVE",
                  issuedOn: new Date("2024-06-02"),
                  approvedById: school.account.id,
                  approvedAt: new Date(),
                  issuingCampusId: school.campus.id,
                }
              : {}),
          },
        });
        let version, anchor;
        if (anchorStatus) {
          version = await transaction.diplomaVersion.create({
            data: {
              diplomaId: diploma.id,
              version: 1,
              schemaVersion: "diploma-v1",
              payload: {
                fullName: student.fullName,
                dob: "2002-01-01",
                major: "Xây dựng",
                grade: "Khá",
              },
              payloadHash: "a".repeat(64),
            },
          });
          anchor = await transaction.blockchainAnchor.create({
            data: {
              versionId: version.id,
              eventType: "ISSUE",
              status: anchorStatus,
              channel: "testchannel",
              chaincode: "test",
              payloadHash: "a".repeat(64),
              ...(anchorStatus === "COMMITTED"
                ? {
                    transactionId: randomUUID(),
                    blockNumber: 1n,
                    committedAt: new Date(),
                  }
                : {}),
            },
          });
        }
        return {
          student,
          account,
          diploma,
          version,
          anchor,
          actor: {
            ...school.actor,
            id: account.id,
            email: account.email,
            membershipId: membership.id,
            role: "student",
            studentId: student.id,
            canApproveDiplomas: false,
          },
        };
      }
      const pending = await fixture(),
        rejected = await fixture(main, "REJECTED"),
        source = await fixture(main, "APPROVED", "COMMITTED"),
        failed = await fixture(main, "APPROVED", "FAILED"),
        delayed = await fixture(main, "APPROVED", "QUEUED"),
        recent = await fixture(main, "APPROVED", "QUEUED");
      await fixture(foreign);
      const replacement = await fixture(main, "REQUESTED", null, source);
      const failedEvent = await transaction.outboxEvent.create({
        data: {
          versionId: failed.version.id,
          eventType: "ISSUE",
          payload: {},
          status: "FAILED",
          attempts: 10,
        },
      });
      await transaction.blockchainAnchor.update({
        where: { id: delayed.anchor.id },
        data: { createdAt: new Date(Date.now() - 16 * 60000) },
      });
      const adapter = {
        ...transaction,
        $transaction: (callback) => callback(transaction),
      };
      const service = new InboxService(adapter),
        requestService = new ChangeRequestService(adapter);
      let inbox = await service.list(main.actor);
      const find = (value, key) => value.items.find((item) => item.key === key);
      check(
        "ordinary approval count is scoped",
        find(inbox, "approvals").count === 1,
      );
      check(
        "replacement approval uses distinct destination",
        find(inbox, "replacement-approvals").count === 1 &&
          find(inbox, "replacement-approvals").href.includes(
            "view=replacements",
          ),
      );
      check(
        "rejected normal jobs visible",
        find(inbox, "rejected").count === 1,
      );
      check(
        "failed anchor and dead-letter count once",
        find(inbox, "blockchain-failed").count === 1,
      );
      check(
        "only stale queued transactions are warned",
        find(inbox, "blockchain-delayed").count === 1,
      );
      check(
        "all groups start unread",
        inbox.unread === inbox.items.length && inbox.unread === 5,
      );
      check(
        "notification text never discloses student data",
        !JSON.stringify(inbox).includes(source.student.fullName) &&
          !JSON.stringify(inbox).includes(source.student.studentCode) &&
          !JSON.stringify(inbox).includes(source.account.email),
      );
      check(
        "foreign school sees only own approval",
        (await service.list(foreign.actor)).totalTasks === 1,
      );
      check(
        "student does not see staff tasks",
        (await service.list(source.actor)).items.length === 0,
      );
      const unrelatedCampus = await transaction.campus.create({
        data: {
          institutionId: main.institution.id,
          code: "SCOPE_TEST",
          name: "Cơ sở kiểm thử phạm vi",
        },
      });
      check(
        "same-school other-campus scope cannot see main-campus jobs",
        (await service.list({ ...main.actor, campusId: unrelatedCampus.id }))
          .items.length === 0,
      );
      const initial = find(inbox, "approvals");
      inbox = await service.read(initial.key, initial.fingerprint, main.actor);
      check(
        "read persists without hiding work",
        find(inbox, "approvals").read &&
          inbox.totalTasks === 5 &&
          inbox.unread === 4,
      );
      check(
        "read marker is persisted across reload",
        find(await service.list(main.actor), "approvals").read,
      );
      check(
        "other membership remains unread",
        !find(await service.list(foreign.actor), "approvals").read,
      );
      await fails(
        "stale or invented fingerprint rejected",
        () => service.read(initial.key, "0".repeat(64), main.actor),
        409,
      );
      await fails(
        "unknown category rejected",
        () => service.read("invented", initial.fingerprint, main.actor),
        409,
      );
      await fails(
        "student cannot mark staff categories",
        () => service.read("approvals", initial.fingerprint, source.actor),
        409,
      );
      await fails(
        "employer blocked",
        () => service.list({ ...main.actor, role: "employer" }),
        403,
      );
      await fails(
        "archived two-campus actor blocked",
        () => service.list({ ...main.actor, isHeadquarters: false }),
        403,
      );
      await fails(
        "non-approver blocked",
        () => service.list({ ...main.actor, canApproveDiplomas: false }),
        403,
      );
      await transaction.diploma.update({
        where: { id: pending.diploma.id },
        data: { workflowStatus: "DRAFT" },
      });
      await fixture();
      inbox = await service.list(main.actor);
      check(
        "different job at same count becomes unread",
        find(inbox, "approvals").count === 1 &&
          !find(inbox, "approvals").read &&
          find(inbox, "approvals").fingerprint !== initial.fingerprint,
      );
      await transaction.blockchainAnchor.update({
        where: { id: failed.anchor.id },
        data: {
          status: "COMMITTED",
          transactionId: randomUUID(),
          blockNumber: 2n,
          committedAt: new Date(),
        },
      });
      check(
        "anchor alone does not hide unfinished outbox state",
        !!find(await service.list(main.actor), "blockchain-failed"),
      );
      await transaction.outboxEvent.update({
        where: { id: failedEvent.id },
        data: { status: "COMPLETED", completedAt: new Date() },
      });
      check(
        "resolved failure disappears",
        !find(await service.list(main.actor), "blockchain-failed"),
      );
      const admin = { ...main.actor, role: "admin" };
      const adminInbox = await service.list(admin);
      check(
        "technical admin never receives approval jobs",
        !adminInbox.items.some((item) =>
          [
            "approvals",
            "requests",
            "rejected",
            "replacement-approvals",
          ].includes(item.key),
        ),
      );
      check(
        "technical admin still sees reconciliation tasks",
        !!find(adminInbox, "blockchain-delayed"),
      );

      let request = await requestService.create(
        {
          diplomaId: source.diploma.id,
          reason: "Đối chiếu họ tên với giấy khai sinh",
          changes: [{ field: "fullName", value: "Tên đề nghị chỉnh sửa" }],
        },
        source.actor,
      );
      check(
        "new student request appears in school inbox",
        find(await service.list(main.actor), "requests").count === 1,
      );
      check(
        "own sent request does not notify student as a school response",
        (await service.list(source.actor)).items.length === 0,
      );
      request = await requestService.act(
        request.id,
        {
          status: "IN_REVIEW",
          expectedRevision: request.revision,
          note: "Đã tiếp nhận đối chiếu hồ sơ",
        },
        main.actor,
      );
      check(
        "student receives school processing update",
        !!find(await service.list(source.actor), "student-review"),
      );
      request = await requestService.act(
        request.id,
        {
          status: "NEEDS_INFORMATION",
          expectedRevision: request.revision,
          note: "Cần bổ sung căn cứ văn bản",
        },
        main.actor,
      );
      let studentInbox = await service.list(source.actor);
      check(
        "student sees actionable supplement notice",
        find(studentInbox, "student-supplement").count === 1 &&
          !find(studentInbox, "student-review"),
      );
      check(
        "another student sees no response",
        (await service.list(recent.actor)).items.length === 0,
      );
      const studentItem = find(studentInbox, "student-supplement");
      studentInbox = await service.read(
        studentItem.key,
        studentItem.fingerprint,
        source.actor,
      );
      check(
        "student read marker does not change request status",
        studentInbox.unread === 0 &&
          (
            await transaction.diplomaChangeRequest.findUniqueOrThrow({
              where: { id: request.id },
            })
          ).status === "NEEDS_INFORMATION",
      );
      request = await requestService.act(
        request.id,
        {
          status: "PENDING",
          expectedRevision: request.revision,
          note: "Đã bổ sung số văn bản 12/KT",
        },
        source.actor,
      );
      check(
        "answered supplement leaves notification list",
        (await service.list(source.actor)).items.length === 0,
      );
      request = await requestService.act(
        request.id,
        {
          status: "REJECTED",
          expectedRevision: request.revision,
          note: "Hồ sơ gốc đã ghi đúng thông tin",
        },
        main.actor,
      );
      check(
        "student receives a result without technical details",
        find(await service.list(source.actor), "student-results").count === 1,
      );
      check(
        "closed request leaves officer task list",
        !find(await service.list(main.actor), "requests"),
      );

      const actors = {
        student: source.actor,
        officer: main.actor,
        admin,
        employer: { ...main.actor, role: "employer" },
      };
      const module = await Test.createTestingModule({
        controllers: [InboxController],
        providers: [{ provide: InboxService, useValue: service }],
      })
        .overrideGuard(JwtAuthGuard)
        .useValue({
          canActivate(context) {
            const req = context.switchToHttp().getRequest();
            req.user = actors[req.headers["x-test-role"]];
            return !!req.user;
          },
        })
        .compile();
      const app = module.createNestApplication({ logger: false });
      app.useGlobalPipes(
        new ValidationPipe({
          transform: true,
          transformOptions: { enableImplicitConversion: true },
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );
      await app.listen(0, "127.0.0.1");
      try {
        const base = await app.getUrl();
        async function http(label, suffix, role, status, body) {
          const response = await fetch(base + "/inbox" + suffix, {
            method: body === undefined ? "GET" : "POST",
            headers: {
              "Content-Type": "application/json",
              "x-test-role": role,
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          });
          check(label + " HTTP " + response.status, response.status === status);
          return response.json();
        }
        await http("anonymous blocked", "", "missing", 403);
        await http("employer blocked", "", "employer", 403);
        await http("officer list allowed", "", "officer", 200);
        await http("admin reconciliation allowed", "", "admin", 200);
        await http("student list allowed", "", "student", 200);
        await http("extra recipient field blocked", "/read", "student", 400, {
          ...studentItem,
          membershipId: main.actor.membershipId,
        });
        await http("invalid fingerprint blocked", "/read", "student", 400, {
          key: "student-results",
          fingerprint: "invalid",
        });
        await http("path injection blocked", "/read", "student", 400, {
          key: "../approvals",
          fingerprint: "a".repeat(64),
        });
        await http("stale snapshot returns conflict", "/read", "student", 409, {
          key: studentItem.key,
          fingerprint: studentItem.fingerprint,
        });
        const current = find(
          await service.list(source.actor),
          "student-results",
        );
        await http("read own current group allowed", "/read", "student", 201, {
          key: current.key,
          fingerprint: current.fingerprint,
        });
      } finally {
        await app.close();
      }
      check(
        "business documents are never regenerated by inbox",
        (await transaction.signedDiplomaDocument.count({
          where: { diplomaId: source.diploma.id },
        })) === 0,
      );
      check(
        "replacement request fixture still exists unchanged",
        (
          await transaction.diploma.findUniqueOrThrow({
            where: { id: replacement.diploma.id },
          })
        ).workflowStatus === "REQUESTED",
      );
      check(
        "rejected fixture remains rejected",
        (
          await transaction.diploma.findUniqueOrThrow({
            where: { id: rejected.diploma.id },
          })
        ).workflowStatus === "REJECTED",
      );
      await transaction.$executeRawUnsafe("SAVEPOINT application_role_check");
      await transaction.$executeRawUnsafe("SET LOCAL ROLE diplomachain_app");
      try {
        const applicationInbox = await service.list(main.actor);
        const group = find(applicationInbox, "replacement-approvals");
        check(
          "application DB role can read and acknowledge notifications",
          find(
            await service.read(group.key, group.fingerprint, main.actor),
            group.key,
          ).read,
        );
        const applicationRequest = await requestService.create(
          {
            diplomaId: source.diploma.id,
            reason: "Đối chiếu lại giấy tờ theo yêu cầu mới",
            changes: [{ field: "major", value: "Ngành đề nghị đối chiếu" }],
          },
          source.actor,
        );
        const accepted = await requestService.act(
          applicationRequest.id,
          {
            status: "IN_REVIEW",
            expectedRevision: 1,
            note: "Đã nhận yêu cầu mới để đối chiếu",
          },
          main.actor,
        );
        check(
          "application DB role can create requests, events and audit atomically",
          accepted.revision === 2 && accepted.events.length === 2,
        );
        await fails("application DB role cannot erase request history", () =>
          transaction.diplomaChangeRequestEvent.delete({
            where: { id: accepted.events[0].id },
          }),
        );
        await fails("application DB role cannot delete business requests", () =>
          transaction.diplomaChangeRequest.delete({
            where: { id: applicationRequest.id },
          }),
        );
      } finally {
        await transaction.$executeRawUnsafe(
          "ROLLBACK TO SAVEPOINT application_role_check",
        );
        await transaction.$executeRawUnsafe(
          "RELEASE SAVEPOINT application_role_check",
        );
      }
      throw rollback;
    },
    { timeout: 120000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await database.$disconnect();
}
console.log(
  "PASS: " + checks + " inbox database / HTTP checks; fixtures rolled back.",
);
