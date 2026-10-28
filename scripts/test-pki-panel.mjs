import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";

const { default: Panel } = await tsImport(
  "../apps/web/src/components/PdfSignaturesPanel.tsx",
  {
    parentURL: import.meta.url,
    tsconfig: fileURLToPath(
      new URL("../apps/web/tsconfig.json", import.meta.url),
    ),
  },
);
const evidence = {
  method: "OCSP",
  status: "GOOD",
  thisUpdate: "2026-10-22T01:00:00Z",
  nextUpdate: "2026-10-23T01:00:00Z",
  checkedAt: "2026-10-22T02:00:00Z",
};
const signature = {
  fieldName: "CampusApproval",
  signatureOrder: 1,
  organization: "TP.HCM",
  signerName: "Cán bộ demo",
  certificateSerial: "01",
  certificateSha256: "a".repeat(64),
  certificateSubject: "Campus DEMO",
  certificateIssuer: "CA DEMO",
  signedAt: "2026-10-22T02:00:00Z",
  validTo: "2027-10-22T02:00:00Z",
  cryptographicallyValid: true,
  pkiStatus: "VALID",
  pkiEvidence: {
    trustAnchorSha256: "b".repeat(64),
    revocation: [evidence],
    timestamp: {
      time: "2026-10-22T02:00:00Z",
      authority: "TSA DEMO",
      tokenSha256: "c".repeat(64),
      revocation: [evidence],
    },
  },
};
let checks = 0;
function render(verification) {
  return renderToStaticMarkup(React.createElement(Panel, { verification }));
}
function contains(html, text) {
  assert(html.includes(text), "Expected UI text: " + text);
  checks++;
}
const valid = {
  valid: true,
  signingMode: "demo",
  signedPdfHash: "d".repeat(64),
  pkiStatus: "VALID",
  signatures: [signature],
};
const html = render(valid);
for (const text of [
  "Dấu thời gian TSA",
  "CA gốc tin cậy",
  "Kiểm tra thu hồi chứng thư",
  "Thu hồi chứng thư TSA",
  "OCSP",
  "TSA DEMO",
  "DEMO",
])
  contains(html, text);
contains(
  render({
    ...valid,
    valid: false,
    pkiStatus: "UNAVAILABLE",
    signatures: [
      { ...signature, pkiStatus: "UNAVAILABLE", pkiEvidence: undefined },
    ],
  }),
  "chưa đủ bằng chứng",
);
contains(
  render({
    ...valid,
    valid: false,
    pkiStatus: "REVOKED",
    signatures: [
      { ...signature, pkiStatus: "REVOKED", pkiEvidence: undefined },
    ],
  }),
  "Chứng thư đã bị thu hồi",
);
contains(
  render({
    ...valid,
    pkiStatus: "NOT_CHECKED",
    signatures: [
      { ...signature, pkiStatus: undefined, pkiEvidence: undefined },
    ],
  }),
  "Hồ sơ dùng chính sách cũ",
);
contains(render(null), "Chưa có PDF ký số");
console.log("PKI panel render checks passed: " + checks);
