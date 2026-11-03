import assert from "node:assert/strict";
import { writeFile, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, relative, isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tsImport } from "tsx/esm/api";
import ExcelJS from "exceljs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const options = {
  parentURL: import.meta.url,
  tsconfig: fileURLToPath(
    new URL("../apps/api/tsconfig.json", import.meta.url),
  ),
};
const { statisticsDocument, registerDocument } = await tsImport(
  "../apps/api/src/reports/report-document.ts",
  options,
);
const { exportReportXlsx } = await tsImport(
  "../apps/api/src/reports/report-xlsx.ts",
  options,
);
const { exportReportPdf } = await tsImport(
  "../apps/api/src/reports/report-pdf.ts",
  options,
);
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
const metadata = {
  institutionName: "TRƯỜNG ĐẠI HỌC KIỂM THỬ",
  generatedAt: "2026-11-03T02:00:00Z",
  filters: "Năm tốt nghiệp: 2024; Ngành: Kỹ thuật xây dựng",
};
const summary = { total: 3, active: 1, revoked: 1, replaced: 1 };
const summaryDocument = statisticsDocument({
  ...metadata,
  summary,
  byYear: [{ name: "2024", ...summary }],
  byMajor: [{ name: "Kỹ thuật xây dựng", ...summary }],
  byGrade: [{ name: "Khá", ...summary }],
  byStatus: ["ON_CHAIN", "REVOKED", "REPLACED"].map((name, index) => ({
    name,
    total: 1,
    active: Number(index === 0),
    revoked: Number(index === 1),
    replaced: Number(index === 2),
  })),
});
const entries = Array.from({ length: 35 }, (_, index) => ({
  uuid: "internal-id-" + index,
  fullName:
    index === 0 ? '=HYPERLINK("untrusted")' : "Nguyễn Văn Kiểm Thử " + index,
  mssv: "0012345" + String(index).padStart(3, "0"),
  dob: index === 0 ? null : "2001-01-01",
  major: "Kỹ thuật xây dựng công trình giao thông và hạ tầng đô thị",
  className: "K64-XD",
  gpa: index === 0 ? 0 : 2.75,
  grade: "Khá",
  namTotNghiep: 2024,
  soHieu: "000-VB-" + index,
  soVaoSo: "000/VS/" + index,
  issueDate: index === 0 ? null : "2024-06-20",
  decisionNo: "123/QĐ-KT",
  decisionDate: "2024-06-15",
  status: index % 2 ? "REVOKED" : "ON_CHAIN",
  revokedAt: index % 2 ? "2026-11-02T00:00:00Z" : null,
  revokedReason:
    index % 2
      ? "Đối soát theo quyết định thu hồi và kiểm tra hồ sơ nguồn."
      : null,
  version: 1,
  certHash: "0123456789abcdef".repeat(4),
  signedPdfHash: "fedcba9876543210".repeat(4),
  txId: "tx-" + "abcdef0123456789".repeat(4),
}));
entries[1].revokedReason =
  "Lý do thu hồi dài cần được giữ đầy đủ khi chuyển trang. ".repeat(110);
const register = registerDocument(metadata, entries);
const excel = await exportReportXlsx(register);
const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(excel);
const sheet = workbook.getWorksheet("SoPhatHanh"),
  technical = workbook.getWorksheet("DoiChieuBlockchain");
check(
  "all filtered records exported, not a UI page",
  sheet.rowCount === entries.length + 7,
);
check(
  "identifiers remain text with leading zeros",
  sheet.getCell("C8").value === entries[0].mssv &&
    sheet.getCell("K8").value === entries[0].soVaoSo,
);
check(
  "untrusted input stays text, never a formula",
  typeof sheet.getCell("B8").value === "string" &&
    sheet.getCell("B8").value === entries[0].fullName,
);
check("zero GPA is retained", sheet.getCell("G8").value === 0);
check("long text uses a valid Excel row height", sheet.getRow(9).height <= 409);
check(
  "missing historical dates are not invented",
  sheet.getCell("D8").value === "" && sheet.getCell("L8").value === "",
);
check(
  "full hashes and transaction IDs appear on technical sheet",
  technical.getCell("E8").value === entries[0].certHash &&
    technical.getCell("F8").value === entries[0].signedPdfHash &&
    technical.getCell("G8").value === entries[0].txId,
);
check(
  "private internal ID is not exported",
  !JSON.stringify(sheet.getSheetValues()).includes("internal-id-"),
);
check(
  "filters, total and Vietnamese local time are explicit",
  sheet.getCell("B4").value === metadata.filters &&
    sheet.getCell("B5").value === entries.length &&
    sheet.getCell("B3").value.includes("09:00:00"),
);
const summaryExcel = await exportReportXlsx(summaryDocument);
const summaryWorkbook = new ExcelJS.Workbook();
await summaryWorkbook.xlsx.load(summaryExcel);
check(
  "statistics workbook includes all breakdowns",
  summaryWorkbook.worksheets.length === 5,
);
check(
  "summary counts agree across export",
  summaryWorkbook.getWorksheet("TongHop").getCell("B8").value === 3 &&
    summaryWorkbook.getWorksheet("TheoNganh").getCell("C8").value === 1,
);
check(
  "status labels are business language",
  summaryWorkbook.getWorksheet("TheoTrangThai").getCell("A8").value ===
    "Đang hiệu lực",
);
const pdfs = [
  await exportReportPdf(summaryDocument, false),
  await exportReportPdf(register, true),
];
for (const [index, bytes] of pdfs.entries()) {
  const loadingTask = getDocument({
    data: new Uint8Array(bytes),
    useSystemFonts: true,
    disableFontFace: true,
  });
  try {
    const pdf = await loadingTask.promise;
    let text = "";
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      text += content.items.map((item) => item.str || "").join(" ") + "\n";
      check(
        "PDF page footer " + index + ":" + pageNumber,
        content.items.some(
          (item) => item.str === "Trang " + pageNumber + " / " + pdf.numPages,
        ),
      );
      for (const item of content.items.filter((item) => "transform" in item)) {
        check(
          "text stays inside page " + index + ":" + pageNumber,
          item.transform[4] >= 25 &&
            item.transform[5] >= 15 &&
            item.transform[4] + item.width <= page.view[2] - 22 &&
            item.transform[5] <= page.view[3] - 20,
        );
      }
    }
    check(
      "Vietnamese PDF heading is extractable " + index,
      text.includes(metadata.institutionName),
    );
    check(
      "PDF is compact for summary and paginates the register " + index,
      index === 0 ? pdf.numPages === 1 : pdf.numPages > 1,
    );
    if (index === 1) {
      const compact = text.replace(/\s/g, "");
      for (const entry of entries)
        check(
          "PDF retains student ID " + entry.mssv,
          compact.includes(entry.mssv),
        );
      check(
        "PDF retains complete hashes across wrapping",
        compact.includes(entries[0].certHash) &&
          compact.includes(entries[0].txId),
      );
      check(
        "PDF preserves long revocation text over page breaks",
        (text.match(/Lý do thu hồi dài/g) || []).length === 110,
      );
    }
  } finally {
    await loadingTask.destroy();
  }
}
const empty = registerDocument(metadata, []);
const emptyWorkbook = new ExcelJS.Workbook();
await emptyWorkbook.xlsx.load(await exportReportXlsx(empty));
check(
  "empty export still has metadata and headers",
  emptyWorkbook.getWorksheet("SoPhatHanh").rowCount === 7,
);
if (process.env.REPORT_TEST_PREVIEW_DIR) {
  const output = await realpath(resolve(process.env.REPORT_TEST_PREVIEW_DIR));
  const within = relative(await realpath(tmpdir()), output);
  assert(
    within && !within.startsWith("..") && !isAbsolute(within),
    "Preview outputs must be in a task-owned OS temporary directory",
  );
  await Promise.all([
    writeFile(join(output, "statistics.pdf"), pdfs[0]),
    writeFile(join(output, "register.pdf"), pdfs[1]),
    writeFile(join(output, "statistics.xlsx"), summaryExcel),
    writeFile(join(output, "register.xlsx"), excel),
  ]);
}
console.log(
  "Report XLSX/PDF checks passed: " +
    checks +
    ". Synthetic data only; no DB or blockchain writes.",
);
