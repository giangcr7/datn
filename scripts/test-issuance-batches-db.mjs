import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";

assert(
  process.env.ISSUANCE_TEST_DATABASE_URL,
  "Set ISSUANCE_TEST_DATABASE_URL to a disposable local test database",
);
const target = new URL(process.env.ISSUANCE_TEST_DATABASE_URL);
assert(
  ["localhost", "127.0.0.1"].includes(target.hostname) &&
    target.pathname === "/diplomachain_issuance_test",
  "Refusing to run against a business database",
);
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require("../apps/api/dist/database/database.service.js");
const { CertService } = require("../apps/api/dist/cert/cert.service.js");
const {
  IssuanceBatchService,
} = require("../apps/api/dist/cert/issuance-batch.service.js");
const {
  IssuanceBatchController,
} = require("../apps/api/dist/cert/issuance-batch.controller.js");
const { JwtAuthGuard } = require("../apps/api/dist/auth/jwt.guard.js");
const { Test } = require("@nestjs/testing");
const { ValidationPipe } = require("@nestjs/common");
const database = new DatabaseService({ getOrThrow: () => target.href });
const rollback = new Error("ROLLBACK_ISSUANCE_BATCH_FIXTURES");
const institutions = [];
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
        const name = "batch_check_" + ++savepoint;
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
            code: "BATCH_" + randomUUID().slice(0, 20),
            name: "Trường kiểm thử",
            nameEn: "Test University",
          },
        });
        institutions.push(institution.id);
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
          data: {
            institutionId: institution.id,
            code: "XD",
            name: "Xây dựng",
            nameEn: "Civil Engineering",
          },
        });
        const decision = await transaction.graduationDecision.create({
          data: {
            institutionId: institution.id,
            documentNumber: "123/QĐ-KT",
            decisionYear: 2024,
            signedOn: new Date("2024-06-01"),
          },
        });
        return {
          institution,
          campus,
          account,
          program,
          decision,
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
      async function fixture(changes = {}) {
        const school = changes.school || main;
        const student = await transaction.student.create({
          data: {
            institutionId: school.institution.id,
            studentCode: String(++sequence).padStart(8, "0"),
            fullName: "Nguyễn Văn Kiểm Thử " + sequence,
            dateOfBirth: new Date("2002-01-01"),
          },
        });
        const graduation = await transaction.graduationRecord.create({
          data: {
            institutionId: school.institution.id,
            studentId: student.id,
            programId: school.program.id,
            decisionId: changes.decisionId || school.decision.id,
            graduationYear: changes.year || 2024,
            classification: "GOOD",
            degreeType: "ENGINEER",
          },
        });
        return transaction.diploma.create({
          data: {
            institutionId: school.institution.id,
            campusId: school.campus.id,
            graduationId: graduation.id,
            certificateNo: "VB-" + sequence,
            registryNo: "VS-" + sequence,
            issuedOn: changes.invalid ? null : new Date("2024-06-02"),
            printTemplate: "tlu-bilingual-v1",
            majorNameEn: "Civil Engineering",
            issuePlace: "TP.HCM",
            diplomaSignerName: "Người ký",
            diplomaSignerTitle: "Hiệu trưởng",
          },
        });
      }
      const first = await fixture(),
        second = await fixture(),
        invalid = await fixture({ invalid: true }),
        outside = await fixture({ school: foreign }),
        wrongYear = await fixture({ year: 2023 });
      const otherDecision = await transaction.graduationDecision.create({
        data: {
          institutionId: main.institution.id,
          documentNumber: "456/QĐ-KT",
          decisionYear: 2024,
          signedOn: new Date("2024-06-01"),
        },
      });
      const wrongDecision = await fixture({ decisionId: otherDecision.id });
      const unsignedDecision = await transaction.graduationDecision.create({
        data: {
          institutionId: main.institution.id,
          documentNumber: "NO-DATE",
          decisionYear: 2024,
        },
      });
      let signCalls = 0;
      const adapter = {
        ...transaction,
        $transaction: (callback) => callback(transaction),
      };
      const certificates = new CertService(adapter, {
        prepareFinal: async () => {
          signCalls++;
          return null;
        },
      });
      const service = new IssuanceBatchService(adapter, certificates);
      const metadata = {
        code: "TEST_2024",
        name: "Đợt kiểm thử",
        decisionId: main.decision.id,
        graduationYear: 2024,
      };
      const query = { page: 1, limit: 20 };
      const batch = (await service.create(metadata, main.actor)).data;
      check(
        "creates a scoped batch from an existing graduation decision",
        batch.decisionNo === "123/QĐ-KT" && batch.decisionDate === "2024-06-01",
      );
      await fails(
        "duplicate code has a readable conflict",
        () => service.create(metadata, main.actor),
        409,
      );
      await fails(
        "cross-institution decision rejected",
        () =>
          service.create(
            { ...metadata, code: "FOREIGN", decisionId: foreign.decision.id },
            main.actor,
          ),
        400,
      );
      await fails(
        "cross-institution program rejected",
        () =>
          service.create(
            {
              ...metadata,
              code: "FOREIGN_PROGRAM",
              programId: foreign.program.id,
            },
            main.actor,
          ),
        400,
      );
      await fails(
        "missing decision date is not invented",
        () =>
          service.create(
            { ...metadata, code: "NO_DATE", decisionId: unsignedDecision.id },
            main.actor,
          ),
        400,
      );
      await fails(
        "future graduation year rejected",
        () =>
          service.create(
            { ...metadata, code: "FUTURE", graduationYear: 2200 },
            main.actor,
          ),
        400,
      );
      await fails(
        "empty graduation scope rejected",
        () =>
          service.create(
            { ...metadata, code: "EMPTY", graduationYear: 1900 },
            main.actor,
          ),
        400,
      );
      await fails(
        "other institution cannot inspect batch",
        () => service.detail(batch.id, query, foreign.actor),
        404,
      );
      for (const flags of [
        { role: "admin" },
        { role: "student" },
        { isHeadquarters: false },
        { canApproveDiplomas: false },
      ])
        await fails(
          "scope rejected " + JSON.stringify(flags),
          () => service.list(query, { ...main.actor, ...flags }),
          403,
        );
      const options = await service.options({}, main.actor);
      check(
        "options never leak another institution",
        !options.decisions.some((item) => item.id === foreign.decision.id) &&
          !options.programs.some((item) => item.id === foreign.program.id),
      );
      check(
        "options retain actual graduation years rather than decision-year inference",
        options.decisions
          .find((item) => item.id === main.decision.id)
          .graduationYears.includes(2023),
      );
      check(
        "server search narrows decision options",
        (await service.options({ search: "NO-DATE" }, main.actor)).decisions
          .length === 0,
      );
      const candidates = await service.candidates(batch.id, query, main.actor);
      check(
        "candidate scope matches decision, year and institution",
        candidates.pagination.total === 3 &&
          !candidates.data.some((row) =>
            [outside.id, wrongYear.id, wrongDecision.id].includes(row.uuid),
          ),
      );
      check(
        "incomplete drafts remain visible with specific errors",
        candidates.data
          .find((row) => row.uuid === invalid.id)
          .checkErrors.some(
            (error) => error.includes("Ngày cấp") || error.includes("ngày cấp"),
          ),
      );
      await fails(
        "mixed invalid membership does not partially attach valid records",
        () =>
          service.changeMembers(
            batch.id,
            { diplomaIds: [first.id, outside.id] },
            true,
            main.actor,
          ),
        409,
      );
      check(
        "failed mixed membership has no partial write",
        (
          await transaction.diploma.findUniqueOrThrow({
            where: { id: first.id },
          })
        ).issuanceBatchId === null,
      );
      await service.changeMembers(
        batch.id,
        { diplomaIds: [first.id, second.id, invalid.id] },
        true,
        main.actor,
      );
      check(
        "one atomic membership action attaches selected drafts",
        (await service.detail(batch.id, query, main.actor)).summary.total === 3,
      );
      check(
        "attached candidates disappear from the unassigned list",
        (await service.candidates(batch.id, query, main.actor)).pagination
          .total === 0,
      );
      const another = (
        await service.create({ ...metadata, code: "SECOND" }, main.actor)
      ).data;
      await fails(
        "same diploma cannot be assigned twice",
        () =>
          service.changeMembers(
            another.id,
            { diplomaIds: [first.id] },
            true,
            main.actor,
          ),
        409,
      );
      const filtered = await service.detail(
        batch.id,
        { ...query, status: "NEEDS_REVIEW", limit: 1 },
        main.actor,
      );
      check(
        "full-batch summary ignores visible page and filter",
        filtered.summary.total === 3 &&
          filtered.summary.ready === 2 &&
          filtered.summary.needsReview === 1 &&
          filtered.data.length === 1,
      );
      check(
        "specific filter contains only the offending row",
        filtered.data[0].uuid === invalid.id && filtered.pagination.total === 1,
      );
      const noSign = signCalls;
      await service.detail(batch.id, query, main.actor);
      await service.list(query, main.actor);
      check(
        "checking and listing never invoke signing",
        signCalls === noSign && (await transaction.outboxEvent.count()) === 0,
      );
      await service.changeMembers(
        batch.id,
        { diplomaIds: [second.id] },
        false,
        main.actor,
      );
      check(
        "removal only clears batch membership, never deletes the diploma",
        (
          await transaction.diploma.findUniqueOrThrow({
            where: { id: second.id },
          })
        ).issuanceBatchId === null,
      );
      await service.changeMembers(
        batch.id,
        { diplomaIds: [second.id] },
        true,
        main.actor,
      );
      await fails(
        "database enforces year consistency for linked graduation",
        () =>
          transaction.graduationRecord.update({
            where: { id: first.graduationId },
            data: { graduationYear: 2023 },
          }),
      );
      await fails("database freezes batch metadata", () =>
        transaction.diplomaIssuanceBatch.update({
          where: { id: batch.id },
          data: { name: "Changed after creation" },
        }),
      );
      await fails("database freezes the referenced decision", () =>
        transaction.graduationDecision.update({
          where: { id: main.decision.id },
          data: { signedOn: new Date("2024-06-03") },
        }),
      );
      await fails(
        "database rejects direct attachment outside the decision",
        () =>
          transaction.diploma.update({
            where: { id: wrongDecision.id },
            data: { issuanceBatchId: batch.id },
          }),
      );
      const before = await transaction.diploma.findUniqueOrThrow({
        where: { id: first.id },
      });
      await transaction.diploma.update({
        where: { id: first.id },
        data: { issuePlace: "Nơi cấp đã đối chiếu lại" },
      });
      const stale = await service.publish(
        batch.id,
        {
          entries: [
            {
              uuid: first.id,
              expectedUpdatedAt: before.updatedAt.toISOString(),
              expectedReviewToken: "0".repeat(64),
            },
          ],
        },
        main.actor,
      );
      check(
        "stale preview cannot sign a modified record",
        stale.failed === 1 &&
          stale.results[0].error.includes("thay đổi") &&
          signCalls === noSign,
      );
      const checkedRelated = (
        await service.detail(batch.id, query, main.actor)
      ).data.find((row) => row.uuid === first.id);
      const academic = await transaction.graduationRecord.findUniqueOrThrow({
        where: { id: first.graduationId },
      });
      await transaction.student.update({
        where: { id: academic.studentId },
        data: { fullName: "Họ tên đã được đối soát lại" },
      });
      const staleRelated = await service.publish(
        batch.id,
        {
          entries: [
            {
              uuid: first.id,
              expectedUpdatedAt: checkedRelated.updatedAt.toISOString(),
              expectedReviewToken: checkedRelated.reviewToken,
            },
          ],
        },
        main.actor,
      );
      check(
        "related student edits cannot bypass the checked-content token",
        staleRelated.failed === 1 && signCalls === noSign,
      );
      const latest = await service.detail(batch.id, query, main.actor);
      const published = await service.publish(
        batch.id,
        {
          entries: latest.data.map((row) => ({
            uuid: row.uuid,
            expectedUpdatedAt: row.updatedAt.toISOString(),
            expectedReviewToken: row.reviewToken,
          })),
        },
        main.actor,
      );
      check(
        "per-record publication reports partial success without hiding failures",
        published.succeeded === 2 &&
          published.failed === 1 &&
          published.results.find((row) => row.uuid === invalid.id).success ===
            false,
      );
      check(
        "successful rows create outbox entries exactly once",
        (await transaction.outboxEvent.count()) === 2 &&
          signCalls === noSign + 2,
      );
      check(
        "approval is not falsely reported as blockchain confirmation",
        (await service.detail(batch.id, query, main.actor)).summary
          .ANCHOR_PENDING === 2 &&
          (await service.list(query, main.actor)).data.find(
            (row) => row.id === batch.id,
          ).summary.ON_CHAIN === 0,
      );
      await fails(
        "approved records cannot be removed",
        () =>
          service.changeMembers(
            batch.id,
            { diplomaIds: [first.id] },
            false,
            main.actor,
          ),
        409,
      );
      await fails("database blocks direct removal of approved membership", () =>
        transaction.diploma.update({
          where: { id: first.id },
          data: { issuanceBatchId: null },
        }),
      );
      const again = await service.publish(
        batch.id,
        {
          entries: latest.data
            .filter((row) => row.ready)
            .map((row) => ({
              uuid: row.uuid,
              expectedUpdatedAt: row.updatedAt.toISOString(),
              expectedReviewToken: row.reviewToken,
            })),
        },
        main.actor,
      );
      check(
        "repeated clicks do not create duplicate signatures or anchors",
        again.succeeded === 0 &&
          (await transaction.outboxEvent.count()) === 2 &&
          signCalls === noSign + 2,
      );
      const version = await transaction.diplomaVersion.findFirstOrThrow({
        where: { diplomaId: first.id },
      });
      const otherVersion = await transaction.diplomaVersion.findFirstOrThrow({
        where: { diplomaId: second.id },
      });
      await transaction.blockchainAnchor.updateMany({
        where: { versionId: version.id },
        data: {
          status: "COMMITTED",
          transactionId: "isolated-" + randomUUID(),
          blockNumber: 1n,
          committedAt: new Date(),
        },
      });
      await transaction.blockchainAnchor.updateMany({
        where: { versionId: otherVersion.id },
        data: { status: "FAILED", lastError: "Synthetic network failure" },
      });
      const committed = await service.detail(batch.id, query, main.actor);
      check(
        "confirmed and failed anchors have distinct counts",
        committed.summary.ON_CHAIN === 1 &&
          committed.summary.ANCHOR_FAILED === 1 &&
          committed.summary.DRAFT === 1,
      );
      const listed = (await service.list(query, main.actor)).data.find(
        (row) => row.id === batch.id,
      );
      check(
        "overview and detail agree on every exclusive state",
        [
          "total",
          "DRAFT",
          "PENDING",
          "REJECTED",
          "ANCHOR_PENDING",
          "ANCHOR_FAILED",
          "ON_CHAIN",
          "REVOKED",
          "REPLACED",
        ].every((state) => listed.summary[state] === committed.summary[state]),
      );
      check(
        "publication preserves the approved payload hash",
        (
          await transaction.diplomaVersion.findUniqueOrThrow({
            where: { id: version.id },
          })
        ).payloadHash === version.payloadHash,
      );
      check(
        "all membership and creation changes have institutional audit",
        (await transaction.auditLog.count({
          where: {
            institutionId: main.institution.id,
            action: {
              in: [
                "CREATE_ISSUANCE_BATCH",
                "ADD_ISSUANCE_BATCH_MEMBERS",
                "REMOVE_ISSUANCE_BATCH_MEMBERS",
              ],
            },
          },
        })) === 5,
      );
      check(
        "isolated test does not create PDF files or signed documents",
        (await transaction.signedDiplomaDocument.count()) === 0,
      );

      let httpActor = main.actor;
      const module = await Test.createTestingModule({
        controllers: [IssuanceBatchController],
        providers: [{ provide: IssuanceBatchService, useValue: service }],
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
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      await app.listen(0, "127.0.0.1");
      const base = await app.getUrl();
      async function request(path = "", method = "GET", body) {
        return fetch(base + "/cert/issuance-batches" + path, {
          method,
          headers: { "Content-Type": "application/json" },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
      }
      try {
        const response = await request("/" + batch.id + "?status=NEEDS_REVIEW");
        check(
          "HTTP detail is private and applies typed filters",
          response.ok &&
            response.headers.get("cache-control").includes("no-store") &&
            (await response.json()).pagination.total === 1,
        );
        for (const suffix of [
          "?page=0",
          "?limit=101",
          "?status=INVALID",
          "/not-a-uuid",
          "/options?extra=bad",
        ])
          check(
            "HTTP rejects invalid query " + suffix,
            (await request(suffix)).status === 400,
          );
        for (const body of [
          { diplomaIds: [] },
          { diplomaIds: [invalid.id, invalid.id] },
          { diplomaIds: ["bad-id"] },
          { diplomaIds: Array(101).fill(invalid.id) },
          { diplomaIds: [invalid.id], institutionId: foreign.institution.id },
        ])
          check(
            "HTTP rejects unsafe membership payload",
            (await request("/" + batch.id + "/members", "POST", body))
              .status === 400,
          );
        for (const entries of [
          [],
          [null],
          [{ uuid: invalid.id, expectedUpdatedAt: "invalid" }],
          Array(2).fill({
            uuid: invalid.id,
            expectedUpdatedAt: invalid.updatedAt.toISOString(),
          }),
        ])
          check(
            "HTTP rejects unsafe publication payload",
            (await request("/" + batch.id + "/publish", "POST", { entries }))
              .status === 400,
          );
        for (const flags of [
          { role: "admin" },
          { role: "student" },
          { isHeadquarters: false },
          { canApproveDiplomas: false },
        ]) {
          httpActor = { ...main.actor, ...flags };
          check(
            "HTTP denies unauthorized list " + JSON.stringify(flags),
            (await request()).status === 403,
          );
          check(
            "HTTP denies unauthorized mutation " + JSON.stringify(flags),
            (
              await request("/" + batch.id + "/members/remove", "POST", {
                diplomaIds: [invalid.id],
              })
            ).status === 403,
          );
        }
        httpActor = foreign.actor;
        check(
          "HTTP hides other institution batch",
          (await request("/" + batch.id)).status === 404,
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
  try {
    check(
      "all synthetic fixtures are rolled back",
      (await database.institution.count({
        where: { id: { in: institutions } },
      })) === 0,
    );
  } finally {
    await database.$disconnect();
  }
}
console.log(
  "Issuance batch database/HTTP checks passed: " +
    checks +
    ". All fixtures rolled back; no live Fabric or PDF writes.",
);
