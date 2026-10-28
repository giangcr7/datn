import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const apiRoot = resolve(root, "apps/api");
config({ path: resolve(apiRoot, ".env"), quiet: true });
if (process.env.STORAGE_LOCAL_ROOT)
  process.env.STORAGE_LOCAL_ROOT = resolve(
    apiRoot,
    process.env.STORAGE_LOCAL_ROOT,
  );
const args = process.argv.slice(2);
const batchId = args[args.indexOf("--batch-id") + 1];
assert(
  args.includes("--batch-id") && /^[0-9a-f-]{36}$/i.test(batchId),
  "Use --batch-id <uuid>; add --apply to repair unsigned, unsent drafts",
);
const apply = args.includes("--apply");
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require("../apps/api/dist/database/database.service.js");
const {
  DocumentStorageService,
} = require("../apps/api/dist/storage/document-storage.service.js");
const {
  RegistryImportService,
} = require("../apps/api/dist/imports/registry-import.service.js");
const {
  parseRegistryWorkbook,
} = require("../apps/api/dist/imports/registry-parser.js");
const {
  diplomaInclude,
} = require("../apps/api/dist/database/diploma-projection.js");
const {
  reviewedDiplomaErrors,
} = require("../apps/api/dist/cert/reviewed-diploma.js");
const database = new DatabaseService({
  getOrThrow: () => process.env.DATABASE_URL,
});
const storage = new DocumentStorageService();
async function invariants() {
  return Object.fromEntries(
    await Promise.all(
      [
        "account",
        "accountMembership",
        "student",
        "diploma",
        "signedDiplomaDocument",
        "diplomaPdfSignature",
        "diplomaVersion",
        "blockchainAnchor",
        "outboxEvent",
      ].map(async (model) => [model, await database[model].count()]),
    ),
  );
}
try {
  const batch = await database.importBatch.findUniqueOrThrow({
    where: { id: batchId },
    include: { document: true },
  });
  const membership = await database.accountMembership.findFirst({
    where: {
      accountId: batch.createdById,
      campusId: batch.campusId,
      role: "UNIVERSITY",
      active: true,
    },
    include: { account: true, campus: true },
  });
  assert(
    membership && membership.account.active,
    "The batch creator needs an active campus staff membership",
  );
  const actor = {
    id: membership.accountId,
    email: membership.account.email,
    role: "university",
    institutionId: batch.institutionId,
    campusId: batch.campusId,
    isHeadquarters: membership.campus.isHeadquarters,
    canApproveDiplomas: membership.canApproveDiplomas,
  };
  const buffer = await storage.getWorkbook(
    batch.document.storageKey,
    batch.document.sha256,
  );
  const aliases = await database.programAlias.findMany({
    where: { institutionId: batch.institutionId },
  });
  const programs = await database.program.findMany({
    where: { institutionId: batch.institutionId },
  });
  const parsed = await parseRegistryWorkbook(
    buffer,
    new Map(aliases.map((item) => [item.normalizedName, item.programId])),
    new Map(programs.map((item) => [item.id, item.nameEn])),
  );
  const where = { graduation: { sourceRow: { batchId } } };
  const beforeDiplomas = await database.diploma.findMany({
    where,
    include: diplomaInclude,
  });
  const preview = {
    batchId,
    sourceFile: batch.document.fileName,
    sourceSha256: batch.document.sha256,
    sourceRows: parsed.length,
    sourcePrintErrors: parsed
      .flatMap((row) => row.issues)
      .filter((issue) =>
        [
          "issuedOn",
          "degreeType",
          "majorNameEn",
          "issuePlace",
          "diplomaSignerName",
          "diplomaSignerTitle",
        ].includes(issue.field),
      ).length,
    existingDiplomas: beforeDiplomas.length,
    draftsWithSubmissionErrors: beforeDiplomas.filter(
      (item) =>
        item.workflowStatus === "DRAFT" && reviewedDiplomaErrors(item).length,
    ).length,
    protectedDiplomas: beforeDiplomas.filter(
      (item) =>
        item.status !== "DRAFT" ||
        item.workflowStatus !== "DRAFT" ||
        item.signedDocuments.length,
    ).length,
    beforeRowCounts: await database.importRow.groupBy({
      by: ["status"],
      where: { batchId },
      _count: true,
    }),
  };
  if (!apply) {
    console.log(JSON.stringify({ mode: "DRY_RUN", ...preview }, null, 2));
  } else {
    const beforeCounts = await invariants();
    const snapshot = {
      createdAt: new Date().toISOString(),
      ...preview,
      batch,
      importRows: await database.importRow.findMany({
        where: { batchId },
        include: { issues: true },
      }),
      diplomas: beforeDiplomas,
      beforeCounts,
    };
    const backupDirectory = resolve(
      root,
      ".data/backups",
      "registry-print-repair-" + new Date().toISOString().replace(/[:.]/g, "-"),
    );
    await mkdir(backupDirectory, { recursive: true });
    const backup = JSON.stringify(snapshot, null, 2);
    await writeFile(resolve(backupDirectory, "before.json"), backup, {
      flag: "wx",
    });
    await writeFile(
      resolve(backupDirectory, "before.sha256"),
      createHash("sha256").update(backup).digest("hex") + "\n",
      { flag: "wx" },
    );
    const result = await new RegistryImportService(database, storage).recheck(
      batchId,
      actor,
    );
    const afterDiplomas = await database.diploma.findMany({
      where,
      include: diplomaInclude,
    });
    const afterById = new Map(afterDiplomas.map((item) => [item.id, item]));
    const allowed = new Set([
      "issuedOn",
      "fullNameLatin",
      "majorNameEn",
      "issuePlace",
      "diplomaSignerName",
      "diplomaSignerTitle",
      "updatedAt",
      "graduation",
    ]);
    for (const before of beforeDiplomas) {
      const after = afterById.get(before.id);
      assert(after, "An existing diploma must not be removed");
      const protectedRecord =
        before.status !== "DRAFT" ||
        before.workflowStatus !== "DRAFT" ||
        before.signedDocuments.length;
      if (protectedRecord) {
        assert.deepEqual(
          after,
          before,
          "Protected diploma must remain unchanged",
        );
        continue;
      }
      for (const key of Object.keys(before)) {
        if (!allowed.has(key))
          assert.deepEqual(
            after[key],
            before[key],
            "Unexpected change: " + key,
          );
        else if (key !== "graduation" && key !== "updatedAt" && before[key])
          assert.deepEqual(
            after[key],
            before[key],
            "Confirmed field overwritten: " + key,
          );
      }
      for (const key of Object.keys(before.graduation)) {
        if (!["degreeType", "updatedAt", "sourceRow"].includes(key))
          assert.deepEqual(
            after.graduation[key],
            before.graduation[key],
            "Academic field changed: " + key,
          );
      }
      if (before.graduation.degreeType)
        assert.equal(after.graduation.degreeType, before.graduation.degreeType);
    }
    const afterRows = await database.importRow.findMany({ where: { batchId } });
    const sourceById = new Map(snapshot.importRows.map((row) => [row.id, row]));
    for (const row of afterRows) {
      assert.deepEqual(
        row.rawData,
        sourceById.get(row.id).rawData,
        "Raw source must remain immutable",
      );
      assert.deepEqual(
        row.normalizedData,
        sourceById.get(row.id).normalizedData,
        "Original mapping must remain immutable",
      );
    }
    const afterCounts = await invariants();
    assert.deepEqual(
      afterCounts,
      beforeCounts,
      "Repair must not change accounts, signatures, or blockchain queues",
    );
    const unsigned = afterDiplomas.filter(
      (item) =>
        item.status === "DRAFT" &&
        item.workflowStatus === "DRAFT" &&
        !item.signedDocuments.length,
    );
    const remaining = unsigned
      .map((item) => ({ id: item.id, errors: reviewedDiplomaErrors(item) }))
      .filter((item) => item.errors.length);
    const report = {
      mode: "APPLIED",
      ...preview,
      ...result,
      backupDirectory,
      readyDrafts: unsigned.length - remaining.length,
      blockedDrafts: remaining,
      invariantCounts: afterCounts,
    };
    await writeFile(
      resolve(backupDirectory, "result.json"),
      JSON.stringify(report, null, 2),
      { flag: "wx" },
    );
    console.log(JSON.stringify(report, null, 2));
  }
} finally {
  await database.$disconnect();
}
