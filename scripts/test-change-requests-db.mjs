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
const {
  ChangeRequestService,
} = require("../apps/api/dist/requests/change-request.service.js");
const {
  ChangeRequestController,
} = require("../apps/api/dist/requests/change-request.controller.js");
const { JwtAuthGuard } = require("../apps/api/dist/auth/jwt.guard.js");
const { Test } = require("@nestjs/testing");
const { ValidationPipe } = require("@nestjs/common");
const database = new DatabaseService({ getOrThrow: () => target.href });
const rollback = new Error("ROLLBACK_CHANGE_REQUEST_FIXTURES");
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
        const name = "request_check_" + ++savepoint;
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
            code: "REQ_" + randomUUID().slice(0, 16),
            name: "Trường kiểm thử yêu cầu",
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
        await transaction.accountMembership.create({
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
            role: "university",
            institutionId: institution.id,
            campusId: campus.id,
            isHeadquarters: true,
            canApproveDiplomas: true,
          },
        };
      }
      const main = await school(),
        foreign = await school();
      let sequence = 0;
      async function fixture(school = main, approved = true, source = null) {
        const student =
          source?.student ||
          (await transaction.student.create({
            data: {
              institutionId: school.institution.id,
              studentCode: "REQ" + ++sequence,
              fullName: "Nguyễn Văn Kiểm Thử",
              dateOfBirth: new Date("2002-01-01"),
            },
          }));
        const account =
          source?.account ||
          (await transaction.account.create({
            data: {
              email: randomUUID() + "@example.test",
              passwordHash: "not-a-login-secret",
              displayName: student.fullName,
              studentId: student.id,
            },
          }));
        const graduation =
          source?.graduation ||
          (await transaction.graduationRecord.create({
            data: {
              institutionId: school.institution.id,
              studentId: student.id,
              programId: school.program.id,
              graduationYear: 2024,
              classification: "GOOD",
              degreeType: "ENGINEER",
            },
          }));
        const diploma = await transaction.diploma.create({
          data: {
            institutionId: school.institution.id,
            campusId: school.campus.id,
            graduationId: graduation.id,
            certificateNo: "VB-" + randomUUID(),
            registryNo: "VS-" + randomUUID(),
            ...(source ? { supersedesId: source.diploma.id } : {}),
            ...(approved
              ? {
                  status: "ACTIVE",
                  workflowStatus: "APPROVED",
                  issuedOn: new Date("2024-06-02"),
                  requestedById: school.account.id,
                  requestedAt: new Date(),
                  approvedById: school.account.id,
                  approvedAt: new Date(),
                  issuingCampusId: school.campus.id,
                }
              : {}),
          },
        });
        const version = await transaction.diplomaVersion.create({
          data: {
            diplomaId: diploma.id,
            version: 1,
            schemaVersion: "diploma-v1",
            payload: {
              fullName: "Tên trong bản đã cấp",
              dob: "2002-01-01",
              major: "Xây dựng",
              grade: "Khá",
            },
            payloadHash: "a".repeat(64),
          },
        });
        if (approved)
          await transaction.blockchainAnchor.create({
            data: {
              versionId: version.id,
              eventType: "ISSUE",
              status: "COMMITTED",
              channel: "testchannel",
              chaincode: "test",
              payloadHash: "a".repeat(64),
              transactionId: randomUUID(),
              blockNumber: 1n,
              committedAt: new Date(),
            },
          });
        return {
          student,
          account,
          graduation,
          diploma,
          version,
          actor: {
            ...school.actor,
            id: account.id,
            email: account.email,
            role: "student",
            studentId: student.id,
            canApproveDiplomas: false,
          },
        };
      }
      const first = await fixture(),
        otherStudent = await fixture(),
        outside = await fixture(foreign),
        draft = await fixture(main, false);
      const adapter = {
        ...transaction,
        $transaction: (callback) => callback(transaction),
      };
      const service = new ChangeRequestService(adapter);
      const body = {
        diplomaId: first.diploma.id,
        reason: "Đối chiếu họ tên với giấy khai sinh",
        changes: [{ field: "fullName", value: "Nguyễn Văn Đúng" }],
      };
      const beforeDiploma = await transaction.diploma.findUniqueOrThrow({
        where: { id: first.diploma.id },
      });
      const request = await service.create(body, first.actor);
      check(
        "captures the immutable issued snapshot, not mutable student profile",
        request.changes[0].before === "Tên trong bản đã cấp",
      );
      check(
        "starts with a visible timeline",
        request.status === "PENDING" &&
          request.events.length === 1 &&
          request.revision === 1,
      );
      check(
        "request does not change official diploma",
        JSON.stringify(beforeDiploma) ===
          JSON.stringify(
            await transaction.diploma.findUniqueOrThrow({
              where: { id: first.diploma.id },
            }),
          ),
      );
      check(
        "student sees own request",
        (await service.list({ page: 1, limit: 20 }, first.actor)).total === 1,
      );
      check(
        "other student cannot list it",
        (await service.list({ page: 1, limit: 20 }, otherStudent.actor))
          .total === 0,
      );
      check(
        "other institution cannot list it",
        (await service.list({ page: 1, limit: 20 }, foreign.actor)).total === 0,
      );
      check(
        "officer sees scoped request",
        (await service.list({ page: 1, limit: 20 }, main.actor)).total === 1,
      );
      check(
        "active request is exposed in eligible picker",
        (await service.eligible(first.actor)).data[0].activeRequestId ===
          request.id,
      );
      await fails(
        "duplicate active request rejected",
        () => service.create(body, first.actor),
        409,
      );
      await fails(
        "cannot request for another student",
        () => service.create(body, otherStudent.actor),
        404,
      );
      await fails(
        "cannot request across institution",
        () =>
          service.create(
            { ...body, diplomaId: outside.diploma.id },
            first.actor,
          ),
        404,
      );
      await fails(
        "cannot request for unsigned diploma",
        () =>
          service.create({ ...body, diplomaId: draft.diploma.id }, draft.actor),
        409,
      );
      await fails(
        "unchanged suggested value rejected",
        () =>
          service.create(
            {
              ...body,
              diplomaId: otherStudent.diploma.id,
              changes: [{ field: "dob", value: "2002-01-01" }],
            },
            otherStudent.actor,
          ),
        400,
      );
      await fails(
        "impossible calendar date rejected",
        () =>
          service.create(
            {
              ...body,
              diplomaId: otherStudent.diploma.id,
              changes: [{ field: "dob", value: "2002-02-30" }],
            },
            otherStudent.actor,
          ),
        400,
      );
      await fails(
        "future birth date rejected",
        () =>
          service.create(
            {
              ...body,
              diplomaId: otherStudent.diploma.id,
              changes: [{ field: "dob", value: "2199-01-01" }],
            },
            otherStudent.actor,
          ),
        400,
      );
      const action = {
        status: "IN_REVIEW",
        expectedRevision: 1,
        note: "Đã tiếp nhận và đối chiếu căn cứ",
      };
      await fails(
        "student cannot self-approve processing",
        () => service.act(request.id, action, first.actor),
        409,
      );
      await fails(
        "foreign officer cannot process",
        () => service.act(request.id, action, foreign.actor),
        404,
      );
      await fails(
        "technical admin cannot process",
        () => service.act(request.id, action, { ...main.actor, role: "admin" }),
        403,
      );
      await fails(
        "non-approver cannot process",
        () =>
          service.act(request.id, action, {
            ...main.actor,
            canApproveDiplomas: false,
          }),
        403,
      );
      let updated = await service.act(request.id, action, main.actor);
      check(
        "officer accepts and advances revision",
        updated.status === "IN_REVIEW" && updated.revision === 2,
      );
      await fails(
        "stale write rejected",
        () =>
          service.act(
            request.id,
            { ...action, status: "REJECTED" },
            main.actor,
          ),
        409,
      );
      await fails(
        "student cannot withdraw while staff is processing",
        () =>
          service.act(
            request.id,
            { ...action, status: "CANCELLED", expectedRevision: 2 },
            first.actor,
          ),
        409,
      );
      updated = await service.act(
        request.id,
        { ...action, status: "NEEDS_INFORMATION", expectedRevision: 2 },
        main.actor,
      );
      updated = await service.act(
        request.id,
        {
          ...action,
          status: "PENDING",
          expectedRevision: 3,
          note: "Đã cung cấp số văn bản đối chiếu",
        },
        first.actor,
      );
      check(
        "student can supplement and resubmit",
        updated.revision === 4 && updated.status === "PENDING",
      );
      updated = await service.act(
        request.id,
        { ...action, expectedRevision: 4 },
        main.actor,
      );
      await fails(
        "resolution requires replacement reference",
        () =>
          service.act(
            request.id,
            { ...action, status: "RESOLVED", expectedRevision: 5 },
            main.actor,
          ),
        400,
      );
      await fails(
        "unrelated diploma cannot resolve a request",
        () =>
          service.act(
            request.id,
            {
              ...action,
              status: "RESOLVED",
              expectedRevision: 5,
              resolvedDiplomaId: otherStudent.diploma.id,
            },
            main.actor,
          ),
        409,
      );
      const replacement = await fixture(main, false, first);
      await fails(
        "unpublished replacement cannot resolve a request",
        () =>
          service.act(
            request.id,
            {
              ...action,
              status: "RESOLVED",
              expectedRevision: 5,
              resolvedDiplomaId: replacement.diploma.id,
            },
            main.actor,
          ),
        409,
      );
      await transaction.diploma.update({
        where: { id: first.diploma.id },
        data: {
          status: "SUPERSEDED",
          revokedAt: new Date(),
          revokedReason: "Thay thế sau đối chiếu",
        },
      });
      await transaction.diploma.update({
        where: { id: replacement.diploma.id },
        data: {
          status: "ACTIVE",
          workflowStatus: "APPROVED",
          issuedOn: new Date("2024-06-03"),
          requestedById: main.account.id,
          requestedAt: new Date(),
          approvedById: main.account.id,
          approvedAt: new Date(),
          issuingCampusId: main.campus.id,
        },
      });
      await transaction.blockchainAnchor.create({
        data: {
          versionId: replacement.version.id,
          eventType: "ISSUE",
          status: "COMMITTED",
          channel: "testchannel",
          chaincode: "test",
          payloadHash: "a".repeat(64),
          transactionId: randomUUID(),
          blockNumber: 2n,
          committedAt: new Date(),
        },
      });
      await fails(
        "cannot finish until old diploma revocation is confirmed",
        () =>
          service.act(
            request.id,
            {
              ...action,
              status: "RESOLVED",
              expectedRevision: 5,
              resolvedDiplomaId: replacement.diploma.id,
            },
            main.actor,
          ),
        409,
      );
      await transaction.blockchainAnchor.create({
        data: {
          versionId: first.version.id,
          eventType: "REVOKE",
          status: "COMMITTED",
          channel: "testchannel",
          chaincode: "test",
          payloadHash: "a".repeat(64),
          transactionId: randomUUID(),
          blockNumber: 3n,
          committedAt: new Date(),
        },
      });
      updated = await service.act(
        request.id,
        {
          ...action,
          status: "RESOLVED",
          expectedRevision: 5,
          resolvedDiplomaId: replacement.diploma.id,
        },
        main.actor,
      );
      check(
        "confirmed replacement closes with full timeline",
        updated.status === "RESOLVED" &&
          updated.resolvedDiplomaId === replacement.diploma.id &&
          updated.events.length === 6,
      );
      await fails(
        "closed requests cannot reopen",
        () =>
          service.act(
            request.id,
            { ...action, expectedRevision: 6 },
            main.actor,
          ),
        409,
      );
      await fails("database rejects mutating original request", () =>
        transaction.diplomaChangeRequest.update({
          where: { id: request.id },
          data: { reason: "Thay đổi nội dung sau tiếp nhận", revision: 7 },
        }),
      );
      await fails("database protects request event history", () =>
        transaction.diplomaChangeRequestEvent.update({
          where: { id: updated.events[0].id },
          data: { note: "Changed history" },
        }),
      );
      check(
        "each transition has an audit event",
        (await transaction.auditLog.count({
          where: { target: request.id, action: "DIPLOMA_CHANGE_REQUEST" },
        })) === 6,
      );
      const second = await service.create(
        { ...body, diplomaId: otherStudent.diploma.id },
        otherStudent.actor,
      );
      const withdrawn = await service.act(
        second.id,
        {
          status: "CANCELLED",
          expectedRevision: 1,
          note: "Xin rút để kiểm tra lại giấy tờ",
        },
        otherStudent.actor,
      );
      check(
        "student can withdraw pending request",
        withdrawn.status === "CANCELLED",
      );
      const third = await service.create(
        { ...body, diplomaId: otherStudent.diploma.id },
        otherStudent.actor,
      );
      const rejected = await service.act(
        third.id,
        {
          status: "REJECTED",
          expectedRevision: 1,
          note: "Thông tin hiện tại khớp hồ sơ gốc",
        },
        main.actor,
      );
      check(
        "officer rejection carries a visible reason",
        rejected.status === "REJECTED" &&
          rejected.events.at(-1).note.includes("hồ sơ gốc"),
      );

      const actors = {
        student: first.actor,
        officer: main.actor,
        other: otherStudent.actor,
        admin: { ...main.actor, role: "admin" },
      };
      const module = await Test.createTestingModule({
        controllers: [ChangeRequestController],
        providers: [{ provide: ChangeRequestService, useValue: service }],
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
          whitelist: true,
          forbidNonWhitelisted: true,
        }),
      );
      await app.listen(0, "127.0.0.1");
      try {
        const base = await app.getUrl();
        async function http(label, url, role, status, body) {
          const response = await fetch(base + "/change-requests" + url, {
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
        await http("unauthenticated blocked", "", "missing", 403);
        await http("admin blocked", "", "admin", 403);
        await http("student can read own requests", "", "student", 200);
        await http(
          "officer can filter requests",
          "?status=RESOLVED",
          "officer",
          200,
        );
        await http("invalid page blocked", "?page=0", "officer", 400);
        await http("oversized page blocked", "?limit=1000", "officer", 400);
        await http(
          "unknown status blocked",
          "?status=APPROVED",
          "officer",
          400,
        );
        await http(
          "invalid UUID blocked",
          "/not-uuid/action",
          "student",
          400,
          action,
        );
        await http("extra fields blocked", "", "student", 400, {
          ...body,
          requesterId: main.account.id,
        });
        await http("duplicate change fields blocked", "", "student", 400, {
          ...body,
          changes: [body.changes[0], body.changes[0]],
        });
        await http("unknown change field blocked", "", "student", 400, {
          ...body,
          changes: [{ field: "approvedById", value: main.account.id }],
        });
        await http(
          "short note blocked",
          "/" + request.id + "/action",
          "officer",
          400,
          { ...action, note: "a" },
        );
        await http(
          "missing revision blocked",
          "/" + request.id + "/action",
          "officer",
          400,
          { status: "REJECTED", note: "Cần kiểm tra" },
        );
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
  await database.$disconnect();
}
console.log(
  "PASS: " +
    checks +
    " correction request database / HTTP checks; fixtures rolled back.",
);
