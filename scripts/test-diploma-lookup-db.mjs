import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { config } from "dotenv";
import { tsImport } from "tsx/esm/api";

config({ path: new URL("../apps/api/.env", import.meta.url), quiet: true });
assert(
  process.env.DATABASE_URL,
  "DATABASE_URL is required for the rollback-only SQL regression test",
);
const options = {
  parentURL: import.meta.url,
  tsconfig: fileURLToPath(
    new URL("../apps/api/tsconfig.json", import.meta.url),
  ),
};
const require = createRequire(import.meta.url);
const {
  DatabaseService,
} = require("../apps/api/dist/database/database.service.js");
const { diplomaLookupQuery } = await tsImport(
  "../apps/api/src/cert/diploma-lookup.ts",
  options,
);
const { Prisma } = require("../apps/api/dist/generated/prisma/client.js");
const database = new DatabaseService({
  getOrThrow: () => process.env.DATABASE_URL,
});
const rollback = new Error("ROLLBACK_LOOKUP_TEMPORARY_TABLES");
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
const input = {
  fullName: "Nguyễn Văn Đức",
  dob: "2001-02-28",
  mssv: "0012345678",
  className: "64CNTT",
  major: "Công nghệ thông tin",
  degreeType: "BACHELOR",
  namTotNghiep: 2025,
  grade: "Khá",
  gpa: 3.25,
  soHieu: "TLU.001",
  soVaoSo: "2025/001",
  issueDate: "2025-07-15",
  decisionNo: "123/QĐ-ĐHTL",
  decisionDate: "2025-06-15",
};
try {
  await database.$transaction(
    async (transaction) => {
      const definitions = [
        "diplomas (id text, created_at timestamp, graduation_id text, certificate_no text, registry_no text, issued_on date, workflow_status text, status text)",
        "graduation_records (id text, student_id text, program_id text, enrollment_id text, decision_id text, degree_type text, graduation_year integer, classification text, gpa numeric)",
        "students (id text, student_code text, full_name text, date_of_birth date)",
        "programs (id text, name text)",
        "enrollments (id text, class_id text)",
        "academic_classes (id text, code text)",
        "graduation_decisions (id text, document_number text, signed_on date)",
        "diploma_versions (id text, diploma_id text, version integer, payload jsonb)",
        "blockchain_anchors (version_id text, event_type text, status text)",
      ];
      for (const definition of definitions)
        await transaction.$executeRaw(
          Prisma.raw("CREATE TEMP TABLE " + definition + " ON COMMIT DROP"),
        );
      await transaction.$executeRaw`INSERT INTO pg_temp.programs VALUES ('program', 'Tên ngành hiện tại đã đổi')`;
      await transaction.$executeRaw`INSERT INTO pg_temp.academic_classes VALUES ('class', 'CURRENT-CLASS')`;
      await transaction.$executeRaw`INSERT INTO pg_temp.enrollments VALUES ('enrollment', 'class')`;
      await transaction.$executeRaw`INSERT INTO pg_temp.graduation_decisions VALUES ('decision', 'CURRENT-DECISION', '2020-01-01')`;
      let sequence = 0;
      async function fixture({
        status = "ACTIVE",
        workflow = "APPROVED",
        committed = true,
        payload = input,
        latestUncommitted = false,
      } = {}) {
        const id = "lookup-test-" + ++sequence;
        await transaction.$executeRaw`INSERT INTO pg_temp.students VALUES (${id}, ${"CURRENT-" + id}, 'Họ tên hiện tại đã đổi', '1999-01-01')`;
        await transaction.$executeRaw`INSERT INTO pg_temp.graduation_records VALUES (${id}, ${id}, 'program', 'enrollment', 'decision', 'MASTER', 2020, 'AVERAGE', 7.5)`;
        await transaction.$executeRaw`INSERT INTO pg_temp.diplomas VALUES (${id}, '2025-01-01', ${id}, ${"CURRENT-CERT-" + id}, ${"CURRENT-REG-" + id}, '2020-01-01', ${workflow}, ${status})`;
        await transaction.$executeRaw`INSERT INTO pg_temp.diploma_versions VALUES (${id}, ${id}, 1, ${JSON.stringify(payload)}::jsonb)`;
        if (committed)
          await transaction.$executeRaw`INSERT INTO pg_temp.blockchain_anchors VALUES (${id}, 'ISSUE', 'COMMITTED')`;
        if (latestUncommitted)
          await transaction.$executeRaw`INSERT INTO pg_temp.diploma_versions VALUES (${id + "-latest"}, ${id}, 2, ${JSON.stringify(payload)}::jsonb)`;
        return id;
      }
      const active = await fixture();
      const revoked = await fixture({ status: "REVOKED" });
      const replaced = await fixture({ status: "SUPERSEDED" });
      await fixture({ workflow: "DRAFT" });
      await fixture({ workflow: "REQUESTED" });
      await fixture({ workflow: "REJECTED" });
      await fixture({ committed: false });
      await fixture({ latestUncommitted: true });
      const search = async (query) =>
        (await transaction.$queryRaw(diplomaLookupQuery(query))).map(
          (row) => row.id,
        );
      const minimal = {
        fullName: input.fullName,
        dob: input.dob,
        mssv: input.mssv,
      };
      const expected = [active, revoked, replaced].sort();
      check(
        "all 14 filters execute against PostgreSQL",
        JSON.stringify((await search(input)).sort()) ===
          JSON.stringify(expected),
      );
      for (const identifier of ["mssv", "soHieu", "soVaoSo"])
        check(
          "exact identifier lookup: " + identifier,
          JSON.stringify(
            (
              await search({
                fullName: input.fullName,
                dob: input.dob,
                [identifier]: input[identifier],
              })
            ).sort(),
          ) === JSON.stringify(expected),
        );
      check(
        "Vietnamese names work without accents or case sensitivity",
        (await search({ ...minimal, fullName: "  NGUYEN   VAN DUC  " }))
          .length === 3,
      );
      check(
        "Vietnamese program names work without accents",
        (await search({ ...minimal, major: "CONG NGHE THONG TIN" })).length ===
          3,
      );
      check(
        "partial names do not open the directory",
        (await search({ ...minimal, fullName: "Nguyễn Văn" })).length === 0,
      );
      check(
        "wrong birth date does not reveal matches",
        (await search({ ...minimal, dob: "2001-02-27" })).length === 0,
      );
      for (const [field, value] of [
        ["mssv", "12345678"],
        ["className", "OTHER-CLASS"],
        ["major", "Ngành khác"],
        ["degreeType", "MASTER"],
        ["namTotNghiep", 2024],
        ["grade", "Giỏi"],
        ["gpa", 3.26],
        ["soHieu", "OTHER-CERT"],
        ["soVaoSo", "OTHER-REG"],
        ["issueDate", "2025-07-14"],
        ["decisionNo", "OTHER-DECISION"],
        ["decisionDate", "2025-06-14"],
      ])
        check(
          "mismatched optional criteria narrow results: " + field,
          (await search({ ...input, [field]: value })).length === 0,
        );
      for (const value of ["%", "_", "TLU%_'; DROP TABLE diplomas;--"])
        check(
          "SQL and wildcard input stays literal",
          (await search({ ...minimal, soHieu: value })).length === 0,
        );
      check(
        "signed snapshot wins over edited student/program values",
        (await search({ ...minimal, fullName: "Họ tên hiện tại đã đổi" }))
          .length === 0,
      );
      const zero = await fixture({
        payload: { ...input, mssv: "ZERO-GPA", gpa: 0 },
      });
      check(
        "zero GPA is not omitted",
        JSON.stringify(
          await search({ ...minimal, mssv: "ZERO-GPA", gpa: 0 }),
        ) === JSON.stringify([zero]),
      );
      const legacy = await fixture({ payload: {} });
      check(
        "legacy snapshots can fall back to recorded source fields",
        JSON.stringify(
          await search({
            fullName: "Họ tên hiện tại đã đổi",
            dob: "1999-01-01",
            mssv: "CURRENT-" + legacy,
          }),
        ) === JSON.stringify([legacy]),
      );
      const newer = await fixture({ payload: { ...input, mssv: "NEWEST" } });
      await transaction.$executeRaw`INSERT INTO pg_temp.diploma_versions VALUES (${newer + "-new"}, ${newer}, 2, ${JSON.stringify({ ...input, mssv: "CORRECTED", fullName: "Nguyễn Thị An" })}::jsonb)`;
      await transaction.$executeRaw`INSERT INTO pg_temp.blockchain_anchors VALUES (${newer + "-new"}, 'ISSUE', 'COMMITTED')`;
      check(
        "old versions do not produce a misleading result",
        (await search({ ...minimal, mssv: "NEWEST" })).length === 0,
      );
      check(
        "replacement snapshots are searchable by corrected identity",
        JSON.stringify(
          await search({
            fullName: "Nguyen Thi An",
            dob: input.dob,
            mssv: "CORRECTED",
          }),
        ) === JSON.stringify([newer]),
      );
      const duplicateCode = "BOUNDED";
      for (let count = 0; count < 21; count++)
        await fixture({ payload: { ...input, mssv: duplicateCode } });
      check(
        "public result size is bounded",
        (await search({ ...minimal, mssv: duplicateCode })).length === 20,
      );
      throw rollback;
    },
    { timeout: 60000 },
  );
} catch (error) {
  if (error !== rollback) throw error;
} finally {
  await database.$disconnect();
}
console.log(
  "Diploma lookup PostgreSQL checks passed: " +
    checks +
    ". Temporary tables rolled back; no business records, PDFs or ledger writes.",
);
