import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

config({
  path: fileURLToPath(new URL("../apps/api/.env", import.meta.url)),
  quiet: true,
});
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require("../apps/api/dist/database/database.service.js");
const { CertService } = require("../apps/api/dist/cert/cert.service.js");
const {
  RegistryImportService,
} = require("../apps/api/dist/imports/registry-import.service.js");
const { ForbiddenException, ConflictException } = require("@nestjs/common");
const {
  PdfSignatureService,
} = require("../apps/api/dist/signatures/pdf-signature.service.js");
const {
  DocumentStorageService,
} = require("../apps/api/dist/storage/document-storage.service.js");
const testPdf = process.argv.includes("--pdf");
let pdfDirectory;
let pdfSignatures;
if (testPdf) {
  assert.equal(
    process.env.PDF_SIGNING_MODE,
    "demo",
    "Bulk PDF tests only use local demo certificates",
  );
  pdfDirectory = await mkdtemp(resolve(tmpdir(), "diplomachain-bulk-pdf-"));
  process.env.STORAGE_DRIVER = "local";
  process.env.STORAGE_LOCAL_ROOT = pdfDirectory;
  pdfSignatures = new PdfSignatureService(new DocumentStorageService());
}
const database = new DatabaseService({
  getOrThrow: () => process.env.DATABASE_URL,
});
const rollback = new Error("ROLLBACK_REVIEWED_BULK_FIXTURES");
const suffix = randomUUID();
const institutionId = randomUUID();
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
async function rejects(label, action, exception) {
  await assert.rejects(action, exception, label);
  checks++;
}

try {
  await database.$transaction(
    async (transaction) => {
      await transaction.institution.create({
        data: {
          id: institutionId,
          code: "BULK_" + suffix.slice(0, 8),
          name: "Rollback bulk fixture",
          nameEn: "Rollback Fixture University",
        },
      });
      const campus = await transaction.campus.create({
        data: {
          institutionId,
          code: "ORG2",
          name: "Main HCM rollback fixture",
          isHeadquarters: true,
          fabricMspId: "BulkMain_" + suffix,
        },
      });
      const program = await transaction.program.create({
        data: { institutionId, code: "BULK", name: "Bulk fixture program" },
      });
      const account = await transaction.account.create({
        data: {
          email: "bulk-" + suffix + "@example.test",
          displayName: "Main campus officer",
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
      const officer = {
        id: account.id,
        name: account.displayName,
        email: account.email,
        role: "university",
        institutionId,
        campusId: campus.id,
        org: campus.code,
        isHeadquarters: true,
        canApproveDiplomas: true,
      };
      const scoped = new Proxy(transaction, {
        get(target, property) {
          if (property === "$transaction")
            return async (callback) => callback(transaction);
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const cert = new CertService(scoped, pdfSignatures);
      const registry = new RegistryImportService(scoped, {});
      const document = await transaction.sourceDocument.create({
        data: {
          institutionId,
          fileName: "rollback-bulk.xlsx",
          sha256: "b".repeat(64),
          byteSize: 1,
          mediaType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          storageKey: "rollback-only/" + suffix,
          uploadedById: officer.id,
        },
      });
      const batch = await transaction.importBatch.create({
        data: {
          institutionId,
          campusId: campus.id,
          documentId: document.id,
          mappingVersion: "rollback-bulk",
          createdById: officer.id,
          totalRows: 3,
        },
      });
      const rowIds = [];
      for (let index = 0; index < 3; index++) {
        const input = {
          studentCode: "008888888" + index,
          fullName: "Bulk fixture " + index,
          dateOfBirth: "2002-01-01",
          programId: program.id,
          programOriginal: program.name,
          graduationYear: 2024,
          classification: "GOOD",
          gpa: null,
          gpaScale: 4,
          issuedOn: index === 2 ? "2099-01-01" : "2024-06-01",
          degreeType: "BACHELOR",
          majorNameEn: "Fixture English Major",
          issuePlace: "TP. Hồ Chí Minh",
          diplomaSignerName: "Confirmed diploma signer",
          diplomaSignerTitle: "HIỆU TRƯỞNG",
          certificateNo: "BULK-CERT-" + index,
          registryNo: "BULK-REG-" + index,
        };
        const row = await transaction.importRow.create({
          data: {
            batchId: batch.id,
            sheetName: "2024",
            rowNumber: index + 2,
            rawData: input,
            normalizedData: input,
            status: "READY",
          },
        });
        rowIds.push(row.id);
      }
      const firstCommit = await registry.commit(batch.id, officer);
      check(
        "save commits only valid reviewed rows",
        firstCommit.imported === 2 && firstCommit.conflicts === 1,
      );
      check(
        "review save never queues blockchain",
        (await transaction.outboxEvent.count({
          where: { version: { diploma: { institutionId } } },
        })) === 0,
      );
      const saved = await transaction.diploma.findMany({
        where: { institutionId },
      });
      check(
        "reviewed records are not silently sent",
        saved.length === 2 &&
          saved.every(
            (record) =>
              record.workflowStatus === "DRAFT" &&
              !record.requestedAt &&
              !record.requestedById,
          ),
      );
      const invalid = await transaction.importRow.findUnique({
        where: { id: rowIds[2] },
      });
      check(
        "invalid future date returns to review instead of inventing today",
        invalid.status === "NEEDS_REVIEW",
      );
      await registry.review(
        batch.id,
        rowIds[2],
        { issuedOn: "2024-06-01" },
        "Confirmed against fixture source",
        officer,
      );
      const repairedCommit = await registry.commit(batch.id, officer);
      check(
        "repaired rows save without duplicating prior records",
        repairedCommit.imported === 1 &&
          (await transaction.diploma.count({ where: { institutionId } })) === 3,
      );
      let candidates = await cert.findRequestCandidates(
        1,
        100,
        "",
        batch.id,
        officer,
      );
      check(
        "candidate list contains only reviewed unsent records",
        candidates.data.length === 3 &&
          candidates.data.every(
            (record) =>
              !record.requestErrors.length && record.sourceBatchId === batch.id,
          ),
      );
      check(
        "candidate search filters within scope",
        (
          await cert.findRequestCandidates(
            1,
            100,
            "0088888880",
            batch.id,
            officer,
          )
        ).pagination.total === 1,
      );
      check(
        "other campus cannot see request candidates",
        (
          await cert.findRequestCandidates(1, 100, "", undefined, {
            ...officer,
            campusId: randomUUID(),
          })
        ).pagination.total === 0,
      );
      await rejects(
        "account without approval permission cannot prepare requests",
        () =>
          cert.findRequestCandidates(1, 100, "", undefined, {
            ...officer,
            canApproveDiplomas: false,
          }),
        ForbiddenException,
      );
      const ids = candidates.data.map((record) => record.uuid);
      check(
        "imported data is already printable and sendable without supplementary editing",
        candidates.data.every(
          (record) =>
            !record.printWarnings.length &&
            record.printedDiploma.majorNameEn === "Fixture English Major",
        ),
      );
      check(
        "imported diploma signer stays separate from the decision signer",
        candidates.data[0].printedDiploma.diplomaSignerName ===
          "Confirmed diploma signer" && !candidates.data[0].signerName,
      );
      await transaction.diploma.update({
        where: { id: ids[0] },
        data: { issuedOn: null },
      });
      candidates = await cert.findRequestCandidates(
        1,
        100,
        "",
        batch.id,
        officer,
      );
      check(
        "legacy drafts missing issue date cannot be selected as ready",
        candidates.data.find((record) => record.uuid === ids[0]).requestErrors
          .length > 0,
      );
      const originalRowId = (
        await transaction.graduationRecord.findUnique({
          where: {
            id: (
              await transaction.diploma.findUnique({ where: { id: ids[0] } })
            ).graduationId,
          },
        })
      ).sourceRowId;
      const originalSource = (
        await transaction.importRow.findUnique({ where: { id: originalRowId } })
      ).rawData;
      await registry.review(
        batch.id,
        originalRowId,
        { issuedOn: "2024-06-01" },
        "Legacy issue date confirmed from source",
        officer,
      );
      check(
        "legacy date correction retains raw source",
        JSON.stringify(
          (
            await transaction.importRow.findUnique({
              where: { id: originalRowId },
            })
          ).rawData,
        ) === JSON.stringify(originalSource),
      );
      check(
        "legacy date correction is audited",
        (await transaction.diplomaEvent.count({
          where: { diplomaId: ids[0], eventType: "REVIEWED_PRINT_DATA" },
        })) === 1,
      );
      const submission = await cert.processBulk(
        "submit",
        ids.slice(0, 2),
        officer,
      );
      check(
        "bulk submission sends every selected reviewed record",
        submission.succeeded === 2 && submission.failed === 0,
      );
      check(
        "submission does not create anchors",
        (await transaction.blockchainAnchor.count({
          where: { version: { diploma: { institutionId } } },
        })) === 0,
      );
      check(
        "submitted records disappear from unsent list",
        (await cert.findRequestCandidates(1, 100, "", batch.id, officer))
          .pagination.total === 1,
      );
      const repeated = await cert.processBulk("submit", [ids[0]], officer);
      check(
        "repeated submission reports a per-record conflict",
        repeated.succeeded === 0 && repeated.failed === 1,
      );
      check(
        "a repeated click does not duplicate request events",
        (await transaction.diplomaEvent.count({
          where: { diplomaId: ids[0], eventType: "REQUESTED" },
        })) === 1,
      );
      check(
        "same local officer sees their pending requests",
        (await cert.findPendingPaginated(1, 100, "", batch.id, officer))
          .pagination.total === 2,
      );
      check(
        "other institution never sees local requests",
        (
          await cert.findPendingPaginated(1, 100, "", undefined, {
            ...officer,
            institutionId: randomUUID(),
          })
        ).pagination.total === 0,
      );
      await rejects(
        "account without approval permission cannot approve bulk requests",
        () =>
          cert.processBulk("approve", ids.slice(0, 2), {
            ...officer,
            canApproveDiplomas: false,
          }),
        ForbiddenException,
      );
      await rejects(
        "admin cannot approve on behalf of the school",
        () =>
          cert.processBulk("approve", ids.slice(0, 2), {
            ...officer,
            role: "admin",
          }),
        ForbiddenException,
      );
      await rejects(
        "cannot edit a source date after submitting",
        () =>
          registry.review(
            batch.id,
            originalRowId,
            { issuedOn: "2024-07-01" },
            "Should not change submitted data",
            officer,
          ),
        ConflictException,
      );
      const approval = await cert.processBulk(
        "approve",
        [...ids.slice(0, 2), randomUUID()],
        officer,
      );
      check(
        "bulk approval accepts requested rows and reports an unknown record separately",
        approval.succeeded === 2 && approval.failed === 1,
      );
      check(
        "successful approvals remain pending Fabric commit",
        approval.results
          .filter((record) => record.success)
          .every((record) => record.status === "ANCHOR_PENDING"),
      );
      const versions = await transaction.diplomaVersion.findMany({
        where: { diploma: { institutionId } },
      });
      check(
        "each diploma gets its own version and hash",
        versions.length === 2 &&
          new Set(versions.map((version) => version.payloadHash)).size === 2,
      );
      check(
        "each approved diploma gets a separate outbox transaction",
        (await transaction.outboxEvent.count({
          where: { version: { diploma: { institutionId } } },
        })) === 2,
      );
      if (pdfSignatures) {
        const signedDocuments =
          await transaction.signedDiplomaDocument.findMany({
            where: { diplomaId: { in: ids.slice(0, 2) } },
            include: { signatures: true },
          });
        check(
          "bulk approval creates two independently signed PDFs",
          signedDocuments.length === 2 &&
            signedDocuments.every(
              (document) => document.signatures.length === 1,
            ),
        );
        for (const document of signedDocuments) {
          const snapshot = versions.find(
            (version) => version.id === document.versionId,
          )?.payload;
          check(
            "each bulk PDF is cryptographically valid and bound to its own snapshot",
            snapshot &&
              (await pdfSignatures.verifyStored(document, snapshot)).valid,
          );
        }
      }
      const approvedRecords = await transaction.diploma.findMany({
        where: { institutionId, workflowStatus: "APPROVED" },
      });
      check(
        "same campus issues without replacing the source campus or original issue date",
        approvedRecords.every(
          (record) =>
            record.campusId === campus.id &&
            record.issuingCampusId === campus.id &&
            record.issuedOn.toISOString().slice(0, 10) === "2024-06-01",
        ),
      );
      const replay = await cert.processBulk(
        "approve",
        ids.slice(0, 2),
        officer,
      );
      check(
        "replayed approval does not create a second anchor",
        replay.failed === 2 &&
          (await transaction.diplomaVersion.count({
            where: { diploma: { institutionId } },
          })) === 2,
      );
      await cert.processBulk("submit", [ids[2]], officer);
      const rejection = await cert.processBulk(
        "reject",
        [ids[0], ids[2]],
        officer,
        "Source needs another check",
      );
      check(
        "mixed rejection changes only eligible pending records",
        rejection.succeeded === 1 && rejection.failed === 1,
      );
      check(
        "rejection has its own audit trail and no anchor",
        (await transaction.diplomaEvent.count({
          where: { diplomaId: ids[2], eventType: "REJECTED" },
        })) === 1 &&
          (await transaction.diplomaVersion.count({
            where: { diplomaId: ids[2] },
          })) === 0,
      );
      check(
        "same officer prepared and approved each issued record",
        approvedRecords.length === 2 &&
          approvedRecords.every(
            (record) =>
              record.requestedById === officer.id &&
              record.approvedById === officer.id,
          ),
      );
      const historicalInput = {
        ...(
          await transaction.importRow.findUnique({ where: { id: rowIds[0] } })
        ).normalizedData,
        studentCode: "0088888899",
        fullName: "Historical digitization fixture",
        certificateNo: "HIST-CERT",
        registryNo: "HIST-REG",
        issuedOn: null,
      };
      const historicalRow = await transaction.importRow.create({
        data: {
          batchId: batch.id,
          sheetName: "2024",
          rowNumber: 10,
          rawData: historicalInput,
          normalizedData: historicalInput,
          status: "READY",
        },
      });
      await transaction.importBatch.update({
        where: { id: batch.id },
        data: { totalRows: 4 },
      });
      const incompleteHistorical = await registry.commit(
        batch.id,
        officer,
        "DIGITIZATION",
      );
      check(
        "digitization also returns missing issue dates to data review",
        incompleteHistorical.diplomas === 0 &&
          incompleteHistorical.conflicts === 1 &&
          (
            await transaction.importRow.findUnique({
              where: { id: historicalRow.id },
            })
          ).status === "NEEDS_REVIEW",
      );
      await registry.review(
        batch.id,
        historicalRow.id,
        { issuedOn: "2024-06-01" },
        "School confirmed date against source",
        officer,
      );
      check(
        "complete digitization saves after supplementation in data review",
        (await registry.commit(batch.id, officer, "DIGITIZATION")).diplomas ===
          1,
      );
      const historical = await transaction.diploma.findFirstOrThrow({
        where: { graduation: { sourceRowId: historicalRow.id } },
      });
      check(
        "digitization can be submitted directly after saving complete data",
        historical.originType === "DIGITIZATION" &&
          (await cert.processBulk("submit", [historical.id], officer))
            .succeeded === 1,
      );
      const historicalApproval = await cert.processBulk(
        "approve",
        [historical.id],
        officer,
      );
      check(
        "local officer can approve digitization after date confirmation",
        historicalApproval.succeeded === 1,
      );
      const historicalVersion =
        await transaction.diplomaVersion.findFirstOrThrow({
          where: { diplomaId: historical.id },
        });
      check(
        "snapshot contains the confirmed issue date",
        historicalVersion.payload.issueDate === "2024-06-01" &&
          !historicalVersion.payload.issueDateStatus,
      );
      check(
        "approval never substitutes today or the decision date",
        (
          await transaction.diploma.findUniqueOrThrow({
            where: { id: historical.id },
          })
        ).issuedOn
          .toISOString()
          .slice(0, 10) === "2024-06-01",
      );
      const ExcelJS = require("exceljs");
      const sourceBook = new ExcelJS.Workbook();
      const sourceSheet = sourceBook.addWorksheet("2025");
      sourceSheet.addRow(
        Array.from({ length: 18 }, (_, i) => "Column " + i).concat([
          "Loại bằng",
          "Ngày cấp trên bằng",
          "Nơi cấp trên bằng",
          "Người ký trên bằng",
          "Chức danh người ký bằng",
          "Họ tên không dấu",
          "Ngành tiếng Anh",
        ]),
      );
      sourceSheet.addRow([
        1,
        "0088888877",
        "Source",
        "Recovery",
        "2002-01-01",
        "",
        "",
        "",
        "",
        "",
        "",
        program.name,
        "Khá",
        2024,
        "RECOVER-REG",
        "RECOVER-CERT",
        "",
        "",
        "Kỹ sư",
        "2024-06-01",
        "TP. Hồ Chí Minh",
        "Source diploma signer",
        "HIỆU TRƯỞNG",
        "Source Recovery",
        "Recovered English Major",
      ]);
      const sourceBytes = Buffer.from(await sourceBook.xlsx.writeBuffer());
      await transaction.programAlias.create({
        data: {
          institutionId,
          programId: program.id,
          originalName: program.name,
          normalizedName: program.name.toLowerCase(),
          approvedById: officer.id,
        },
      });
      const repairDocument = await transaction.sourceDocument.create({
        data: {
          institutionId,
          fileName: "rollback-source-recovery.xlsx",
          sha256: createHash("sha256").update(sourceBytes).digest("hex"),
          byteSize: sourceBytes.length,
          mediaType: document.mediaType,
          storageKey: "rollback-source/" + suffix,
          uploadedById: officer.id,
        },
      });
      const repairBatch = await transaction.importBatch.create({
        data: {
          institutionId,
          campusId: campus.id,
          documentId: repairDocument.id,
          mappingVersion: "rollback-repair",
          createdById: officer.id,
          totalRows: 1,
          importedRows: 1,
        },
      });
      const legacyData = {
        ...historicalInput,
        studentCode: "0088888877",
        fullName: "Source Recovery",
        certificateNo: "RECOVER-CERT",
        registryNo: "RECOVER-REG",
        degreeType: null,
        issuedOn: null,
        majorNameEn: null,
        issuePlace: null,
        diplomaSignerName: null,
        diplomaSignerTitle: null,
      };
      const repairRow = await transaction.importRow.create({
        data: {
          batchId: repairBatch.id,
          sheetName: "2025",
          rowNumber: 2,
          status: "IMPORTED",
          normalizedData: legacyData,
          rawData: { A2: 1 },
        },
      });
      const {
        writeAcademicRecord,
      } = require("../apps/api/dist/database/academic-record-writer.js");
      const repairGraduation = await writeAcademicRecord(
        transaction,
        { institutionId, campusId: campus.id },
        legacyData,
        repairRow.id,
        repairDocument.id,
      );
      const repairDiploma = await transaction.diploma.create({
        data: {
          institutionId,
          campusId: campus.id,
          graduationId: repairGraduation.id,
          certificateNo: "RECOVER-CERT",
          registryNo: "RECOVER-REG",
          status: "DRAFT",
          workflowStatus: "DRAFT",
          originType: "ISSUANCE",
          printTemplate: "tlu-bilingual-v1",
        },
      });
      const repairRegistry = new RegistryImportService(scoped, {
        getWorkbook: async () => sourceBytes,
      });
      check(
        "source recovery repairs an unsigned draft without disabling database constraints",
        (await repairRegistry.recheck(repairBatch.id, officer))
          .repairedDrafts === 1,
      );
      const recoveredRow = await transaction.importRow.findUnique({
        where: { id: repairRow.id },
      });
      check(
        "source recovery preserves both raw and normalized immutable import data",
        JSON.stringify(recoveredRow.normalizedData) ===
          JSON.stringify(repairRow.normalizedData) &&
          JSON.stringify(recoveredRow.rawData) ===
            JSON.stringify(repairRow.rawData),
      );
      check(
        "source-recovered fields are tracked separately as overrides",
        recoveredRow.overrides.issuedOn === "2024-06-01",
      );
      const recoveredCandidate = (
        await cert.findRequestCandidates(1, 100, "", repairBatch.id, officer)
      ).data[0];
      check(
        "recovered draft is immediately ready to send",
        recoveredCandidate.uuid === repairDiploma.id &&
          !recoveredCandidate.requestErrors.length &&
          !recoveredCandidate.printWarnings.length,
      );
      check(
        "a second recovery does not repair or rewrite the draft again",
        (await repairRegistry.recheck(repairBatch.id, officer))
          .repairedDrafts === 0,
      );
      for (const [label, query, recordId] of [
        [
          "database rejects editing issued print fields",
          "UPDATE diplomas SET issue_place = 'Changed' WHERE id = $1::uuid",
          ids[0],
        ],
        [
          "database rejects changing the issued degree type",
          "UPDATE graduation_records SET degree_type = 'ENGINEER' WHERE id = $1::uuid",
          (
            await transaction.diploma.findUniqueOrThrow({
              where: { id: ids[0] },
            })
          ).graduationId,
        ],
        [
          "database rejects clearing a date recorded in the historical source",
          "UPDATE diplomas SET issued_on = NULL WHERE id = $1::uuid",
          ids[0],
        ],
      ]) {
        await transaction.$executeRawUnsafe("SAVEPOINT diploma_field_guard");
        await rejects(
          label,
          () => transaction.$executeRawUnsafe(query, recordId),
          /immutable|unknown issue date|permission denied/,
        );
        await transaction.$executeRawUnsafe(
          "ROLLBACK TO SAVEPOINT diploma_field_guard",
        );
        await transaction.$executeRawUnsafe(
          "RELEASE SAVEPOINT diploma_field_guard",
        );
      }
      if (pdfSignatures)
        await transaction.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
      throw rollback;
    },
    { timeout: 120000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  const leftover = await database.institution.count({
    where: { id: institutionId },
  });
  check("all integration fixtures are rolled back", leftover === 0);
  await database.$disconnect();
  if (pdfDirectory) {
    const cleanupPath = relative(resolve(tmpdir()), resolve(pdfDirectory));
    assert(
      cleanupPath && !cleanupPath.startsWith("..") && !isAbsolute(cleanupPath),
      "Cleanup stays inside temp directory",
    );
    await rm(pdfDirectory, { recursive: true, force: true });
  }
}
console.log(
  "Reviewed bulk integration checks passed: " +
    checks +
    ". PostgreSQL transaction rolled back; no Fabric transaction submitted.",
);
