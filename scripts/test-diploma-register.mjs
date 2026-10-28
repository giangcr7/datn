import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import XLSX from "xlsx";

const helpers = await tsImport("../apps/web/src/lib/diploma-register.ts", {
  parentURL: import.meta.url,
  tsconfig: fileURLToPath(
    new URL("../apps/web/tsconfig.json", import.meta.url),
  ),
});
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
const filters = {
  ...helpers.emptyRegisterFilters("  Nguyễn Văn An  "),
  year: "2024",
  major: "Kỹ thuật xây dựng",
  decision: "123/QĐ-ĐHTL",
  status: "REVOKED",
  issuedFrom: "2024-01-01",
  issuedTo: "2024-12-31",
};
const params = helpers.registerParams(filters, 2, 100);
for (const [key, value] of Object.entries(filters))
  check(
    "preserves the applied filter " + key,
    params.get(key) === value.trim(),
  );
check(
  "preserves pagination",
  params.get("page") === "2" && params.get("limit") === "100",
);
check(
  "omits empty values",
  helpers.registerParams(helpers.emptyRegisterFilters()).toString() ===
    "page=1&limit=20",
);
check(
  "labels business statuses",
  helpers.describeRegisterFilters(filters).includes("Đã thu hồi"),
);
check(
  "formats dates without timezone shifts",
  helpers.registerDate("2024-01-01") === "01/01/2024",
);
check("preserves missing dates", helpers.registerDate(null) === "");
const entry = {
  uuid: "not-exported",
  mssv: "0012345678",
  fullName: '=HYPERLINK("untrusted")',
  dob: "2002-01-01",
  major: "Kỹ thuật xây dựng",
  gpa: 0,
  grade: "Khá",
  className: "64XD",
  namTotNghiep: 2024,
  soHieu: "00123",
  soVaoSo: "000456",
  issueDate: "2024-06-20",
  decisionNo: "123/QĐ-ĐHTL",
  decisionDate: "2024-06-15",
  status: "REVOKED",
  revokedReason: "Đối soát hồ sơ",
  revokedAt: "2024-06-21T00:00:00Z",
};
const rows = helpers.registerSheetRows(
  [entry],
  filters,
  new Date("2026-10-27T00:00:00Z"),
);
const headers = rows[5];
const row = rows[6];
const value = (name) => row[headers.indexOf(name)];
check("exports the registry number", value("Số vào sổ") === "000456");
check("preserves leading zero student IDs", value("MSSV") === "0012345678");
check("preserves numeric zero GPA", value("GPA") === 0);
check(
  "exports decision information",
  value("Số quyết định tốt nghiệp") === entry.decisionNo &&
    value("Ngày quyết định") === "15/06/2024",
);
check(
  "exports localized status and revocation",
  value("Trạng thái") === "Đã thu hồi" &&
    value("Lý do thu hồi") === entry.revokedReason,
);
check(
  "exports applied filters and count",
  rows[2][1] === helpers.describeRegisterFilters(filters) && rows[3][1] === 1,
);
check(
  "omits technical identifiers and proofs",
  !JSON.stringify(rows).includes(entry.uuid) && !headers.includes("UUID"),
);
const sheet = XLSX.utils.aoa_to_sheet(rows);
const book = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(book, sheet, "SoVanBang");
const restored = XLSX.read(
  XLSX.write(book, { bookType: "xlsx", type: "buffer" }),
  { type: "buffer" },
).Sheets.SoVanBang;
check(
  "writes a real XLSX workbook",
  restored.C7.v === "0012345678" && restored.K7.v === "000456",
);
check(
  "untrusted values remain text, not spreadsheet formulas",
  restored.B7.t === "s" && !restored.B7.f && restored.B7.v === entry.fullName,
);
const emptyRows = helpers.registerSheetRows(
  [{ uuid: "empty", status: "ON_CHAIN" }],
  helpers.emptyRegisterFilters(),
);
check(
  "handles missing historical fields without fabricated dates",
  emptyRows[6][3] === "" && emptyRows[6][11] === "" && emptyRows[6][13] === "",
);
console.log("Diploma register/export checks passed: " + checks);
