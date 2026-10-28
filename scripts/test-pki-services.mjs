import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import * as asn1js from "asn1js";
import { ContentInfo, SignedData, TSTInfo } from "pkijs";
import { setupDemoPki, startDemoPki } from "./lib/demo-pki.mjs";

assert.notEqual(
  process.env.NODE_ENV,
  "production",
  "Only local PKI tests are allowed",
);
const environment = { ...process.env };
const require = createRequire(import.meta.url);
const {
  PkiService,
  pemCertificates,
} = require("../apps/api/dist/signatures/pki.service.js");
const {
  createDiplomaPdf,
  demoSigner,
  inspectPdfSignatures,
  signPdf,
} = require("../apps/api/dist/signatures/pdf-signature-engine.js");
const directory = await mkdtemp(resolve(tmpdir(), "diplomachain-pki-test-"));
const controls = {};
let server;
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
  console.log("PASS " + label);
}
async function rejects(label, action, code) {
  await assert.rejects(action, (error) => error.code === code, label);
  checks++;
  console.log("PASS " + label);
}
function reset() {
  for (const key of Object.keys(controls)) delete controls[key];
}
try {
  server = await startDemoAfterSetup();
  const service = new PkiService();
  const campus = pemCertificates(
    await readFile(process.env.PDF_ORG2_CERT_PATH, "utf8"),
  )[0];
  const headquarters = pemCertificates(
    await readFile(process.env.PDF_ORG1_CERT_PATH, "utf8"),
  )[0];
  const authority = pemCertificates(
    await readFile(resolve(directory, "TSA-cert.pem"), "utf8"),
  )[0];
  const good = await service.checkCertificate(campus);
  check("CA path and signed OCSP GOOD", good.revocation[0].method === "OCSP");
  controls.delegatedOcsp = true;
  check(
    "delegated OCSP responder is authorized and checked against CRL",
    (await service.checkCertificate(campus)).revocation[0].method === "OCSP",
  );
  controls.revoked = { OCSP: new Date(Date.now() - 1000).toISOString() };
  await rejects(
    "revoked delegated responder cannot assert GOOD",
    () => service.checkCertificate(campus),
    "REVOKED",
  );
  reset();
  controls.failOcsp = true;
  check(
    "OCSP outage falls back to signed CRL",
    (await service.checkCertificate(campus)).revocation[0].method === "CRL",
  );
  controls.revoked = { ORG2: new Date(Date.now() - 1000).toISOString() };
  await rejects(
    "CRL revocation blocks signing",
    () => service.checkCertificate(campus),
    "REVOKED",
  );
  reset();
  controls.revoked = { ORG2: new Date(Date.now() - 1000).toISOString() };
  await rejects(
    "OCSP revocation cannot be overridden by fallback",
    () => service.checkCertificate(campus),
    "REVOKED",
  );
  reset();
  controls.unknown = ["ORG2"];
  await rejects(
    "OCSP unknown is not treated as good",
    () => service.checkCertificate(campus),
    "UNKNOWN",
  );
  reset();
  controls.failOcsp = true;
  controls.failCrl = true;
  await rejects(
    "both revocation sources unavailable fail closed",
    () => service.checkCertificate(campus),
    "UNAVAILABLE",
  );
  reset();
  controls.tamperOcsp = true;
  controls.failCrl = true;
  await rejects(
    "tampered OCSP signature is rejected",
    () => service.checkCertificate(campus),
    "INVALID",
  );
  reset();
  controls.noNextUpdate = true;
  controls.failCrl = true;
  await rejects(
    "OCSP without nextUpdate is rejected",
    () => service.checkCertificate(campus),
    "STALE",
  );
  reset();
  const originalNow = Date.now;
  try {
    Date.now = () => originalNow() + 7200000;
    await rejects(
      "expired OCSP and CRL are rejected",
      () => service.checkCertificate(campus),
      "STALE",
    );
  } finally {
    Date.now = originalNow;
  }
  const originalTrust = process.env.PDF_PKI_TRUST_BUNDLE_PATH;
  process.env.PDF_PKI_TRUST_BUNDLE_PATH = process.env.PDF_ORG1_CERT_PATH;
  await rejects(
    "wrong CA trust anchor rejected",
    () => service.checkCertificate(campus),
    "INVALID",
  );
  process.env.PDF_PKI_TRUST_BUNDLE_PATH = originalTrust;
  const digest = randomBytes(32);
  const token = await service.timestampAuthority().timestamp(digest, "SHA-256");
  const tokenPath = resolve(directory, "verified-timestamp.der");
  await writeFile(tokenPath, token);
  const openssl =
    process.env.OPENSSL_PATH ||
    (process.platform === "win32"
      ? "C:/Program Files/Git/usr/bin/openssl.exe"
      : "openssl");
  const independent = await promisify(execFile)(
    openssl,
    [
      "ts",
      "-verify",
      "-token_in",
      "-in",
      tokenPath,
      "-digest",
      digest.toString("hex"),
      "-CAfile",
      process.env.PDF_PKI_TRUST_BUNDLE_PATH,
    ],
    { windowsHide: true, timeout: 10000 },
  );
  check(
    "timestamp independently verified by OpenSSL",
    independent.stdout.includes("Verification: OK"),
  );
  const evidence = await service.validateTimestamp(token, digest);
  check(
    "real OpenSSL RFC3161 token and TSA revocation verified",
    evidence.valid && evidence.revocation[0].method === "OCSP",
  );
  check(
    "token hash is reproducible",
    evidence.tokenSha256 === createHash("sha256").update(token).digest("hex"),
  );
  await rejects(
    "timestamp message imprint mismatch",
    () => service.validateTimestamp(token, randomBytes(32)),
    "INVALID",
  );
  await rejects(
    "timestamp nonce mismatch",
    () =>
      service.validateTimestamp(
        token,
        digest,
        new asn1js.Integer({ value: 1 }),
      ),
    "INVALID",
  );
  await rejects(
    "timestamp predating the request is rejected",
    () =>
      service.validateTimestamp(
        token,
        digest,
        undefined,
        new Date(Date.now() + 120000),
      ),
    "INVALID",
  );
  const changed = Buffer.from(token);
  changed[changed.length - 30] ^= 1;
  await rejects(
    "tampered TSA signature rejected",
    () => service.validateTimestamp(changed, digest),
    "INVALID",
  );
  const content = ContentInfo.fromBER(token);
  const signed = new SignedData({ schema: content.content });
  signed.certificates = [
    headquarters,
    ...signed.certificates.filter(
      (certificate) =>
        !certificate.serialNumber.isEqual(authority.serialNumber),
    ),
  ];
  signed.signerInfos[0].sid.issuer = headquarters.issuer;
  signed.signerInfos[0].sid.serialNumber = headquarters.serialNumber;
  const wrongEku = new ContentInfo({
    contentType: content.contentType,
    content: signed.toSchema(),
  })
    .toSchema()
    .toBER(false);
  await rejects(
    "ordinary signing certificate cannot act as TSA",
    () => service.validateTimestamp(new Uint8Array(wrongEku), digest),
    "INVALID",
  );
  const info = TSTInfo.fromBER(
    new SignedData({
      schema: ContentInfo.fromBER(token).content,
    }).encapContentInfo.eContent.getValue(),
  );
  check(
    "TSA time is present and recent",
    Math.abs(Date.now() - info.genTime.getTime()) < 60000,
  );
  controls.failTsa = true;
  await rejects(
    "TSA outage fails closed",
    () => service.timestampAuthority().timestamp(digest, "SHA-256"),
    "UNAVAILABLE",
  );
  reset();
  controls.tamperTsa = true;
  await rejects(
    "tampered TSA response fails before embedding",
    () => service.timestampAuthority().timestamp(digest, "SHA-256"),
    "INVALID",
  );
  reset();
  controls.revoked = { TSA: new Date(Date.now() - 1000).toISOString() };
  await rejects(
    "revoked TSA certificate rejected",
    () => service.validateTimestamp(token, digest),
    "REVOKED",
  );
  reset();
  const signer = await demoSigner(
    process.env.PDF_ORG2_CERT_PATH,
    process.env.PDF_ORG2_KEY_PATH,
    process.env.PDF_ORG2_PASSWORD,
  );
  const checker = await demoSigner(
    process.env.PDF_ORG1_CERT_PATH,
    process.env.PDF_ORG1_KEY_PATH,
    process.env.PDF_ORG1_PASSWORD,
  );
  const pdf = await createDiplomaPdf(
    {
      uuid: "pki-test",
      fullName: "Sinh viên kiểm thử PKI",
      mssv: "TEST-PKI",
      major: "CNTT",
      grade: "Giỏi",
      issueDate: "2024-10-15",
      soHieu: "TEST-PKI",
      namTotNghiep: 2024,
      version: 1,
    },
    "http://localhost:3000/verify",
    true,
    "HCM demo",
    true,
  );
  const first = await signPdf(pdf, signer, 1, "HCM demo", service);
  const final = await signPdf(first.bytes, checker, 2, "Hà Nội demo", service);
  const signatures = await inspectPdfSignatures(final.bytes, service);
  check(
    "two sequential PDF signatures contain valid RFC3161 tokens",
    signatures.length === 2 &&
      signatures.every(
        (signature) =>
          signature.cryptographicallyValid && signature.pkiStatus === "VALID",
      ),
  );
  controls.revoked = { ORG2: new Date(Date.now() - 1000).toISOString() };
  const revoked = await inspectPdfSignatures(final.bytes, service);
  check(
    "later certificate revocation invalidates public PKI verification",
    revoked[0].pkiStatus === "REVOKED",
  );
  reset();
  controls.failOcsp = true;
  controls.failCrl = true;
  check(
    "offline verification is not falsely marked valid",
    (await inspectPdfSignatures(final.bytes, service)).every(
      (signature) => signature.pkiStatus === "UNAVAILABLE",
    ),
  );
  reset();
  const legacy = await signPdf(pdf, signer, 1, "Legacy");
  check(
    "old B-B PDF remains readable without claiming TSA",
    (await inspectPdfSignatures(legacy.bytes))[0].cryptographicallyValid,
  );
  check(
    "old B-B cannot silently pass B-T validation",
    (await inspectPdfSignatures(legacy.bytes, service))[0].pkiStatus ===
      "INVALID",
  );
} finally {
  if (server) await new Promise((resolveServer) => server.close(resolveServer));
  process.env = environment;
  const scoped = relative(resolve(tmpdir()), resolve(directory));
  assert(scoped && !scoped.startsWith("..") && !isAbsolute(scoped));
  await rm(directory, { recursive: true, force: true });
}
console.log(
  "PKI integration checks passed: " +
    checks +
    ". Isolated CA fixtures removed; database and blockchain untouched.",
);

async function startDemoAfterSetup() {
  Object.assign(process.env, await setupDemoPki(directory, 3319));
  process.env.NODE_ENV = "test";
  return startDemoPki(directory, 3319, controls);
}
