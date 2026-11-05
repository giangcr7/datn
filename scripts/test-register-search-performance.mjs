import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { config } from "dotenv";

config({ path: new URL("../apps/api/.env", import.meta.url), quiet: true });
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require("../apps/api/dist/database/database.service.js");
const {
  registerQuery,
  registerSuggestionsQuery,
} = require("../apps/api/dist/cert/diploma-register.js");
const {
  RegisterQueryDto,
} = require("../apps/api/dist/cert/register-query.dto.js");
const { payloadHash } = require("../apps/api/dist/database/diploma-hash.js");
const { Prisma } = require("../apps/api/dist/generated/prisma/client.js");
const database = new DatabaseService({
  getOrThrow: () => process.env.DATABASE_URL,
});
const rollback = new Error("ROLLBACK_SEARCH_BENCHMARK");
const count = 10000;
let institutionId;
const results = [];
try {
  await database.$transaction(
    async (transaction) => {
      const institution = await transaction.institution.create({
        data: {
          code: "SEARCH_" + randomUUID().slice(0, 20),
          name: "Search benchmark rollback only",
        },
      });
      institutionId = institution.id;
      const campus = await transaction.campus.create({
        data: {
          institutionId,
          code: "MAIN",
          name: "Benchmark",
          isHeadquarters: true,
          fabricMspId: "Benchmark_" + randomUUID(),
        },
      });
      const account = await transaction.account.create({
        data: {
          email: randomUUID() + "@example.test",
          displayName: "Benchmark",
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
        data: { institutionId, code: "IT", name: "Benchmark program" },
      });
      const rows = Array.from({ length: count }, (_, index) => {
        const uuid = randomUUID();
        const payload = {
          uuid,
          version: 1,
          fullName: "Nguyễn Văn An " + index,
          mssv: "BENCH" + String(index).padStart(6, "0"),
          soHieu: "VB-BENCH-" + index,
          soVaoSo: "VS-BENCH-" + index,
          major: "Benchmark program",
          namTotNghiep: 2026,
        };
        return {
          uuid,
          studentId: randomUUID(),
          graduationId: randomUUID(),
          versionId: randomUUID(),
          payload,
          hash: payloadHash(payload),
        };
      });
      for (let offset = 0; offset < rows.length; offset += 250) {
        const chunk = rows.slice(offset, offset + 250);
        await transaction.student.createMany({
          data: chunk.map((row) => ({
            id: row.studentId,
            institutionId,
            studentCode: row.payload.mssv,
            fullName: row.payload.fullName,
          })),
        });
        await transaction.graduationRecord.createMany({
          data: chunk.map((row) => ({
            id: row.graduationId,
            institutionId,
            studentId: row.studentId,
            programId: program.id,
            graduationYear: 2026,
          })),
        });
        await transaction.diploma.createMany({
          data: chunk.map((row) => ({
            id: row.uuid,
            institutionId,
            campusId: campus.id,
            issuingCampusId: campus.id,
            graduationId: row.graduationId,
            certificateNo: row.payload.soHieu,
            registryNo: row.payload.soVaoSo,
            issuedOn: new Date("2026-06-20"),
            status: "ACTIVE",
            workflowStatus: "APPROVED",
            requestedById: account.id,
            requestedAt: new Date(),
            approvedById: account.id,
            approvedAt: new Date(),
          })),
        });
        await transaction.diplomaVersion.createMany({
          data: chunk.map((row) => ({
            id: row.versionId,
            diplomaId: row.uuid,
            version: 1,
            schemaVersion: "diploma-v1",
            payload: row.payload,
            payloadHash: row.hash,
          })),
        });
        await transaction.blockchainAnchor.createMany({
          data: chunk.map((row) => ({
            versionId: row.versionId,
            eventType: "ISSUE",
            status: "COMMITTED",
            channel: "benchmark",
            chaincode: "educert",
            issuerMspId: campus.fabricMspId,
            payloadHash: row.hash,
            transactionId: "rollback-" + row.uuid,
            committedAt: new Date(),
          })),
        });
      }
      for (const table of [
        "diplomas",
        "graduation_records",
        "students",
        "programs",
        "graduation_decisions",
        "diploma_versions",
        "blockchain_anchors",
      ]) {
        await transaction.$executeRawUnsafe(
          'CREATE TEMP TABLE "' +
            table +
            '" (LIKE public."' +
            table +
            '" INCLUDING ALL) ON COMMIT DROP',
        );
        await transaction.$executeRawUnsafe(
          'INSERT INTO pg_temp."' +
            table +
            '" SELECT * FROM public."' +
            table +
            '"',
        );
        await transaction.$executeRawUnsafe('ANALYZE pg_temp."' + table + '"');
      }
      for (const [label, search, suggestions] of [
        ["exact identifier suggestions", "BENCH005678", true],
        ["mixed tokens suggestions", "an BENCH005678", true],
        ["common accent-free name suggestions", "nguyen van an", true],
        ["typo name suggestions", "nguyen van am", true],
        ["identifier register with count", "BENCH005678", false],
      ]) {
        const query = Object.assign(new RegisterQueryDto(), { search });
        const sql = suggestions
          ? registerSuggestionsQuery(institutionId, query)
          : registerQuery(institutionId, query);
        const times = [];
        for (let run = 0; run < 5; run++) {
          const start = performance.now();
          const data = await transaction.$queryRaw(sql);
          times.push(performance.now() - start);
          assert(
            suggestions
              ? data.length > 0 && data.length <= 6
              : data[0].total === 1,
            label,
          );
        }
        const [explain] = await transaction.$queryRaw(
          Prisma.sql(["EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ", ""], sql),
        );
        const plan = explain["QUERY PLAN"][0];
        const indexes = new Set();
        function visit(node) {
          if (node["Index Name"]) indexes.add(node["Index Name"]);
          for (const child of node.Plans || []) visit(child);
        }
        visit(plan.Plan);
        const sorted = [...times].sort((first, second) => first - second);
        results.push({
          label,
          medianMs: +sorted[2].toFixed(1),
          maxMs: +Math.max(...times).toFixed(1),
          serverMs: +plan["Execution Time"].toFixed(1),
          indexes: [...indexes].filter((name) => name.includes("search_")),
        });
      }
      throw rollback;
    },
    { timeout: 180000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  try {
    if (institutionId)
      assert.equal(
        await database.institution.count({ where: { id: institutionId } }),
        0,
        "benchmark fixtures must roll back",
      );
  } finally {
    await database.$disconnect();
  }
}
console.log(
  JSON.stringify(
    {
      syntheticIssuedDiplomas: count,
      repeats: 5,
      results,
      fixturesRolledBack: true,
      note: "Local PostgreSQL queries on analyzed temporary table copies with matching schema/indexes; excludes HTTP, concurrent users and browser rendering. No ledger/PDF writes or ANALYZE of live tables.",
    },
    null,
    2,
  ),
);
