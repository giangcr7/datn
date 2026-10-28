import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, "apps/api/.env"), quiet: true });
assert.equal(
  process.env.PDF_SIGNING_MODE,
  "demo",
  "Only local demo certificates are permitted in this test",
);
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
  createDiplomaPdf,
} = require("../apps/api/dist/signatures/pdf-signature-engine.js");
const {
  ConflictException,
  ForbiddenException,
  ServiceUnavailableException,
} = require("@nestjs/common");
const database = new DatabaseService({
  getOrThrow: () => process.env.DATABASE_URL,
});
const directory = await mkdtemp(resolve(tmpdir(), "diplomachain-pdf-test-"));
const settings = {
  driver: process.env.STORAGE_DRIVER,
  root: process.env.STORAGE_LOCAL_ROOT,
};
process.env.STORAGE_DRIVER = "local";
process.env.STORAGE_LOCAL_ROOT = directory;
const storage = new DocumentStorageService();
const signatures = new PdfSignatureService(storage);
const pkiEnabled = process.env.PDF_PKI_ENABLED === "true";
const institutionId = randomUUID();
const suffix = institutionId.slice(0, 8);
const rollback = new Error("ROLLBACK_SIGNED_PDF_FIXTURES");
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
  await database.$transaction(
    async (transaction) => {
      await transaction.institution.create({
        data: {
          id: institutionId,
          code: "PDF_" + suffix,
          name: "Trường Đại học Thủy lợi",
          nameEn: "Thuyloi University",
        },
      });
      const branch = await transaction.campus.create({
        data: {
          institutionId,
          code: "ORG2",
          name: "TP.HCM kiểm thử",
          fabricMspId: "PdfCampus_" + suffix,
        },
      });
      const headquarters = await transaction.campus.create({
        data: {
          institutionId,
          code: "ORG1",
          name: "Hà Nội kiểm thử",
          isHeadquarters: true,
          fabricMspId: "PdfHeadquarters_" + suffix,
        },
      });
      const program = await transaction.program.create({
        data: { institutionId, code: "PDF", name: "Công nghệ thông tin" },
      });
      await transaction.programAlias.create({
        data: {
          institutionId,
          programId: program.id,
          originalName: program.name,
          normalizedName: program.name.toLocaleLowerCase("vi-VN"),
        },
      });
      const actors = [];
      for (const [index, campus] of [branch, headquarters].entries()) {
        const account = await transaction.account.create({
          data: {
            email: "pdf-" + suffix + "-" + index + "@example.test",
            displayName: index === 0 ? "Người ký TP.HCM" : "Người ký Hà Nội",
            passwordHash: "rollback-only-no-login",
          },
        });
        await transaction.accountMembership.create({
          data: {
            accountId: account.id,
            campusId: campus.id,
            role: "UNIVERSITY",
            canApproveDiplomas: index === 1,
          },
        });
        actors.push({
          id: account.id,
          name: account.displayName,
          email: account.email,
          role: "university",
          institutionId,
          campusId: campus.id,
          org: campus.code,
          isHeadquarters: campus.isHeadquarters,
          canApproveDiplomas: index === 1,
        });
      }
      const [maker, checker] = actors;
      const student = await transaction.student.create({
        data: {
          institutionId,
          studentCode: "0099999991",
          fullName: "Nguyễn Văn Kiểm Thử",
          dateOfBirth: new Date("2002-01-01"),
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
      const body = {
        mssv: student.studentCode,
        fullName: student.fullName,
        major: program.name,
        dob: "2002-01-01",
        grade: "GOOD",
        gpa: null,
        namTotNghiep: 2024,
        issueDate: "2024-10-15",
        soHieu: "PDF-" + suffix,
        soVaoSo: "PDF/" + suffix,
        degreeType: "BACHELOR",
        majorNameEn: "Information Technology",
        issuePlace: "Hà Nội",
        diplomaSignerName: "Người ký bằng kiểm thử",
        diplomaSignerTitle: "HIỆU TRƯỞNG",
      };
      const requested = await cert.requestCert(body, maker);
      const diploma = await transaction.diploma.findUnique({
        where: { id: requested.uuid },
        include: diplomaInclude,
      });
      const campusDocument = diploma.signedDocuments[0];
      if (pkiEnabled) {
        check(
          "campus evidence records a verified TSA and good revocation status",
          campusDocument.signatures[0].validationEvidence?.timestamp?.valid ===
            true,
        );
        for (const evidence of [
          {},
          { policy: "pades-bt-pki-v2" },
          {
            policy: "pades-bt-pki-v2",
            timestamp: { valid: true },
            revocation: [],
          },
        ]) {
          await transaction.$executeRawUnsafe("SAVEPOINT invalid_pki_evidence");
          await rejects(
            "database rejects missing or incomplete PKI evidence",
            () =>
              transaction.diplomaPdfSignature.create({
                data: {
                  ...campusDocument.signatures[0],
                  id: randomUUID(),
                  validationEvidence: evidence,
                },
              }),
            /pdf_validation_evidence_shape/,
          );
          await transaction.$executeRawUnsafe(
            "ROLLBACK TO SAVEPOINT invalid_pki_evidence",
          );
          await transaction.$executeRawUnsafe(
            "RELEASE SAVEPOINT invalid_pki_evidence",
          );
        }
        const legacyPending = new Proxy(transaction, {
          get(target, property) {
            return property === "signedDiplomaDocument"
              ? {
                  findUnique: async () => ({
                    ...campusDocument,
                    signatures: campusDocument.signatures.map((signature) => ({
                      ...signature,
                      validationEvidence: null,
                    })),
                  }),
                }
              : Reflect.get(target, property);
          },
        });
        await rejects(
          "legacy pending PDF must not silently downgrade PKI",
          () => signatures.prepareFinal(legacyPending, diploma, checker),
          ConflictException,
        );
        await setting("PDF_PKI_ENABLED", "false", () =>
          rejects(
            "PKI pending records cannot be finalized with PKI disabled",
            () => signatures.prepareFinal(transaction, diploma, checker),
            ServiceUnavailableException,
          ),
        );
      }
      const campusPdf = await cert.downloadPdf(requested.uuid, maker, true);
      const first = await inspectPdfSignatures(campusPdf);
      check(
        "request contains a real campus signature",
        first.length === 1 &&
          first[0].fieldName === "CampusApproval" &&
          first[0].cryptographicallyValid,
      );
      check(
        "origin PDF covers all bytes",
        first[0].coveredBytes === campusPdf.length &&
          fileHash(campusPdf) === campusDocument.originPdfHash,
      );
      await rejects(
        "cannot download an unissued final PDF",
        () => cert.downloadPdf(requested.uuid, maker),
        ConflictException,
      );
      await rejects(
        "campus cannot sign final issuance",
        () => signatures.prepareFinal(transaction, diploma, maker),
        ForbiddenException,
      );
      await rejects(
        "cross-institution headquarters cannot sign",
        () =>
          signatures.prepareFinal(transaction, diploma, {
            ...checker,
            institutionId: randomUUID(),
          }),
        ForbiddenException,
      );
      const changed = { ...diploma, issuedOn: new Date("2024-10-16") };
      await rejects(
        "changed academic data must be reviewed and signed again",
        () => signatures.prepareFinal(transaction, changed, checker),
        ConflictException,
      );
      await setting("PDF_ORG1_CERT_SHA256", "0".repeat(64), () =>
        rejects(
          "wrong signer fingerprint is blocked",
          () => signatures.prepareFinal(transaction, diploma, checker),
          ServiceUnavailableException,
        ),
      );
      const originalHeadquarters = Object.fromEntries(
        ["CERT_PATH", "KEY_PATH", "PASSWORD", "CERT_SHA256"].map((key) => [
          key,
          process.env["PDF_ORG1_" + key],
        ]),
      );
      try {
        for (const key of Object.keys(originalHeadquarters))
          process.env["PDF_ORG1_" + key] = process.env["PDF_ORG2_" + key];
        await rejects(
          "two organizations cannot share a signing certificate",
          () => signatures.prepareFinal(transaction, diploma, checker),
          ConflictException,
        );
      } finally {
        for (const [key, value] of Object.entries(originalHeadquarters))
          process.env["PDF_ORG1_" + key] = value;
      }
      const legacyView = new Proxy(transaction, {
        get(target, property) {
          return property === "signedDiplomaDocument"
            ? { findUnique: async () => null }
            : Reflect.get(target, property);
        },
      });
      await rejects(
        "legacy pending records need a campus signature first",
        () => signatures.prepareFinal(legacyView, diploma, checker),
        ConflictException,
      );
      await cert.approveCert(requested.uuid, checker);
      const completed = await transaction.diploma.findUnique({
        where: { id: requested.uuid },
        include: diplomaInclude,
      });
      const document = completed.signedDocuments[0];
      const snapshot = completed.versions[0].payload;
      const finalPdf = await signatures.getPdf(document);
      check(
        "bilingual printed fields are frozen in the blockchain snapshot",
        snapshot.printedDiploma.degreeType === "BACHELOR" &&
          snapshot.printedDiploma.diplomaSignerName ===
            body.diplomaSignerName &&
          snapshot.printedDiploma.majorNameEn === "Information Technology",
      );
      await transaction.$executeRawUnsafe("SAVEPOINT new_issuance_date_guard");
      await rejects(
        "new issuance cannot clear the real issue date",
        () =>
          transaction.$executeRawUnsafe(
            "UPDATE diplomas SET issued_on = NULL WHERE id = $1::uuid",
            requested.uuid,
          ),
        /unknown issue date|permission denied/,
      );
      await transaction.$executeRawUnsafe(
        "ROLLBACK TO SAVEPOINT new_issuance_date_guard",
      );
      await transaction.$executeRawUnsafe(
        "RELEASE SAVEPOINT new_issuance_date_guard",
      );
      const actual = await inspectPdfSignatures(finalPdf);
      const { PDF } = await import("@libpdf/core");
      const parsedPdf = await PDF.load(finalPdf);
      const pageTexts = parsedPdf.extractText();
      check(
        "signature panel uses a neutral confirmation rather than a fictional diploma signer",
        pageTexts[0].text.includes("XÁC NHẬN CHỮ KÝ SỐ") &&
          !pageTexts[0].text.includes(body.diplomaSignerName),
      );
      check(
        "issued diploma has one page without trial labels or technical instructions",
        pageTexts.length === 1 &&
          !/demo|bản mẫu|thử nghiệm|TSA|OCSP|CRL|Signatures|GMT|SN |phụ lục|blockchain|Nguồn và lịch sử|Mặt bằng sử dụng/i.test(
            pageTexts[0].text,
          ) &&
          !parsedPdf.getMetadata().keywords?.includes("DEMO"),
      );
      check(
        "both printed signature blocks preserve readable Vietnamese",
        pageTexts.length === 1 &&
          pageTexts[0].text.includes("ĐÃ KÝ SỐ - TRỤ SỞ HÀ NỘI") &&
          pageTexts[0].text.includes("ĐÃ KÝ SỐ - CƠ SỞ TP. HỒ CHÍ MINH") &&
          pageTexts[0].text.includes(maker.name) &&
          pageTexts[0].text.includes(checker.name),
      );
      check(
        "face follows diploma fields rather than an internal student report",
        pageTexts[0].text.includes("THE DEGREE OF BACHELOR") &&
          pageTexts[0].text.includes("BẰNG CỬ NHÂN") &&
          !pageTexts[0].text.includes("GPA") &&
          !pageTexts[0].text.includes("MSSV"),
      );
      check(
        "final PDF has two valid and distinct certificates",
        actual.length === 2 &&
          actual.every(
            (item) => item.cryptographicallyValid && item.certificateCurrent,
          ) &&
          actual[0].certificateSha256 !== actual[1].certificateSha256,
      );
      const preview = await PDF.load(
        await createDiplomaPdf(
          snapshot,
          "http://localhost:3000/verify",
          true,
          maker.name,
          pkiEnabled,
          true,
        ),
      );
      check(
        "unsigned preview remains clearly marked and has two empty signature fields",
        preview.extractText().length === 1 &&
          preview
            .extractText()[0]
            .text.includes("BẢN XEM TRƯỚC - CHƯA KÝ SỐ") &&
          preview.getForm().getSignatureFields().length === 2 &&
          preview
            .getForm()
            .getSignatureFields()
            .every((field) => !field.isSigned()),
      );
      const missingSource = await PDF.load(
        await createDiplomaPdf(
          {
            ...snapshot,
            issueDate: null,
            issueDateStatus: "NOT_IN_SOURCE",
            sourceRegistry: {
              fileName: "internal-source.xlsx",
              sheet: "Data",
              row: 1,
            },
            printedDiploma: null,
          },
          "http://localhost:3000/verify",
          true,
          maker.name,
          pkiEnabled,
        ),
      );
      check(
        "historical missing fields are not invented and do not add technical notes",
        missingSource.extractText().length === 1 &&
          missingSource.extractText()[0].text.includes("Ngày cấp: -") &&
          !/BẢN SỐ HÓA|THÔNG TIN CHƯA|Nguồn:|internal-source|TSA|OCSP|CRL|DEMO|THỬ NGHIỆM/.test(
            missingSource.extractText()[0].text,
          ),
      );
      const certificateLayout = await PDF.load(
        await createDiplomaPdf(
          snapshot,
          "http://localhost:3000/verify",
          false,
          maker.name,
          pkiEnabled,
        ),
      );
      const {
        showDigitalSignature,
      } = require("../apps/api/dist/signatures/diploma-pdf-template.js");
      const legacyLayout = PDF.create();
      legacyLayout.addPage({ size: "a4", orientation: "landscape" });
      legacyLayout.addPage({ size: "a4", orientation: "landscape" });
      legacyLayout.setMetadata({ keywords: ["tlu-bilingual-v1"] });
      const legacyField = legacyLayout
        .getOrCreateForm()
        .createSignatureField("CampusApproval");
      await showDigitalSignature(
        legacyLayout,
        legacyField,
        1,
        maker.name,
        new Date(),
      );
      const legacyParsed = await PDF.load(await legacyLayout.save());
      check(
        "legacy two-page requests keep the campus signature on their original appendix",
        legacyParsed.extractText().length === 2 &&
          !legacyParsed.extractText()[0].text.includes(maker.name) &&
          legacyParsed.extractText()[1].text.includes(maker.name),
      );
      check(
        "certificate layout preserves verified diploma signer data without extra labels",
        certificateLayout.extractText().length === 1 &&
          certificateLayout
            .extractText()[0]
            .text.includes(body.diplomaSignerName) &&
          !/BẢN MẪU|DEMO|TSA|OCSP|CRL/.test(
            certificateLayout.extractText()[0].text,
          ),
      );
      check(
        "second signature preserves the entire first revision",
        fileHash(finalPdf.subarray(0, actual[0].coveredBytes)) ===
          fileHash(campusPdf) && actual[1].coveredBytes === finalPdf.length,
      );
      check(
        "final PDF hash is bound to immutable snapshot",
        snapshot.signedPdfHash === fileHash(finalPdf),
      );
      check(
        "stored PDF validation succeeds",
        (await signatures.verifyStored(document, snapshot)).valid,
      );
      if (pkiEnabled) {
        check(
          "both signature evidence hashes are pinned in the snapshot",
          snapshot.pdfSignaturePolicy === "two-organizations-pades-bt-pki-v2" &&
            snapshot.pdfSignatures.every((signature) =>
              /^[0-9a-f]{64}$/.test(signature.validationEvidenceHash),
            ),
        );
        check(
          "public verification reports trusted timestamps and current PKI status",
          (await signatures.verifyStored(document, snapshot)).pkiStatus ===
            "VALID",
        );
        const changedEvidence = {
          ...document,
          signatures: document.signatures.map((signature, index) =>
            index === 0
              ? {
                  ...signature,
                  validationEvidence: {
                    ...signature.validationEvidence,
                    trustAnchorSha256: "0".repeat(64),
                  },
                }
              : signature,
          ),
        };
        check(
          "database evidence tampering fails blockchain snapshot comparison",
          !(await signatures.verifyStored(changedEvidence, snapshot)).valid,
        );
        check(
          "missing blockchain evidence pin is rejected",
          !(
            await signatures.verifyStored(document, {
              ...snapshot,
              pdfSignatures: snapshot.pdfSignatures.map(
                ({ validationEvidenceHash, ...signature }) => signature,
              ),
            })
          ).valid,
        );
        await setting("PDF_PKI_ENABLED", "false", async () => {
          const unavailable = await signatures.verifyStored(document, snapshot);
          check(
            "missing trust configuration does not imply a valid signature",
            !unavailable.valid && unavailable.pkiStatus === "UNAVAILABLE",
          );
        });
      }
      check(
        "swapped certificate pins fail validation",
        !(
          await signatures.verifyStored(document, {
            ...snapshot,
            pdfSignatures: [...snapshot.pdfSignatures].reverse(),
          })
        ).valid,
      );
      const wrongMetadata = {
        ...document,
        signatures: document.signatures.map((item, index) =>
          index === 0 ? { ...item, certificateSha256: "0".repeat(64) } : item,
        ),
      };
      check(
        "signature database metadata must match the PDF and snapshot",
        !(await signatures.verifyStored(wrongMetadata, snapshot)).valid,
      );
      await rejects(
        "final download waits for actual blockchain commit",
        () => cert.downloadPdf(requested.uuid, maker),
        ConflictException,
      );
      const unregistered = new VerifyService({}, scoped, signatures);
      check(
        "file verification fails closed before blockchain commit",
        (await unregistered.verifyPdf(finalPdf)).verificationStatus ===
          "ANCHOR_PENDING",
      );
      const modified = Buffer.from(finalPdf);
      assert(
        modified.subarray(0, 7).toString("ascii") === "%PDF-1.",
        "Expected PDF header",
      );
      modified[7] = modified[7] === 55 ? 54 : 55;
      let tamperedValid = false;
      try {
        tamperedValid = (await inspectPdfSignatures(modified)).every(
          (item) => item.cryptographicallyValid,
        );
      } catch {}
      check(
        "changing one signed byte invalidates cryptographic verification",
        !tamperedValid,
      );
      check(
        "modified PDF is not a registered signed file",
        (await unregistered.verifyPdf(modified)).verificationStatus ===
          "PDF_NOT_REGISTERED",
      );
      const appended = Buffer.concat([
        finalPdf,
        Buffer.from("\n% appended unsigned data\n"),
      ]);
      check(
        "appending unsigned data changes registered file identity",
        (await unregistered.verifyPdf(appended)).verificationStatus ===
          "PDF_NOT_REGISTERED",
      );
      await writeFile(resolve(directory, document.signedPdfKey), modified);
      await rejects(
        "storage corruption is rejected by checksum",
        () => signatures.getPdf(document),
        ServiceUnavailableException,
      );
      await writeFile(resolve(directory, document.signedPdfKey), finalPdf);
      await transaction.$executeRawUnsafe("SET CONSTRAINTS ALL IMMEDIATE");
      checks++;
      for (const [label, query] of [
        [
          "completed document history cannot change",
          "UPDATE signed_diploma_documents SET signed_pdf_hash = repeat('0',64) WHERE id = $1::uuid",
        ],
        [
          "signature history cannot change",
          "UPDATE diploma_pdf_signatures SET signer_name = 'Changed' WHERE document_id = $1::uuid",
        ],
        [
          "signature history cannot be removed",
          "DELETE FROM diploma_pdf_signatures WHERE document_id = $1::uuid",
        ],
      ]) {
        await transaction.$executeRawUnsafe("SAVEPOINT immutable_pdf_test");
        await rejects(
          label,
          () => transaction.$executeRawUnsafe(query, document.id),
          /immutable|permission denied/,
        );
        await transaction.$executeRawUnsafe(
          "ROLLBACK TO SAVEPOINT immutable_pdf_test",
        );
        await transaction.$executeRawUnsafe(
          "RELEASE SAVEPOINT immutable_pdf_test",
        );
      }
      if (process.argv.includes("--sample")) {
        const output = resolve(root, "output/pdf");
        await mkdir(output, { recursive: true });
        await writeFile(resolve(output, "mau-van-bang-ky-so.pdf"), finalPdf);
      }
      throw rollback;
    },
    { timeout: 120000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await database.$disconnect();
  for (const [key, value] of [
    ["STORAGE_DRIVER", settings.driver],
    ["STORAGE_LOCAL_ROOT", settings.root],
  ]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const cleanupPath = relative(resolve(tmpdir()), resolve(directory));
  assert(
    cleanupPath && !cleanupPath.startsWith("..") && !isAbsolute(cleanupPath),
    "Temporary cleanup must remain within temp directory",
  );
  await rm(directory, { recursive: true, force: true });
}
await database.$connect();
try {
  check(
    "test fixtures are rolled back",
    !(await database.institution.findUnique({ where: { id: institutionId } })),
  );
} finally {
  await database.$disconnect();
}
console.log(
  "Signed PDF checks passed: " +
    checks +
    ". Real sequential signatures, tampering, role boundaries and immutable PostgreSQL history checked. Fixtures rolled back; no ledger transaction sent.",
);
