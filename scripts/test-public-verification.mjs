import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { tsImport } from "tsx/esm/api";

const options = {
  parentURL: import.meta.url,
  tsconfig: fileURLToPath(
    new URL("../apps/web/tsconfig.json", import.meta.url),
  ),
};
const { parseDiplomaQr } = await tsImport(
  "../apps/web/src/lib/public-verification.ts",
  options,
);
const { default: VerificationResult } = await tsImport(
  "../apps/web/src/components/DiplomaVerificationResult.tsx",
  options,
);
const uuid = "cc420763-b732-4433-be64-b0417d5a3d80";
const hash = "a".repeat(64);
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
for (const input of [
  JSON.stringify({ uuid }),
  JSON.stringify({ certUUID: uuid }),
  "http://localhost:3000/verify?proof=" +
    encodeURIComponent(JSON.stringify({ uuid })),
  uuid,
])
  check(
    "QR input preserves the diploma identifier",
    parseDiplomaQr(input)?.uuid === uuid,
  );
check(
  "legacy hash QR is still supported",
  parseDiplomaQr(hash)?.certHash === hash,
);
const fullProof = { uuid, fullName: "Nguyễn Văn An", issueDate: "2024-10-15" };
check(
  "numeric legacy hashes are not mistaken for JSON numbers",
  parseDiplomaQr("1".repeat(64))?.certHash === "1".repeat(64),
);
check(
  "full QR evidence is preserved for backend comparison",
  JSON.stringify(parseDiplomaQr(JSON.stringify(fullProof))) ===
    JSON.stringify(fullProof),
);
for (const input of [
  "",
  "null",
  "[]",
  "{}",
  "not a diploma",
  '{"uuid":"wrong"}',
  "https://example.test/",
])
  check("malformed QR data is rejected", parseDiplomaQr(input) === null);
const verification = {
  isValid: true,
  verificationStatus: "VERIFIED_DEMO",
  message: "Bản DEMO: TSA/OCSP/CRL và hash khớp blockchain",
  details: {
    studentName: "Nguyễn Văn An",
    mssv: "2051060001",
    major: "Công nghệ thông tin",
    degreeType: "BACHELOR",
    grade: "Khá",
    namTotNghiep: 2024,
    soHieu: "TLU.000001",
    soVaoSo: "2024/001",
    issueDate: "2024-10-15",
    printedDiploma: { issuePlace: "Hà Nội" },
    txId: "TX_INTERNAL_ONLY",
    onChainHash: hash,
    issuerMspId: "Org1MSP",
    pdfVerification: {
      signingMode: "demo",
      pkiStatus: "VALID",
      signedPdfHash: hash,
    },
  },
};
function render(result) {
  return renderToStaticMarkup(
    React.createElement(VerificationResult, { verification: result }),
  );
}
const html = render(verification);
for (const text of [
  "VĂN BẰNG HỢP LỆ",
  "Nguyễn Văn An",
  "Công nghệ thông tin",
  "Bằng cử nhân",
  "TLU.000001",
  "2024/001",
  "15/10/2024",
  "Hà Nội",
])
  check("valid result shows diploma information: " + text, html.includes(text));
for (const text of [
  "DEMO",
  "demo",
  "thử nghiệm",
  "TSA",
  "OCSP",
  "CRL",
  "hash",
  "blockchain",
  "TX_INTERNAL_ONLY",
  "Org1MSP",
  hash,
])
  check(
    "valid result hides internal verification details: " + text,
    !html.includes(text),
  );
check(
  "missing issue date is not invented",
  render({
    ...verification,
    details: { ...verification.details, issueDate: null },
  }).includes("Chưa có thông tin"),
);
check(
  "revoked result is not displayed as valid",
  render({
    isValid: false,
    verificationStatus: "REVOKED",
    message: "Văn bằng đã bị thu hồi",
  }).includes("VĂN BẰNG KHÔNG HỢP LỆ"),
);
check(
  "temporarily unavailable service is not a fraudulent diploma claim",
  render({
    isValid: false,
    verificationStatus: "UNAVAILABLE",
    message: "Vui lòng thử lại sau",
  }).includes("CHƯA THỂ XÁC THỰC VĂN BẰNG"),
);
const page = await readFile(
  new URL("../apps/web/src/app/(public)/verify/page.tsx", import.meta.url),
  "utf8",
);
check(
  "manual proof input is removed",
  !/Proof JSON|TextArea|btn-verify|key: ["']proof["']/.test(page),
);
check("PDF verification remains available", page.includes("Xác thực tệp PDF"));
check("QR verification remains available", page.includes("Quét mã QR"));
const studentDashboard = await readFile(
  new URL(
    "../apps/web/src/app/student/dashboard/StudentDashboardClient.tsx",
    import.meta.url,
  ),
  "utf8",
);
check(
  "student sharing no longer generates or displays manual proof codes",
  !/Proof|TextArea|snapshot|dán đoạn mã|Sao chép mã chia sẻ/.test(
    studentDashboard,
  ),
);
check(
  "student sharing keeps QR verification",
  studentDashboard.includes("<QRCode") &&
    studentDashboard.includes("value={verificationUrl}"),
);
check(
  "student sharing copies a verification link instead of proof JSON",
  studentDashboard.includes("clipboard.writeText(verificationUrl)") &&
    studentDashboard.includes("Sao chép liên kết xác thực"),
);
const certificates = await readFile(
  new URL(
    "../apps/web/src/app/(admin)/certificates/CertificatesClient.tsx",
    import.meta.url,
  ),
  "utf8",
);
check(
  "staff no longer offers manual proof copying",
  !/buildProof|key: ["']proof["']|Sao chép dữ liệu xác thực/.test(certificates),
);
check(
  "staff retains QR verification sharing",
  certificates.includes("Mã QR xác thực") &&
    certificates.includes("<QRCode"),
);
console.log("Public verification checks passed: " + checks);
