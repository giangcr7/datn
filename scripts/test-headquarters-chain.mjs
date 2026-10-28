import assert from "node:assert/strict";
import { randomInt, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, "apps/api/.env"), quiet: true });
assert(
  process.argv.includes("--write-demo"),
  "Requires --write-demo: this creates synthetic records and permanent ledger transactions; use local/test only.",
);
const api = process.env.TEST_API_URL || "http://localhost:3001/api";
assert(
  ["localhost", "127.0.0.1"].includes(new URL(api).hostname),
  "Only a local API is allowed",
);
const require = createRequire(import.meta.url);
const { ConfigService } = require("@nestjs/config");
const { FabricService } = require("../apps/api/dist/fabric/fabric.service.js");
const {
  fileHash,
  inspectPdfSignatures,
} = require("../apps/api/dist/signatures/pdf-signature-engine.js");
const fabric = new FabricService(new ConfigService(process.env));
const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
const sessions = [];
const suffix =
  new Date().toISOString().replace(/\D/g, "").slice(0, 14) +
  "-" +
  randomUUID().slice(0, 6);
const output = resolve(root, "outputs", "headquarters-" + suffix);
const records = [];
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
  console.log("PASS " + label);
}
async function request(path, token, body, expected = 200) {
  await delay(250);
  const response = await fetch(api + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json();
  assert.equal(response.status, expected, path + ": " + JSON.stringify(data));
  return data;
}
async function login(prefix, role) {
  const data = await request(
    "/auth/login",
    null,
    {
      email: process.env["BOOTSTRAP_" + prefix + "_EMAIL"],
      password: process.env["BOOTSTRAP_" + prefix + "_PASSWORD"],
      role,
    },
    201,
  );
  sessions.push(data);
  return data;
}
async function downloadPdf(uuid, token, stage = "issued", expected = 200) {
  await delay(250);
  const response = await fetch(
    api +
      "/cert/" +
      uuid +
      "/pdf" +
      (stage === "campus" ? "?stage=campus" : ""),
    {
      headers: token ? { Authorization: "Bearer " + token } : {},
    },
  );
  assert.equal(response.status, expected, "PDF download status");
  if (expected !== 200) return null;
  assert(response.headers.get("content-type")?.includes("application/pdf"));
  return Buffer.from(await response.arrayBuffer());
}
async function verifyPdf(bytes) {
  await delay(250);
  const body = new FormData();
  body.append(
    "file",
    new Blob([bytes], { type: "application/pdf" }),
    "diploma.pdf",
  );
  const response = await fetch(api + "/verify/pdf", { method: "POST", body });
  const result = await response.json();
  assert.equal(response.status, 201, JSON.stringify(result));
  return result;
}
async function committed(uuid, eventType) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const rows = (
      await database.query(
        "SELECT a.status,a.transaction_id,a.block_number,a.issuer_msp_id,a.payload_hash,a.last_error FROM blockchain_anchors a JOIN diploma_versions v ON v.id=a.version_id WHERE v.diploma_id=$1 AND a.event_type=$2",
        [uuid, eventType],
      )
    ).rows;
    if (rows[0]?.status === "COMMITTED") return rows[0];
    if (attempt === 59)
      throw new Error("Anchor timeout: " + JSON.stringify(rows));
    await delay(1500);
  }
}
try {
  await database.connect();
  const health = await request("/health");
  check(
    "Fabric enabled and connected",
    health.details.fabric.connected === true && !health.details.fabric.disabled,
  );
  const hcm = await login("ORG2", "university");
  const hanoi = await login("ORG1", "university");
  const admin = await login("ADMIN", "admin");
  check(
    "only headquarters university has approval capability",
    !hcm.user.canApproveDiplomas &&
      hanoi.user.canApproveDiplomas &&
      !admin.user.canApproveDiplomas,
  );
  const programs = await request("/imports/programs", hcm.access_token);
  const program = programs.find((item) => item.code === "IT") || programs[0];
  assert(program, "A configured program is required");
  for (const purpose of ["active", "revoke", "reject"]) {
    const studentCode = "0088" + String(randomInt(1000000)).padStart(6, "0");
    const name = "Sinh viên test Hà Nội " + purpose + " " + suffix;
    const student = {
      name,
      email: "hq-" + purpose + "-" + suffix + "@example.com",
      studentId: studentCode,
    };
    await request("/students", hcm.access_token, student, 201);
    const body = {
      mssv: studentCode,
      fullName: name,
      dob: "2002-01-01",
      major: program.name,
      grade: "Khá",
      gpa: null,
      namTotNghiep: 2025,
      issueDate: "2025-07-15",
      degreeType: "BACHELOR",
      majorNameEn: "Information Technology",
      issuePlace: "Hà Nội",
      diplomaSignerName: "Demo printed signer",
      diplomaSignerTitle: "HIỆU TRƯỞNG",
      className: "HQ-DEMO-IT",
      soHieu: "HQDEMO-" + suffix + "-" + purpose,
      soVaoSo: "HQDEMO/" + suffix + "/" + purpose,
    };
    const requested = await request(
      "/cert/request",
      hcm.access_token,
      body,
      201,
    );
    records.push({ purpose, uuid: requested.uuid, student, request: body });
  }
  const campusPdf = await downloadPdf(
    records[0].uuid,
    hanoi.access_token,
    "campus",
  );
  const campusSignatures = await inspectPdfSignatures(campusPdf);
  check(
    "Hà Nội can inspect a cryptographically signed campus PDF",
    campusSignatures.length === 1 && campusSignatures[0].cryptographicallyValid,
  );
  await downloadPdf(records[0].uuid, hcm.access_token, "issued", 409);
  await downloadPdf(records[0].uuid, null, "campus", 401);
  check("unsigned issuance and anonymous PDF downloads are blocked", true);
  const pending = await request("/cert/pending", hanoi.access_token);
  check(
    "Hà Nội sees HCM requests",
    records.every((item) =>
      pending.some((row) => row.uuid === item.uuid && row.org === "ORG2"),
    ),
  );
  await request("/cert/approve/" + records[0].uuid, hcm.access_token, {}, 403);
  await request(
    "/cert/approve/" + records[0].uuid,
    admin.access_token,
    {},
    403,
  );
  check("HCM and admin cannot approve", true);
  for (const record of records.slice(0, 2)) {
    const approved = await request(
      "/cert/approve/" + record.uuid,
      hanoi.access_token,
      {},
      201,
    );
    check(
      record.purpose + " approval queues a headquarters transaction",
      approved.status === "ANCHOR_PENDING" &&
        approved.issuerMspId === "Org1MSP",
    );
    record.anchor = await committed(record.uuid, "ISSUE");
    const view = await request("/cert/" + record.uuid, hcm.access_token);
    check(
      record.purpose + " reaches ON_CHAIN without relabelling HCM origin",
      view.status === "ON_CHAIN" &&
        view.org === "ORG2" &&
        view.issuerOrg === "ORG1" &&
        view.issuerMspId === "Org1MSP",
    );
    const verified = await request(
      "/verify",
      null,
      { certUUID: record.uuid },
      201,
    );
    const expectedStatus =
      process.env.PDF_SIGNING_MODE === "demo" ? "VERIFIED_DEMO" : "VERIFIED";
    check(
      record.purpose + " verifies against the live ledger",
      verified.isValid &&
        verified.verificationStatus === expectedStatus &&
        verified.details.issuerMatchChain,
    );
    check(
      record.purpose + " has two PDF signatures pinned to the ledger snapshot",
      verified.details.pdfVerification?.valid &&
        verified.details.pdfVerification.signatures.length === 2,
    );
    if (process.env.PDF_PKI_ENABLED === "true") {
      check(
        record.purpose + " has verified TSA timestamps and live OCSP/CRL",
        verified.details.pdfVerification.pkiStatus === "VALID" &&
          verified.details.pdfVerification.trustedTimestamp &&
          verified.details.pdfVerification.signatures.every(
            (signature) =>
              signature.pkiEvidence?.timestamp.valid &&
              signature.pkiEvidence.revocation.every(
                (evidence) => evidence.status === "GOOD",
              ),
          ),
      );
    }
    const signedPdf = await downloadPdf(record.uuid, hcm.access_token);
    const pdfSignatures = await inspectPdfSignatures(signedPdf);
    check(
      record.purpose + " downloads a PDF with two valid signatures",
      pdfSignatures.length === 2 &&
        pdfSignatures.every((item) => item.cryptographicallyValid) &&
        fileHash(signedPdf) === view.signedPdfHash,
    );
    const fileResult = await verifyPdf(signedPdf);
    check(
      record.purpose + " verifies the complete uploaded PDF",
      fileResult.isValid &&
        fileResult.fileVerification === "EXACT_SIGNED_FILE_MATCH",
    );
    record.signedPdfHash = fileHash(signedPdf);
    await mkdir(output, { recursive: true });
    await writeFile(resolve(output, record.purpose + "-signed.pdf"), signedPdf);
    const changedPdf = Buffer.from(signedPdf);
    changedPdf[7] = changedPdf[7] === 55 ? 54 : 55;
    const changedResult = await verifyPdf(changedPdf);
    check(
      record.purpose + " rejects a PDF with a single modified byte",
      !changedResult.isValid &&
        changedResult.verificationStatus === "PDF_NOT_REGISTERED",
    );
    record.proof = view.proof;
    const chain = await fabric.execute(
      "evaluate",
      "QueryDiplomaAnchor",
      record.uuid,
      "1",
    );
    check(
      record.purpose + " query confirms headquarters signer and transaction",
      chain.result.issuerMspId === "Org1MSP" &&
        chain.result.issueTxId === record.anchor.transaction_id,
    );
  }
  const active = records[0];
  const tampered = await request(
    "/verify",
    null,
    { ...active.proof, fullName: "Altered synthetic proof" },
    201,
  );
  check(
    "tampered proof fails verification",
    !tampered.isValid && tampered.verificationStatus === "HASH_MISMATCH",
  );
  const idempotent = await fabric.executeForMsp(
    "Org1MSP",
    "submit",
    "AnchorDiploma",
    active.uuid,
    "1",
    "diploma-v1",
    active.anchor.payload_hash,
    "Org1MSP",
  );
  const retried = JSON.parse(idempotent.payload);
  check(
    "retry preserves original transaction",
    retried.idempotent && retried.txId === active.anchor.transaction_id,
  );
  await assert.rejects(() =>
    fabric.executeForMsp(
      "Org1MSP",
      "submit",
      "AnchorDiploma",
      active.uuid,
      "1",
      "diploma-v1",
      "0".repeat(64),
      "Org1MSP",
    ),
  );
  check("chain rejects a conflicting hash", true);
  await request(
    "/cert/reject/" + records[2].uuid,
    hcm.access_token,
    { reason: "Forbidden branch rejection" },
    403,
  );
  await request(
    "/cert/reject/" + records[2].uuid,
    hanoi.access_token,
    { reason: "Synthetic rejection test" },
    201,
  );
  const rejected = await request("/cert/" + records[2].uuid, hcm.access_token);
  check(
    "Hà Nội rejects without publishing a snapshot",
    rejected.status === "REJECTED" && rejected.certHash === null,
  );
  const revocable = records[1];
  await request(
    "/cert/revoke",
    hcm.access_token,
    { certUUID: revocable.uuid, reason: "Forbidden branch revocation" },
    403,
  );
  await request(
    "/cert/revoke",
    admin.access_token,
    { certUUID: revocable.uuid, reason: "Forbidden admin revocation" },
    403,
  );
  await request(
    "/cert/revoke",
    hanoi.access_token,
    { certUUID: revocable.uuid, reason: "Synthetic on-chain revocation test" },
    201,
  );
  revocable.revokeAnchor = await committed(revocable.uuid, "REVOKE");
  const revoked = await fabric.execute(
    "evaluate",
    "QueryDiplomaAnchor",
    revocable.uuid,
    "1",
  );
  check(
    "revocation really commits on the ledger",
    revoked.result.isRevoked &&
      revoked.result.revokeTxId === revocable.revokeAnchor.transaction_id,
  );
  const invalid = await request(
    "/verify",
    null,
    { certUUID: revocable.uuid },
    201,
  );
  check(
    "revoked diploma is invalid",
    !invalid.isValid && invalid.verificationStatus === "REVOKED",
  );
  await downloadPdf(revocable.uuid, hcm.access_token, "issued", 409);
  check("revoked PDF can no longer be downloaded as an issued diploma", true);
  const audit = await request(
    "/cert/" + active.uuid + "/history",
    admin.access_token,
  );
  check(
    "admin can inspect history without approving",
    audit.history.some((item) => item.eventType === "ANCHOR_COMMITTED"),
  );
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        checks,
        channel: fabric.channel,
        chaincode: fabric.chaincode,
        records,
      },
      null,
      2,
    ),
  );
  console.log(
    "Headquarters/Fabric checks passed: " +
      checks +
      ". Synthetic records retained; ledger transactions cannot be deleted. Report: " +
      resolve(output, "result.json"),
  );
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(
    resolve(output, "result.json"),
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        checks,
        channel: fabric.channel,
        chaincode: fabric.chaincode,
        records,
      },
      null,
      2,
    ),
  );
  for (const session of sessions) {
    try {
      await request(
        "/auth/logout",
        null,
        { refreshToken: session.refresh_token },
        201,
      );
    } catch {}
  }
  fabric.onModuleDestroy();
  await database.end();
}
