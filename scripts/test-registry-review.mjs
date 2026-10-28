import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(
  new URL("../apps/web/src/lib/registry-review.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
  },
});
const { openRegistryIssues, registryBatchSummaryText, registryIssueText } =
  await import(
    "data:text/javascript;base64," +
      Buffer.from(compiled.outputText).toString("base64")
  );

assert.equal(
  registryIssueText({ code: "NOT_YET_ISSUED", message: "Original message" }),
  "Thiếu số hiệu và số vào sổ — cần bổ sung trước khi lưu",
);
assert.equal(
  registryIssueText({
    code: "MISSING_ISSUE_DATE",
    message: "Cần xác nhận ngày cấp",
  }),
  "Cần xác nhận ngày cấp",
);
assert.equal(
  registryIssueText({
    code: "NEW_CODE",
    message: "  Thông tin cần kiểm tra  ",
  }),
  "Thông tin cần kiểm tra",
);
for (const message of [undefined, null, "", "  "]) {
  assert.equal(
    registryIssueText({ code: "INTERNAL_CODE", message }),
    "Cần kiểm tra lại thông tin hồ sơ",
  );
}
const open = { code: "NOT_YET_ISSUED", resolvedAt: null };
assert.equal(
  registryIssueText({ code: "ISSUE_DATE_NOT_IN_SOURCE" }),
  "Thiếu ngày cấp trên bằng — bổ sung tại bước kiểm tra dữ liệu",
);
const resolved = { code: "INVALID_NAME", resolvedAt: "2026-10-24T00:00:00Z" };
const issues = [open, resolved];
assert.deepEqual(openRegistryIssues(issues), [open]);
assert.deepEqual(issues, [open, resolved]);
assert.deepEqual(openRegistryIssues(), []);
assert.deepEqual(openRegistryIssues(null), []);
assert.deepEqual(openRegistryIssues([]), []);
assert.equal(
  registryBatchSummaryText({
    readyRows: 0,
    needsReviewRows: 1671,
    importedRows: 284,
    graduationOnlyRows: 284,
    draftRows: 0,
  }),
  "Đã lưu 284 hồ sơ: 284 hồ sơ chỉ có thông tin tốt nghiệp; 0 hồ sơ có văn bằng nháp chưa gửi. Còn 1671 dòng cần rà soát, 0 dòng hợp lệ chờ lưu.",
);
console.log(
  "PASS: 14 registry review display checks; no database writes or output files.",
);
