import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, "apps/api/.env"), quiet: true });
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require("../apps/api/dist/database/database.service.js");
const { CertService } = require("../apps/api/dist/cert/cert.service.js");
const { VerifyService } = require("../apps/api/dist/verify/verify.service.js");
const {
  PdfSignatureService,
} = require("../apps/api/dist/signatures/pdf-signature.service.js");
const {
  DocumentStorageService,
} = require("../apps/api/dist/storage/document-storage.service.js");
const {
  diplomaInclude,
} = require("../apps/api/dist/database/diploma-projection.js");
const {
  fileHash,
  inspectPdfSignatures,
} = require("../apps/api/dist/signatures/pdf-signature-engine.js");
const {
  ForbiddenException,
  ConflictException,
  ServiceUnavailableException,
} = require("@nestjs/common");

assert.equal(
  process.env.PDF_SIGNING_MODE,
  "demo",
  "Regression fixtures must only use local test credentials",
);
const database = new DatabaseService({
  getOrThrow: () => process.env.DATABASE_URL,
});
const signatures = new PdfSignatureService(new DocumentStorageService());
const institutionId = randomUUID();
const rollback = new Error("ROLLBACK_SINGLE_CAMPUS_FIXTURES");
const directory = await mkdtemp(
  resolve(tmpdir(), "diplomachain-single-campus-"),
);
const originalStorage = {
  driver: process.env.STORAGE_DRIVER,
  root: process.env.STORAGE_LOCAL_ROOT,
};
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
async function rejects(label, action, exception) {
  await assert.rejects(action, exception, label);
  checks++;
}
async function setting(key, value, action) {
  const previous = process.env[key];
  process.env[key] = value;
  try {
    return await action();
  } finally {
    if (previous === undefined) delete process.env[key];
    else process.env[key] = previous;
  }
}

try {
  process.env.STORAGE_LOCAL_ROOT = resolve(
    root,
    "apps/api",
    originalStorage.root || "../../.data/documents",
  );
  const history = await database.signedDiplomaDocument.findMany({
    where: { completedAt: { not: null }, version: { gt: 0 } },
    include: { signatures: true, diplomaVersion: true },
  });
  for (const document of history) {
    const snapshot = document.diplomaVersion?.payload;
    if (!String(snapshot?.pdfSignaturePolicy).startsWith("two-organizations-"))
      continue;
    check(
      "historical two-signature PDFs remain valid",
      (await signatures.verifyStored(document, snapshot)).valid,
    );
  }
  process.env.STORAGE_DRIVER = "local";
  process.env.STORAGE_LOCAL_ROOT = directory;

  await database.$transaction(
    async (transaction) => {
      await transaction.institution.create({
        data: {
          id: institutionId,
          code: "ONE_" + institutionId,
          name: "Trường Đại học Thủy lợi",
          nameEn: "Thuyloi University",
        },
      });
      const campus = await transaction.campus.create({
        data: {
          institutionId,
          code: "ORG2",
          name: "Cơ sở chính TP. Hồ Chí Minh",
          isHeadquarters: true,
          fabricMspId: "Single_" + institutionId,
        },
      });
      const account = await transaction.account.create({
        data: {
          email: institutionId + "@example.test",
          displayName: "Cán bộ TP. Hồ Chí Minh",
          passwordHash: "not-a-login-hash",
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
      const actor = {
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
      const program = await transaction.program.create({
        data: {
          institutionId,
          code: "IT",
          name: "Công nghệ thông tin",
          nameEn: "Information Technology",
        },
      });
      const student = await transaction.student.create({
        data: {
          institutionId,
          studentCode: "SINGLE-001",
          fullName: "Nguyễn Văn An",
          dateOfBirth: new Date("2002-01-01"),
        },
      });
      const graduation = await transaction.graduationRecord.create({
        data: {
          institutionId,
          studentId: student.id,
          programId: program.id,
          graduationYear: 2024,
          classification: "GOOD",
          degreeType: "BACHELOR",
          gpa: 3.2,
        },
      });
      const scoped = new Proxy(transaction, {
        get(target, property) {
          if (property === "$transaction")
            return async (callback) => callback(transaction);
          const value = Reflect.get(target, property);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const cert = new CertService(scoped, signatures);
      async function draft(number) {
        const academic =
          number === 1
            ? graduation
            : await transaction.graduationRecord.create({
                data: {
                  institutionId,
                  studentId: student.id,
                  programId: program.id,
                  graduationYear: 2024 - number,
                  classification: "GOOD",
                  degreeType: "BACHELOR",
                  gpa: 3.2,
                },
              });
        return transaction.diploma.create({
          data: {
            institutionId,
            campusId: campus.id,
            graduationId: academic.id,
            certificateNo: "ONE-" + number,
            registryNo: "REG-" + number,
            issuedOn: new Date("2024-06-01"),
            issuePlace: "TP. Hồ Chí Minh",
            originType: "ISSUANCE",
            printTemplate: "tlu-bilingual-v1",
            majorNameEn: "Information Technology",
            diplomaSignerName: "Người ký",
            diplomaSignerTitle: "HIỆU TRƯỞNG",
          },
        });
      }
      const first = await draft(1);
      for (const unauthorized of [
        { ...actor, role: "admin" },
        { ...actor, role: "student" },
        { ...actor, canApproveDiplomas: false },
        { ...actor, isHeadquarters: false },
      ])
        await rejects(
          "unauthorized roles cannot approve",
          () => cert.approveCert(first.id, unauthorized),
          ForbiddenException,
        );
      await setting("PDF_ORG2_CERT_SHA256", "0".repeat(64), async () => {
        await transaction.$executeRawUnsafe("SAVEPOINT signing_failure");
        await rejects(
          "bad signing configuration cannot issue",
          () => cert.approveCert(first.id, actor),
          ServiceUnavailableException,
        );
        await transaction.$executeRawUnsafe(
          "ROLLBACK TO SAVEPOINT signing_failure",
        );
        await transaction.$executeRawUnsafe(
          "RELEASE SAVEPOINT signing_failure",
        );
      });
      check(
        "signing failure leaves no version or anchor",
        (await transaction.diplomaVersion.count({
          where: { diplomaId: first.id },
        })) === 0,
      );
      const approved = await cert.approveCert(first.id, actor);
      check(
        "one officer directly approves a draft",
        approved.status === "ANCHOR_PENDING" &&
          approved.issuingCampusId === campus.id,
      );
      const diploma = await transaction.diploma.findUniqueOrThrow({
        where: { id: first.id },
        include: diplomaInclude,
      });
      check(
        "maker and approver are the same local officer",
        diploma.requestedById === actor.id &&
          diploma.approvedById === actor.id &&
          diploma.issuingCampusId === diploma.campusId,
      );
      const document = diploma.signedDocuments[0];
      const snapshot = diploma.versions[0].payload;
      const finalPdf = await signatures.getPdf(document);
      const actual = await inspectPdfSignatures(finalPdf);
      check(
        "new PDF has exactly one cryptographically valid signature",
        actual.length === 1 &&
          actual[0].cryptographicallyValid &&
          actual[0].coveredBytes === finalPdf.length,
      );
      check(
        "PDF and policy are pinned to the snapshot",
        snapshot.signedPdfHash === fileHash(finalPdf) &&
          String(snapshot.pdfSignaturePolicy).startsWith(
            "single-campus-one-approver-",
          ) &&
          snapshot.pdfSignatures.length === 1,
      );
      check(
        "single signature verifies with stored PKI evidence",
        (await signatures.verifyStored(document, snapshot)).valid,
      );
      check(
        "issuer actor pin cannot be changed",
        !(
          await signatures.verifyStored(document, {
            ...snapshot,
            pdfSignatures: [
              { ...snapshot.pdfSignatures[0], actorId: randomUUID() },
            ],
          })
        ).valid,
      );
      check(
        "single-signature PDF cannot masquerade as historical two-signature policy",
        !(
          await signatures.verifyStored(document, {
            ...snapshot,
            pdfSignaturePolicy: "two-organizations-pades-bt-pki-v2",
          })
        ).valid,
      );
      await rejects(
        "already approved diploma cannot be reissued",
        () => cert.approveCert(first.id, actor),
        ConflictException,
      );
      await rejects(
        "download waits for blockchain commit",
        () => cert.downloadPdf(first.id, actor),
        ConflictException,
      );
      const verifier = new VerifyService(
        {
          execute: async () => {
            throw new Error("No real ledger calls allowed");
          },
        },
        scoped,
        signatures,
      );
      check(
        "public verification does not claim validity before commit",
        (await verifier.verifyPdf(finalPdf)).verificationStatus ===
          "ANCHOR_PENDING",
      );
      const second = await draft(2);
      await cert.submitDraft(second.id, undefined, actor);
      check(
        "local pending records have no redundant preparer signature",
        (await transaction.signedDiplomaDocument.count({
          where: { diplomaId: second.id },
        })) === 0,
      );
      check(
        "same officer can approve their own pending request",
        (await cert.approveCert(second.id, actor)).success,
      );
      const rejected = await draft(3);
      await cert.submitDraft(rejected.id, undefined, actor);
      check(
        "same officer can reject their own pending record",
        (await cert.rejectCert(rejected.id, "Cần đối chiếu lại dữ liệu", actor))
          .success,
      );
      await transaction.blockchainAnchor.update({
        where: { id: diploma.versions[0].anchors[0].id },
        data: {
          status: "COMMITTED",
          transactionId: institutionId.replaceAll("-", "").repeat(2),
          committedAt: new Date(),
        },
      });
      const committedVerifier = new VerifyService(
        {
          execute: async () => ({
            result: {
              payloadHash: diploma.versions[0].payloadHash,
              issuerMspId: campus.fabricMspId,
              isRevoked: false,
            },
          }),
        },
        scoped,
        signatures,
      );
      check(
        "mocked commit enables the exact signed PDF download",
        fileHash(await cert.downloadPdf(first.id, actor)) ===
          fileHash(finalPdf),
      );
      check(
        "public PDF verification accepts the single signature after a mocked commit",
        (await committedVerifier.verifyPdf(finalPdf)).isValid,
      );
      check(
        "public verification fails closed on ledger outage",
        (await verifier.verifyPdf(finalPdf)).verificationStatus ===
          "UNAVAILABLE",
      );
      await cert.revoke(first.id, "Thu hồi trong transaction kiểm thử", actor);
      check(
        "the same officer can revoke their issuance",
        (await committedVerifier.verifyPdf(finalPdf)).verificationStatus ===
          "REVOKED",
      );
      await rejects(
        "revoked diploma cannot be downloaded as a valid issued PDF",
        () => cert.downloadPdf(first.id, actor),
        ConflictException,
      );

      const modified = Buffer.from(finalPdf);
      modified[7] ^= 1;
      check(
        "modified PDF cannot verify",
        (await verifier.verifyPdf(modified)).verificationStatus ===
          "PDF_NOT_REGISTERED",
      );
      check(
        "appended bytes cannot verify",
        (
          await verifier.verifyPdf(
            Buffer.concat([finalPdf, Buffer.from("\n% unsigned data")]),
          )
        ).verificationStatus === "PDF_NOT_REGISTERED",
      );
      await writeFile(resolve(directory, document.signedPdfKey), modified);
      await rejects(
        "stored-file corruption fails checksum",
        () => signatures.getPdf(document),
        ServiceUnavailableException,
      );
      await writeFile(resolve(directory, document.signedPdfKey), finalPdf);
      await transaction.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
      checks++;
      for (const query of [
        "UPDATE signed_diploma_documents SET signed_pdf_hash=repeat('0',64) WHERE id=$1::uuid",
        "UPDATE diploma_pdf_signatures SET signer_name='Changed' WHERE document_id=$1::uuid",
        "DELETE FROM diploma_pdf_signatures WHERE document_id=$1::uuid",
      ]) {
        await transaction.$executeRawUnsafe("SAVEPOINT immutable_history");
        await rejects(
          "completed signed history remains immutable",
          () => transaction.$executeRawUnsafe(query, document.id),
          /immutable|permission denied/,
        );
        await transaction.$executeRawUnsafe(
          "ROLLBACK TO SAVEPOINT immutable_history",
        );
        await transaction.$executeRawUnsafe(
          "RELEASE SAVEPOINT immutable_history",
        );
      }
      if (process.argv.includes("--sample")) {
        await mkdir(resolve(root, "output/pdf"), { recursive: true });
        await writeFile(
          resolve(root, "output/pdf/mau-van-bang-ky-so.pdf"),
          finalPdf,
        );
      }
      throw rollback;
    },
    { timeout: 180000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  for (const [key, value] of [
    ["STORAGE_DRIVER", originalStorage.driver],
    ["STORAGE_LOCAL_ROOT", originalStorage.root],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await database.$disconnect();
  const cleanupPath = relative(resolve(tmpdir()), directory);
  assert(
    cleanupPath && !cleanupPath.startsWith("..") && !isAbsolute(cleanupPath),
  );
  await rm(directory, { recursive: true, force: true });
}
await database.$connect();
try {
  check(
    "all test fixtures are rolled back",
    !(await database.institution.findUnique({ where: { id: institutionId } })),
  );
} finally {
  await database.$disconnect();
}
console.log(
  "Single-campus checks passed: " +
    checks +
    ". One officer, real PDF signature, PKI, tamper detection, historical compatibility. Fixtures rolled back; no ledger transaction sent.",
);
