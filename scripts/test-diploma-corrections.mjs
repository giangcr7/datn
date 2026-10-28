import assert from "node:assert/strict";
import { tsImport } from "tsx/esm/api";
const { correctionValues, correctionParams, correctionEventLabels } =
  await tsImport("../apps/web/src/lib/diploma-corrections.ts", import.meta.url);
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
const params = correctionParams("DRAFT", "  001234  ", 2, 50);
check(
  "preserves stage and pagination",
  params.get("stage") === "DRAFT" &&
    params.get("page") === "2" &&
    params.get("limit") === "50",
);
check("trims applied search", params.get("search") === "001234");
check(
  "omits blank search",
  !correctionParams("REJECTED", "   ", 1, 20).has("search"),
);
const record = {
  mssv: "0012345678",
  fullName: "Nguyễn Văn A",
  dob: "2000-01-01",
  programId: "program",
  namTotNghiep: 2024,
  grade: "Giỏi",
  gpa: 0,
  degreeType: "ENGINEER",
  className: "K1",
  soHieu: "000VB1",
  soVaoSo: "000001",
  issueDate: "2024-06-01",
  updatedAt: "2026-10-28T00:00:00Z",
  printedDiploma: {
    majorNameEn: "Civil Engineering",
    diplomaSignerName: "Nguyễn Văn B",
  },
};
const values = correctionValues(record);
check(
  "retains certificate and registry leading zeros",
  values.soHieu === "000VB1" && values.soVaoSo === "000001",
);
check("preserves zero GPA", values.gpa === 0);
check(
  "keeps issue date instead of inventing current date",
  values.issueDate === record.issueDate,
);
check(
  "carries expected record revision",
  values.expectedUpdatedAt === record.updatedAt,
);
check(
  "requires new note rather than copying old rejection text",
  values.note === "",
);
check("MSSV is not part of editable values", !Object.hasOwn(values, "mssv"));
for (const event of ["REOPENED", "CORRECTED", "RESUBMITTED"])
  check("history label " + event, !!correctionEventLabels[event]);
console.log("Rejected diploma helper checks passed: " + checks + ".");
