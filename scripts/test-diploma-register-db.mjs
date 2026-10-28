import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { config } from "dotenv";

config({ path: new URL("../apps/api/.env", import.meta.url), quiet: true });
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require("../apps/api/dist/database/database.service.js");
const { CertService } = require("../apps/api/dist/cert/cert.service.js");
const { CertController } = require("../apps/api/dist/cert/cert.controller.js");
const {
  DashboardService,
} = require("../apps/api/dist/dashboard/dashboard.service.js");
const {
  DashboardController,
} = require("../apps/api/dist/dashboard/dashboard.controller.js");
const {
  dashboardQuery,
  dashboardImportQuery,
} = require("../apps/api/dist/dashboard/dashboard-query.js");
const {
  ExplorerService,
} = require("../apps/api/dist/explorer/explorer.service.js");
const {
  ExplorerController,
} = require("../apps/api/dist/explorer/explorer.controller.js");
const {
  AnchorQueryDto,
} = require("../apps/api/dist/explorer/anchor-query.dto.js");
const { payloadHash } = require("../apps/api/dist/database/diploma-hash.js");
const {
  RegisterQueryDto,
} = require("../apps/api/dist/cert/register-query.dto.js");
const { JwtAuthGuard } = require("../apps/api/dist/auth/jwt.guard.js");
const { Test } = require("@nestjs/testing");
const { ValidationPipe } = require("@nestjs/common");
const database = new DatabaseService({
  getOrThrow: () => process.env.DATABASE_URL,
});
const rollback = new Error("ROLLBACK_REGISTER_FIXTURES");
let checks = 0;
const institutions = [];
function check(label, condition) {
  assert(condition, label);
  checks++;
}

try {
  await database.$transaction(
    async (transaction) => {
      async function school() {
        const institution = await transaction.institution.create({
          data: {
            code: "REG_" + randomUUID().slice(0, 24),
            name: "Register regression institution",
          },
        });
        institutions.push(institution.id);
        const campus = await transaction.campus.create({
          data: {
            institutionId: institution.id,
            code: "MAIN",
            name: "Main campus",
            isHeadquarters: true,
            fabricMspId: "Test_" + randomUUID(),
          },
        });
        const account = await transaction.account.create({
          data: {
            email: randomUUID() + "@example.test",
            displayName: "Register regression officer",
            passwordHash: "not-a-login-secret",
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
            code: "IT",
            name: "Ngành hiện tại đã đổi tên",
          },
        });
        const decision = await transaction.graduationDecision.create({
          data: {
            institutionId: institution.id,
            documentNumber: "999/QĐ-MỚI",
            decisionYear: 2025,
            signedOn: new Date("2025-01-01"),
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
      const main = await school();
      const foreign = await school();
      let sequence = 0;
      async function fixture(options = {}) {
        const target = options.school || main;
        const number = ++sequence;
        const student = await transaction.student.create({
          data: {
            institutionId: target.institution.id,
            studentCode: "CURRENT-" + number,
            fullName: "Họ tên hiện tại " + number,
            dateOfBirth: new Date("2002-01-01"),
          },
        });
        const graduation = await transaction.graduationRecord.create({
          data: {
            institutionId: target.institution.id,
            studentId: student.id,
            programId: target.program.id,
            graduationYear: 2025,
            decisionId: target.decision.id,
          },
        });
        const status = options.status || "ACTIVE";
        const workflowStatus = options.workflowStatus || "APPROVED";
        const diploma = await transaction.diploma.create({
          data: {
            institutionId: target.institution.id,
            campusId: target.campus.id,
            issuingCampusId:
              workflowStatus === "APPROVED" ? target.campus.id : null,
            graduationId: graduation.id,
            certificateNo: "CURRENT-VB-" + number,
            registryNo: "CURRENT-VS-" + number,
            issuedOn: new Date("2025-01-01"),
            status,
            workflowStatus,
            requestedById:
              workflowStatus !== "DRAFT" ? target.account.id : null,
            requestedAt: workflowStatus !== "DRAFT" ? new Date() : null,
            approvedById:
              workflowStatus === "APPROVED" ? target.account.id : null,
            approvedAt: workflowStatus === "APPROVED" ? new Date() : null,
            revokedAt: status === "REVOKED" ? new Date() : null,
            revokedReason: status === "REVOKED" ? "Đối soát hồ sơ" : null,
            currentVersion: options.olderVersion ? 2 : 1,
            createdAt: new Date("2026-01-01"),
          },
        });
        const payload = options.payload ?? {
          uuid: diploma.id,
          fullName: "Nguyễn Văn An " + number,
          mssv: "00123456" + number,
          major: "Công nghệ thông tin (50%)",
          namTotNghiep: 2024,
          decisionNo: "123/QĐ-ĐHTL",
          decisionDate: "2024-06-15",
          issueDate: "2024-06-20",
          soHieu: "SIGNED-VB-" + number,
          soVaoSo: "SIGNED-VS-" + number,
        };
        async function version(versionNumber, snapshot, anchorStatus) {
          const storedPayload = {
            ...snapshot,
            uuid: diploma.id,
            version: versionNumber,
          };
          const hash = payloadHash(storedPayload);
          const created = await transaction.diplomaVersion.create({
            data: {
              diplomaId: diploma.id,
              version: versionNumber,
              schemaVersion: "diploma-v1",
              payload: storedPayload,
              payloadHash: hash,
            },
          });
          if (anchorStatus)
            await transaction.blockchainAnchor.create({
              data: {
                versionId: created.id,
                eventType: "ISSUE",
                status: anchorStatus,
                channel: "test",
                chaincode: "educert",
                payloadHash: hash,
                issuerMspId: target.campus.fabricMspId,
                transactionId:
                  anchorStatus === "COMMITTED" ? "test-" + randomUUID() : null,
                committedAt:
                  anchorStatus === "COMMITTED"
                    ? Object.hasOwn(options, "committedAt")
                      ? options.committedAt
                      : new Date()
                    : null,
              },
            });
        }
        if (options.olderVersion)
          await version(
            1,
            { ...payload, major: "Tên ngành của phiên bản cũ" },
            "COMMITTED",
          );
        await version(
          options.olderVersion ? 2 : 1,
          payload,
          options.noAnchor ? null : options.anchorStatus || "COMMITTED",
        );
        return { diploma, payload, student };
      }
      const active = await fixture();
      const revoked = await fixture({ status: "REVOKED", olderVersion: true });
      await fixture({ status: "SUPERSEDED" });
      const legacy = await fixture({ payload: {} });
      const unknownDate = await fixture({
        payload: { issueDate: null, major: null, namTotNghiep: 2020 },
      });
      const excluded = [
        await fixture({ anchorStatus: "QUEUED" }),
        await fixture({ workflowStatus: "DRAFT", status: "DRAFT" }),
        await fixture({ noAnchor: true }),
        await fixture({ olderVersion: true, anchorStatus: "QUEUED" }),
        await fixture({ school: foreign }),
      ];
      const scoped = {
        $transaction: async (callback) => callback(transaction),
      };
      const service = new CertService(scoped);
      const dashboard = new DashboardService(scoped);
      const initialDashboard = await dashboard.overview(main.actor);
      check(
        "dashboard agrees with issued register, including revoked and replaced",
        initialDashboard.summary.registered === 5 &&
          initialDashboard.summary.active === 3 &&
          initialDashboard.summary.revoked === 1 &&
          initialDashboard.summary.replaced === 1,
      );
      check(
        "dashboard separates uncommitted latest versions and draft records",
        initialDashboard.summary.totalRecords === 9 &&
          initialDashboard.summary.pendingAnchoring === 3 &&
          initialDashboard.summary.draftRecords === 1,
      );
      check(
        "dashboard reports immutable major rather than renamed catalog",
        initialDashboard.byMajor.some(
          (group) =>
            group.name === "Công nghệ thông tin (50%)" && group.value === 3,
        ),
      );
      check(
        "dashboard legacy snapshots fall back only for missing fields",
        initialDashboard.byMajor.some(
          (group) => group.name === main.program.name && group.value === 1,
        ),
      );
      check(
        "dashboard explicit null major stays unknown",
        initialDashboard.byMajor.some(
          (group) => group.name === "Chưa ghi nhận ngành" && group.value === 1,
        ),
      );
      check(
        "dashboard year comes from immutable snapshot",
        initialDashboard.byYear.some(
          (group) => group.name === "2024" && group.value === 3,
        ),
      );
      check(
        "dashboard counts this month's actual commits rather than old creation dates",
        initialDashboard.summary.registeredThisMonth === 5,
      );
      check(
        "dashboard scopes students to institution",
        initialDashboard.summary.students === 9,
      );
      check(
        "dashboard uses six months including zero months",
        initialDashboard.byMonth.length === 6 &&
          initialDashboard.byMonth
            .slice(0, -1)
            .every((group) => group.value === 0),
      );
      check(
        "dashboard recent items use immutable identifiers",
        initialDashboard.recentIssued.some(
          (entry) =>
            entry.id === active.diploma.id &&
            entry.certificateNo === active.payload.soHieu,
        ),
      );
      check(
        "dashboard foreign institution is isolated",
        (await dashboard.overview(foreign.actor)).summary.registered === 1,
      );
      check(
        "dashboard empty imports produce real zeros",
        Object.values(initialDashboard.imports.counts).every(
          (value) => value === 0,
        ),
      );
      const find = (filters = {}, actor = main.actor) =>
        service.findRegister(
          Object.assign(new RegisterQueryDto(), filters),
          actor,
        );
      const all = await find();
      check(
        "register includes only this institution's five issued entries",
        all.pagination.total === 5 && all.data.length === 5,
      );
      check(
        "excludes pending, draft, unanchored, latest-pending and foreign entries",
        excluded.every(
          (entry) => !all.data.some((row) => row.uuid === entry.diploma.id),
        ),
      );
      const first = all.data.find((entry) => entry.uuid === active.diploma.id);
      check(
        "displays the immutable published snapshot",
        first.fullName === active.payload.fullName &&
          first.soVaoSo === active.payload.soVaoSo,
      );
      const filtered = await find({
        search: active.payload.mssv,
        year: 2024,
        major: "50%",
        decision: "123/QĐ",
        status: "ON_CHAIN",
        issuedFrom: "2024-06-20",
        issuedTo: "2024-06-20",
      });
      check(
        "combines every business filter with inclusive date boundaries",
        filtered.pagination.total === 1 &&
          filtered.data[0].uuid === active.diploma.id,
      );
      for (const search of [
        active.payload.fullName,
        active.payload.soHieu,
        active.payload.soVaoSo,
      ])
        check(
          "searches the published name and identifiers " + search,
          (await find({ search })).pagination.total === 1,
        );
      check(
        "does not search changed relational identifiers instead of signed values",
        (await find({ search: active.student.studentCode })).pagination
          .total === 0,
      );
      check(
        "does not use older snapshots for filters",
        (await find({ major: "Tên ngành của phiên bản cũ" })).pagination
          .total === 0,
      );
      check(
        "localizes and filters revoked entries",
        (await find({ status: "REVOKED" })).data[0].uuid === revoked.diploma.id,
      );
      check(
        "filters replaced entries",
        (await find({ status: "REPLACED" })).pagination.total === 1,
      );
      check(
        "search wildcards are literal",
        (await find({ major: "%" })).pagination.total === 3 &&
          (await find({ search: "_" })).pagination.total === 0,
      );
      check(
        "SQL injection stays a literal search",
        (await find({ search: "'; DROP TABLE diplomas;--" })).pagination
          .total === 0,
      );
      check(
        "legacy snapshots fall back to relational fields only when absent",
        (await find({ year: 2025 })).data[0].uuid === legacy.diploma.id,
      );
      check(
        "explicit nulls in snapshots never inherit changed source values",
        (await find({ major: main.program.name })).pagination.total === 1 &&
          (await find({ issuedFrom: "2025-01-01" })).pagination.total === 1,
      );
      check(
        "unknown source dates remain blank",
        all.data.find((row) => row.uuid === unknownDate.diploma.id)
          .issueDate === null,
      );
      const pages = [];
      for (let page = 1; page <= 3; page++)
        pages.push(await find({ page, limit: 2 }));
      check(
        "uses stable pagination for equal timestamps",
        new Set(pages.flatMap((result) => result.data.map((row) => row.uuid)))
          .size === 5,
      );
      const emptyPage = await find({ page: 100, limit: 2 });
      check(
        "preserves the filtered total on empty pages",
        emptyPage.data.length === 0 && emptyPage.pagination.total === 5,
      );
      check(
        "admin retains read-only institutional access",
        (await find({}, { ...main.actor, role: "admin" })).pagination.total ===
          5,
      );
      check(
        "other institutions only see their own records",
        (await find({}, foreign.actor)).pagination.total === 1,
      );

      const indexedAnchors = await transaction.blockchainAnchor.findMany({
        where: {
          version: { diploma: { institutionId: { in: institutions } } },
        },
        include: { version: true },
      });
      const ledger = new Map(
        indexedAnchors.map((anchor) => [
          anchor.version.diplomaId + ":" + anchor.version.version,
          {
            uuid: anchor.version.diplomaId,
            version: anchor.version.version,
            schemaVersion: anchor.version.schemaVersion,
            payloadHash: anchor.payloadHash,
            issuerMspId: anchor.issuerMspId,
            issueTxId: anchor.transactionId || "test-pending-transaction",
            isRevoked: false,
          },
        ]),
      );
      const failedAnchor = indexedAnchors.find(
        (anchor) => anchor.version.diplomaId === excluded[0].diploma.id,
      );
      await transaction.blockchainAnchor.update({
        where: { id: failedAnchor.id },
        data: { status: "FAILED", lastError: "Test gateway unavailable" },
      });
      await transaction.outboxEvent.create({
        data: {
          versionId: failedAnchor.versionId,
          eventType: "ISSUE",
          status: "FAILED",
          attempts: 10,
          lastError: "Test gateway unavailable",
          payload: { uuid: excluded[0].diploma.id },
        },
      });
      check(
        "dashboard reports sync failures without counting them as issued",
        (await dashboard.overview(main.actor)).summary.failedTransactions ===
          1 && (await dashboard.overview(main.actor)).summary.registered === 5,
      );
      const fabricCalls = [];
      const fabric = {
        enabled: true,
        channel: "test",
        chaincode: "educert",
        checkConnection: async () => ({ connected: true }),
        execute: async (...args) => {
          fabricCalls.push(args);
          assert.equal(args[0], "evaluate", "reconciliation must never submit");
          assert.equal(args[1], "QueryDiplomaAnchor");
          const result = ledger.get(args[2] + ":" + args[3]);
          if (!result) throw new Error("test ledger record not found");
          return { result: { ...result } };
        },
      };
      const explorer = new ExplorerService(
        {
          blockchainAnchor: transaction.blockchainAnchor,
          auditLog: transaction.auditLog,
        },
        fabric,
      );
      const anchors = (filters = {}, actor = main.actor) =>
        explorer.getAnchors(
          Object.assign(new AnchorQueryDto(), filters),
          actor,
        );
      const ownAnchorCount = indexedAnchors.filter(
        (anchor) => anchor.version.diplomaId !== excluded.at(-1).diploma.id,
      ).length;
      const listed = await anchors();
      check(
        "explorer lists only institution-scoped real anchor records",
        listed.pagination.total === ownAnchorCount,
      );
      const found = await anchors({ search: active.payload.soVaoSo });
      check(
        "explorer searches immutable registry numbers",
        found.pagination.total === 1 &&
          found.data[0].diplomaId === active.diploma.id,
      );
      check(
        "explorer searches signed names case-insensitively",
        (await anchors({ search: active.payload.fullName.toLowerCase() }))
          .pagination.total === 1,
      );
      check(
        "explorer does not find renamed source identifiers instead of snapshots",
        (await anchors({ search: active.student.studentCode })).pagination
          .total === 0,
      );
      check(
        "explorer falls back only for fields absent in old snapshots",
        (await anchors({ search: legacy.student.studentCode })).pagination
          .total === 1,
      );
      const failures = await anchors({ status: "FAILED" });
      check(
        "explorer exposes failure and retry exhaustion to authorized staff",
        failures.pagination.total === 1 &&
          failures.data[0].lastError === "Test gateway unavailable" &&
          failures.data[0].outbox.attempts === 10,
      );
      check(
        "explorer status and operation filters use the same total",
        (await anchors({ status: "FAILED", eventType: "REVOKE" })).pagination
          .total === 0,
      );
      check(
        "explorer never returns raw snapshot or outbox payloads",
        !JSON.stringify(listed).includes('"proof"') &&
          !JSON.stringify(listed).includes('"payload":'),
      );
      const overview = await explorer.getOverview(main.actor);
      check(
        "explorer summary is scoped and counts actual sync failures",
        overview.totalTransactions +
          overview.pendingAnchors +
          overview.failedAnchors ===
          ownAnchorCount &&
          overview.failedAnchors === 1 &&
          overview.blockHeight === null,
      );
      const foreignAnchor = indexedAnchors.find(
        (anchor) => anchor.version.diplomaId === excluded.at(-1).diploma.id,
      );
      for (const callback of [
        () => explorer.checkAnchor(foreignAnchor.id, main.actor),
        () =>
          explorer.getTransactionDetails(
            foreignAnchor.transactionId,
            main.actor,
          ),
      ]) {
        await assert.rejects(callback, (error) => error.getStatus?.() === 404);
        checks++;
      }
      const fingerprint = async () =>
        JSON.stringify(
          {
            anchors: await transaction.blockchainAnchor.findMany({
              where: {
                version: { diploma: { institutionId: main.institution.id } },
              },
              orderBy: { id: "asc" },
            }),
            versions: await transaction.diplomaVersion.findMany({
              where: { diploma: { institutionId: main.institution.id } },
              orderBy: { id: "asc" },
            }),
            outbox: await transaction.outboxEvent.findMany({
              where: {
                version: { diploma: { institutionId: main.institution.id } },
              },
              orderBy: { id: "asc" },
            }),
          },
          (_key, value) =>
            typeof value === "bigint" ? value.toString() : value,
        );
      const beforeCheck = await fingerprint();
      check(
        "direct reconciliation matches stored snapshot against an independent test ledger response",
        (await explorer.checkAnchor(found.data[0].id, main.actor)).status ===
          "MATCH",
      );
      const chain = ledger.get(active.diploma.id + ":1");
      const originalHash = chain.payloadHash;
      chain.payloadHash = "b".repeat(64);
      check(
        "direct reconciliation reports a real mismatch rather than valid",
        (await explorer.checkAnchor(found.data[0].id, main.actor)).status ===
          "MISMATCH",
      );
      chain.payloadHash = originalHash;
      fabric.enabled = false;
      check(
        "disabled Fabric never passes reconciliation",
        (await explorer.checkAnchor(found.data[0].id, main.actor)).status ===
          "UNAVAILABLE",
      );
      fabric.enabled = true;
      check(
        "reconciliation does not mutate versions, anchors or retry jobs",
        beforeCheck === (await fingerprint()),
      );
      const audits = await transaction.auditLog.findMany({
        where: {
          institutionId: main.institution.id,
          action: "CHECK_BLOCKCHAIN",
        },
      });
      check(
        "all direct outcomes are recorded in institutional activity logs",
        audits.length === 3 &&
          audits.filter((event) => event.result === "FAILED").length === 2,
      );
      check(
        "no Fabric submission is made",
        fabricCalls.length === 2 &&
          fabricCalls.every((args) => args[0] === "evaluate"),
      );

      let httpActor = main.actor;
      const module = await Test.createTestingModule({
        controllers: [CertController, ExplorerController, DashboardController],
        providers: [
          { provide: CertService, useValue: service },
          { provide: ExplorerService, useValue: explorer },
          { provide: DashboardService, useValue: dashboard },
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
          transformOptions: { enableImplicitConversion: true },
        }),
      );
      await app.listen(0, "127.0.0.1");
      const base = await app.getUrl();
      try {
        const dashboardResponse = await fetch(base + "/dashboard/overview");
        check(
          "dashboard HTTP returns scoped committed data",
          dashboardResponse.ok &&
            (await dashboardResponse.json()).summary.registered === 5,
        );
        const anchorResponse = await fetch(
          base + "/explorer/anchors?status=FAILED",
        );
        check(
          "explorer HTTP DTO binds filters",
          anchorResponse.ok &&
            (await anchorResponse.json()).pagination.total === 1,
        );
        for (const query of [
          "page=0",
          "limit=101",
          "page=1.2",
          "status=VALID",
          "eventType=ANY",
          "institutionId=other",
        ])
          check(
            "rejects invalid explorer query " + query,
            (await fetch(base + "/explorer/anchors?" + query)).status === 400,
          );
        check(
          "rejects invalid anchor identifier before querying Fabric",
          (
            await fetch(base + "/explorer/anchors/invalid/check", {
              method: "POST",
            })
          ).status === 400,
        );
        check(
          "scoped transaction HTTP lookup hides foreign records",
          (await fetch(base + "/explorer/tx/" + foreignAnchor.transactionId))
            .status === 404,
        );
        const directResponse = await fetch(
          base + "/explorer/anchors/" + found.data[0].id + "/check",
          { method: "POST" },
        );
        check(
          "direct check HTTP uses evaluate and returns actual comparison",
          directResponse.status === 201 &&
            (await directResponse.json()).status === "MATCH",
        );
        const response = await fetch(
          base + "/cert/register?status=REVOKED&year=2024",
        );
        check(
          "HTTP register route binds and applies the validated filters",
          response.ok && (await response.json()).pagination.total === 1,
        );
        for (const query of [
          "page=0",
          "limit=101",
          "year=invalid",
          "issuedFrom=2023-02-29",
          "issuedTo=2024-01-01T12:00:00Z",
          "issuedFrom=2024-02-01&issuedTo=2024-01-01",
          "status=DRAFT",
          "institutionId=other",
          "issuedOnly=false",
        ])
          check(
            "rejects invalid or scope-bypassing HTTP query " + query,
            (await fetch(base + "/cert/register?" + query)).status === 400,
          );
        for (const flags of [
          { role: "student" },
          { isHeadquarters: false },
          { canApproveDiplomas: false },
        ]) {
          httpActor = { ...main.actor, ...flags };
          check(
            "HTTP permission check " + JSON.stringify(flags),
            (await fetch(base + "/cert/register")).status === 403,
          );
          for (const path of [
            "/dashboard/overview",
            "/explorer/overview",
            "/explorer/anchors",
            "/explorer/blocks",
            "/explorer/tx/" + found.data[0].transactionId,
          ])
            check(
              "explorer HTTP permissions " + JSON.stringify(flags) + path,
              (await fetch(base + path)).status === 403,
            );
          check(
            "direct check HTTP denies unauthorized actor",
            (
              await fetch(
                base + "/explorer/anchors/" + found.data[0].id + "/check",
                { method: "POST" },
              )
            ).status === 403,
          );
        }
        httpActor = { ...main.actor, role: "admin" };
        check(
          "admin may inspect but not change the register",
          (await fetch(base + "/cert/register")).ok,
        );
        check(
          "admin may read dashboard",
          (await fetch(base + "/dashboard/overview")).ok,
        );
      } finally {
        await app.close();
      }
      const fixedNow = new Date("2026-10-15T03:00:00Z");
      const report = async () =>
        (
          await transaction.$queryRaw(
            dashboardQuery(main.institution.id, fixedNow),
          )
        )[0];
      const before = await report();
      await fixture({ committedAt: new Date("2026-09-30T16:59:59.999Z") });
      await fixture({ committedAt: new Date("2026-09-30T17:00:00Z") });
      await fixture({ committedAt: new Date("2026-10-31T17:00:00Z") });
      const after = await report();
      check(
        "dashboard counts UTC+7 month start exactly",
        after.summary.registeredThisMonth ===
          before.summary.registeredThisMonth + 1,
      );
      check(
        "dashboard assigns previous instant to previous Vietnam month",
        after.byMonth.find((group) => group.month === "2026-09").value ===
          before.byMonth.find((group) => group.month === "2026-09").value + 1,
      );
      check(
        "dashboard excludes next month from monthly report",
        after.byMonth.find((group) => group.month === "2026-10").value ===
          before.byMonth.find((group) => group.month === "2026-10").value + 1,
      );
      check(
        "dashboard total includes all three commits, with database-required commit timestamps",
        after.summary.registered === before.summary.registered + 3 &&
          after.summary.undatedRegistrations === 0,
      );
      const request = await fixture({
        status: "DRAFT",
        workflowStatus: "REQUESTED",
        noAnchor: true,
      });
      check(
        "dashboard requested stage is not confused with draft or issued",
        (await dashboard.overview(main.actor)).summary.requestedRecords === 1,
      );
      check(
        "uncommitted requested record never enters recent issued list",
        !(await dashboard.overview(main.actor)).recentIssued.some(
          (entry) => entry.id === request.diploma.id,
        ),
      );
      async function importWork(target) {
        const document = await transaction.sourceDocument.create({
          data: {
            institutionId: target.institution.id,
            fileName: "Dữ liệu kiểm thử Tổng quan.xlsx",
            sha256: randomUUID().replaceAll("-", "").padEnd(64, "0"),
            byteSize: 1,
            mediaType: "test",
            storageKey: "test/" + randomUUID(),
          },
        });
        const batch = await transaction.importBatch.create({
          data: {
            institutionId: target.institution.id,
            campusId: target.campus.id,
            documentId: document.id,
            mappingVersion: "dashboard-test",
            createdById: target.account.id,
            totalRows: 5,
            createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, sequence)),
          },
        });
        const rows = [];
        for (const status of [
          "NEEDS_REVIEW",
          "READY",
          "IMPORTED",
          "IMPORTED",
          "SKIPPED",
        ])
          rows.push(
            await transaction.importRow.create({
              data: {
                batchId: batch.id,
                sheetName: "Sheet1",
                rowNumber: rows.length + 1,
                rawData: {},
                normalizedData: {},
                status,
              },
            }),
          );
        const draft = await fixture({
          school: target,
          status: "DRAFT",
          workflowStatus: "DRAFT",
          noAnchor: true,
        });
        await transaction.graduationRecord.update({
          where: { id: draft.diploma.graduationId },
          data: { sourceRowId: rows[2].id },
        });
        await transaction.graduationRecord.create({
          data: {
            institutionId: target.institution.id,
            studentId: draft.student.id,
            programId: target.program.id,
            graduationYear: 2024,
            sourceRowId: rows[3].id,
          },
        });
        return batch;
      }
      const importBatch = await importWork(main);
      await importWork(foreign);
      const [importReport] = await transaction.$queryRaw(
        dashboardImportQuery(main.institution.id),
      );
      check(
        "dashboard counts work stages without double-counting joins",
        Object.values(importReport.counts).every((value) => value === 1),
      );
      check(
        "dashboard work list excludes other institutions and skipped rows",
        importReport.batches.length === 1 &&
          importReport.batches[0].id === importBatch.id,
      );
      const archivedCampus = await transaction.campus.create({
        data: {
          institutionId: main.institution.id,
          code: "OLD",
          name: "Archived campus",
          active: false,
        },
      });
      await importWork({ ...main, campus: archivedCampus });
      check(
        "officer work counts match own campus import workspace",
        Object.values(
          (await dashboard.overview(main.actor)).imports.counts,
        ).every((value) => value === 1),
      );
      check(
        "admin can monitor historical campus work without gaining approval rights",
        Object.values(
          (await dashboard.overview({ ...main.actor, role: "admin" })).imports
            .counts,
        ).every((value) => value === 2),
      );
      for (let index = 0; index < 5; index++) await importWork(main);
      const boundedWork = (await dashboard.overview(main.actor)).imports;
      check(
        "work list is limited to five but counts include all work",
        boundedWork.batches.length === 5 &&
          Object.values(boundedWork.counts).every((value) => value === 6),
      );
      check(
        "work list prioritizes the oldest outstanding batch",
        boundedWork.batches[0].id === importBatch.id,
      );
      for (let index = 0; index < 6; index++) await fixture();
      check(
        "dashboard recent-issued query is bounded to five records",
        (await dashboard.overview(main.actor)).recentIssued.length === 5,
      );
      httpActor = { ...main.actor, institutionId: undefined };
      await assert.rejects(
        () => dashboard.overview(httpActor),
        (error) => error.getStatus?.() === 403,
      );
      checks++;
      throw rollback;
    },
    { timeout: 60000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  try {
    check(
      "all temporary institutions are rolled back",
      (await database.institution.count({
        where: { id: { in: institutions } },
      })) === 0,
    );
  } finally {
    await database.$disconnect();
  }
}
console.log(
  "Diploma register database/HTTP checks passed: " +
    checks +
    ". Fixtures rolled back; no ledger or PDF changes.",
);
