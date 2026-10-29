import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { tsImport } from "tsx/esm/api";

const root = new URL("../", import.meta.url);
const config = JSON.parse(
  await readFile(new URL("test/cases.json", root), "utf8"),
);
const options = {
  parentURL: import.meta.url,
  tsconfig: fileURLToPath(new URL("apps/api/tsconfig.json", root)),
};
const { parseRegistryWorkbook, registryIssuesRequireReview } = await tsImport(
  "../apps/api/src/imports/registry-parser.ts",
  options,
);
const { storedNumberIssues } = await tsImport(
  "../apps/api/src/imports/registry-duplicate-data.ts",
  options,
);
const { lookupText } = await tsImport(
  "../apps/api/src/database/data-utils.ts",
  options,
);
const programs = new Map(
  config.programs.map((item) => [lookupText(item.name), item.id]),
);
const namesEn = new Map(config.programs.map((item) => [item.id, item.nameEn]));
const parsedCases = new Map();
const workbooks = new Map();
let checks = 0;
let records = 0;
function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  checks++;
}
function expectedIdentifier(testCase, index, column) {
  const mutation = testCase.mutations.find(
    ([row, field]) => row === index && field === column,
  );
  if (mutation) {
    const value = mutation[2];
    if (value && typeof value === "object") {
      const source = value.fromCase
        ? config.cases.find((item) => item.id === value.fromCase)
        : testCase;
      assert(source, "Referenced fixture must exist");
      return expectedIdentifier(source, value.fromRow, value.column);
    }
    return value;
  }
  const caseNo = String(testCase.caseNumber).padStart(2, "0");
  const recordNo = String(index + 1).padStart(3, "0");
  if (column === "B") return "99" + caseNo + String(index + 1).padStart(6, "0");
  if (column === "O") return "TEST/" + caseNo + "/" + recordNo;
  return "TEST-" + caseNo + "-" + recordNo;
}

for (const testCase of config.cases) {
  equal([2, 3].includes(testCase.rowCount), true, testCase.id + ": small file");
  equal(
    testCase.file,
    testCase.id + ".xlsx",
    testCase.id + ": safe local filename",
  );
  let buffer;
  try {
    buffer = await readFile(new URL("test/" + testCase.file, root));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    throw new Error(
      "Missing local fixture: test/" +
        testCase.file +
        ". See test/README.md; private Excel files are not published to Git.",
    );
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  equal(workbook.worksheets.length, 1, testCase.id + ": one worksheet");
  const sheet = workbook.worksheets[0];
  equal(sheet.name, config.sheetName, testCase.id + ": supported sheet name");
  equal(
    sheet.rowCount,
    testCase.rowCount + 1,
    testCase.id + ": header and data rows",
  );
  equal(sheet.columnCount, 28, testCase.id + ": compact source columns");
  sheet.eachRow((row) =>
    row.eachCell((cell) => {
      equal(
        cell.type === ExcelJS.ValueType.Formula ||
          cell.type === ExcelJS.ValueType.Error,
        false,
        testCase.id + ": no formulas or Excel errors at " + cell.address,
      );
    }),
  );
  for (let index = 0; index < testCase.rowCount; index++) {
    for (const column of ["B", "O", "P"]) {
      const cell = sheet.getCell(column + (index + 2));
      equal(
        cell.value,
        expectedIdentifier(testCase, index, column),
        testCase.id + ": isolated identifier at " + cell.address,
      );
      equal(
        typeof cell.value,
        "string",
        testCase.id + ": identifier kept as text",
      );
    }
    for (const column of ["E", "R", "T"]) {
      const cell = sheet.getCell(column + (index + 2));
      if (cell.value !== null)
        equal(
          cell.value instanceof Date,
          true,
          testCase.id + ": typed date at " + cell.address,
        );
    }
  }
  const rows = await parseRegistryWorkbook(buffer, programs, namesEn);
  equal(rows.length, testCase.rowCount, testCase.id + ": parser record count");
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index];
    equal(row.rowNumber, index + 2, testCase.id + ": Excel row location");
    equal(row.sheetName, config.sheetName, testCase.id + ": parsed sheet");
    equal(
      row.issues.map((issue) => issue.code).sort(),
      [...testCase.expectedCodes[index]].sort(),
      testCase.id + ": exact issues at row " + row.rowNumber,
    );
    equal(
      registryIssuesRequireReview(row.issues),
      testCase.expectedCodes[index].length > 0,
      testCase.id + ": review state",
    );
    for (const issue of row.issues.filter((item) =>
      [
        "REPEATED_STUDENT_CODE",
        "DUPLICATE_CERTIFICATE_NO",
        "DUPLICATE_REGISTRY_NO",
      ].includes(item.code),
    )) {
      const peer = index === 0 ? 3 : 2;
      equal(
        issue.message.includes("sheet 2025, dòng " + peer),
        true,
        testCase.id + ": duplicate points to peer row",
      );
    }
  }
  parsedCases.set(testCase.id, rows);
  workbooks.set(testCase.id, workbook);
  records += rows.length;
  console.log("PASS " + testCase.id + " (" + rows.length + " records)");
}

for (const testCase of config.cases.filter(
  (item) => item.databasePrerequisite,
)) {
  const baseline = parsedCases.get(testCase.databasePrerequisite);
  assert(baseline, "Database prerequisite fixture must be parsed first");
  const stored = baseline.map((row, index) => ({
    id: "manual-stored-" + index,
    campusId: "manual-campus",
    certificateNo: row.normalizedData.certificateNo,
    registryNo: row.normalizedData.registryNo,
    graduation: { sourceRowId: "manual-source-" + index },
  }));
  parsedCases.get(testCase.id).forEach((row, index) => {
    equal(
      storedNumberIssues(row.normalizedData, undefined, stored)
        .map((issue) => issue.code)
        .sort(),
      [...testCase.expectedStoredCodes[index]].sort(),
      testCase.id + ": stored-number issues in memory at row " + row.rowNumber,
    );
    equal(
      storedNumberIssues(row.normalizedData, undefined, []),
      [],
      testCase.id + ": no stored duplicate without prerequisite",
    );
  });
}

equal(workbooks.size, 16, "all requested scenario files");
equal(records, 41, "total local fixture records");
console.log(
  "Manual fixtures: " +
    checks +
    " checks passed, " +
    workbooks.size +
    " files, " +
    records +
    " records. No DB or blockchain writes.",
);
