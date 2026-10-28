import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import pg from "pg";
import { config } from "dotenv";
import { instance } from "@viz-js/viz";
import { Parser } from "@dbml/core";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, "apps/api/.env") });
const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
const output = resolve(root, "docs/database");
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const catalog = [
  "institutions",
  "campuses",
  "programs",
  "program_aliases",
  "academic_classes",
];
const academic = [
  "students",
  "enrollments",
  "graduation_decisions",
  "graduation_records",
  "diplomas",
];
const anchors = [
  "diploma_versions",
  "signed_diploma_documents",
  "diploma_pdf_signatures",
  "diploma_events",
  "blockchain_anchors",
  "outbox_events",
  "integrity_alerts",
];
const imports = [
  "source_documents",
  "import_batches",
  "import_rows",
  "validation_issues",
];
const purposes = {
  institutions: "Trường/đơn vị quản lý",
  campuses: "Cơ sở và mapping MSP",
  programs: "Danh mục ngành",
  program_aliases: "Tên ngành nguồn đã được phê duyệt",
  academic_classes: "Lớp theo cơ sở",
  students: "Hồ sơ người học, độc lập tài khoản",
  enrollments: "Quá trình theo học ngành/cơ sở/lớp",
  graduation_decisions: "Quyết định tốt nghiệp dùng chung",
  graduation_records: "Kết quả tốt nghiệp, kể cả chưa có bằng",
  diplomas: "Văn bằng và vòng đời pháp lý",
  diploma_versions: "Snapshot bất biến đã phê duyệt",
  signed_diploma_documents: "PDF ký số theo phiên bản; khóa lưu trữ và SHA-256",
  diploma_pdf_signatures: "Hai chữ ký cơ sở/trụ sở và chứng thư đã dùng",
  diploma_events: "Lịch sử nghiệp vụ append-only",
  blockchain_anchors: "Index xác nhận commit từ Fabric",
  outbox_events: "Hàng đợi giao dịch nhất quán và retry",
  source_documents: "Metadata file gốc bất biến",
  import_batches: "Đợt nhập có mapping version",
  import_rows: "Dòng nguồn và override đã review",
  validation_issues: "Lỗi/cảnh báo gắn dòng nguồn",
  accounts: "Tài khoản đăng nhập",
  account_memberships: "Quyền theo campus",
  refresh_sessions: "Refresh-token rotation theo family",
  otp_challenges: "Thử thách OTP có giới hạn attempts",
  audit_logs: "Audit append-only",
  integrity_alerts: "Cảnh báo toàn vẹn và giải quyết",
  legacy_id_maps: "Mapping ID cũ; target_id đa hình không phải FK",
};
const normalizeType = (type) =>
  type
    .replaceAll('"', "")
    .replace(/^character varying/, "varchar")
    .replace(/^character/, "char")
    .replace(/timestamp(\(\d+\))? with time zone/, "timestamptz$1")
    .replace(/timestamp(\(\d+\))? without time zone/, "timestamp$1")
    .replace(/^numeric/, "decimal");

await database.connect();
try {
  const columns = (
    await database.query(
      "SELECT t.relname AS table_name, a.attname AS name, format_type(a.atttypid,a.atttypmod) AS type, a.attnotnull AS not_null FROM pg_attribute a JOIN pg_class t ON t.oid=a.attrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relkind='r' AND t.relname <> '_prisma_migrations' AND a.attnum>0 AND NOT a.attisdropped ORDER BY t.relname,a.attnum",
    )
  ).rows;
  const keys = (
    await database.query(
      "SELECT c.conname AS name, c.contype AS kind, child.relname AS child, parent.relname AS parent, ARRAY(SELECT a.attname FROM unnest(c.conkey) WITH ORDINALITY k(attnum,position) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum ORDER BY k.position) AS child_columns, ARRAY(SELECT a.attname FROM unnest(c.confkey) WITH ORDINALITY k(attnum,position) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.attnum ORDER BY k.position) AS parent_columns, pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_class child ON child.oid=c.conrelid LEFT JOIN pg_class parent ON parent.oid=c.confrelid JOIN pg_namespace n ON n.oid=child.relnamespace WHERE n.nspname='public' AND child.relname <> '_prisma_migrations' ORDER BY child.relname,c.conname",
    )
  ).rows;
  const indexes = (
    await database.query(
      "SELECT t.relname AS table_name, i.relname AS name, x.indisunique AS is_unique, x.indisprimary AS is_primary, pg_get_expr(x.indpred,x.indrelid) AS predicate, pg_get_indexdef(x.indexrelid) AS definition, ARRAY(SELECT a.attname FROM unnest(x.indkey) WITH ORDINALITY k(attnum,position) JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum ORDER BY k.position) AS columns FROM pg_index x JOIN pg_class t ON t.oid=x.indrelid JOIN pg_class i ON i.oid=x.indexrelid JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname='public' AND t.relname <> '_prisma_migrations' ORDER BY t.relname,i.relname",
    )
  ).rows;
  const enums = (
    await database.query(
      "SELECT t.typname AS name, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS values FROM pg_type t JOIN pg_enum e ON e.enumtypid=t.oid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' GROUP BY t.typname ORDER BY t.typname",
    )
  ).rows;
  const pgArray = (value) =>
    Array.isArray(value)
      ? value
      : String(value)
          .replace(/^\{|\}$/g, "")
          .split(",")
          .filter(Boolean);
  for (const key of keys) {
    key.child_columns = pgArray(key.child_columns);
    key.parent_columns = pgArray(key.parent_columns);
  }
  for (const index of indexes) index.columns = pgArray(index.columns);
  const tables = [...new Set(columns.map((column) => column.table_name))];
  const fks = keys.filter((key) => key.kind === "f");
  const primary = keys.filter((key) => key.kind === "p");
  const logicalFks = fks.filter((key) => key.child_columns.length === 1);
  let dbml =
    "Project DiplomaChain {\n  database_type: 'PostgreSQL'\n  Note: 'Generated from migrated PostgreSQL catalog. Partial unique, CHECK and trigger details: constraints.md'\n}\n\n";
  for (const enumeration of enums) {
    const values = Array.isArray(enumeration.values)
      ? enumeration.values
      : String(enumeration.values)
          .replace(/^\{|\}$/g, "")
          .split(",");
    dbml +=
      "Enum " +
      enumeration.name +
      " {\n" +
      values.map((value) => "  " + value).join("\n") +
      "\n}\n\n";
  }
  let mermaid = "erDiagram\n";
  for (const table of tables) {
    dbml += "Table " + table + " {\n";
    mermaid += "  " + table.toUpperCase() + " {\n";
    for (const column of columns.filter(
      (column) => column.table_name === table,
    )) {
      const pk = primary.some(
        (key) => key.child === table && key.child_columns.includes(column.name),
      );
      const fk = fks.some(
        (key) => key.child === table && key.child_columns.includes(column.name),
      );
      const unique = indexes.some(
        (index) =>
          index.table_name === table &&
          index.is_unique &&
          !index.is_primary &&
          !index.predicate &&
          index.columns.length === 1 &&
          index.columns[0] === column.name,
      );
      const attributes = [
        pk ? "pk" : unique ? "unique" : "",
        column.not_null && !pk ? "not null" : "",
      ].filter(Boolean);
      dbml +=
        "  " +
        column.name +
        " " +
        normalizeType(column.type) +
        (attributes.length ? " [" + attributes.join(", ") + "]" : "") +
        "\n";
      const mtype = /UUID/.test(column.type.toUpperCase())
        ? "uuid"
        : /JSONB/.test(column.type.toUpperCase())
          ? "jsonb"
          : /INT/.test(column.type.toUpperCase())
            ? "int"
            : /NUMERIC/.test(column.type.toUpperCase())
              ? "decimal"
              : /DATE|TIME/.test(column.type.toUpperCase())
                ? "date"
                : /BOOL/.test(column.type.toUpperCase())
                  ? "boolean"
                  : "string";
      mermaid +=
        (
          "    " +
          mtype +
          " " +
          column.name +
          " " +
          [pk ? "PK" : "", fk ? "FK" : "", unique ? "UK" : ""]
            .filter(Boolean)
            .join(",") +
          (column.not_null ? "" : ' "nullable"')
        ).trimEnd() + "\n";
    }
    const represented = indexes.filter(
      (index) =>
        index.table_name === table &&
        !index.is_primary &&
        !index.predicate &&
        index.columns.length,
    );
    if (represented.length)
      dbml +=
        "  indexes {\n" +
        represented
          .map(
            (index) =>
              "    (" +
              index.columns.join(", ") +
              ") [" +
              [index.is_unique ? "unique" : "", "name: '" + index.name + "'"]
                .filter(Boolean)
                .join(", ") +
              "]",
          )
          .join("\n") +
        "\n  }\n";
    dbml += "}\n\n";
    mermaid += "  }\n";
  }
  for (const fk of fks) {
    const singular = indexes.some(
      (index) =>
        index.table_name === fk.child &&
        index.is_unique &&
        !index.predicate &&
        index.columns.length === fk.child_columns.length &&
        index.columns.every((column) => fk.child_columns.includes(column)),
    );
    dbml +=
      "Ref " +
      fk.name +
      ": " +
      fk.child +
      (fk.child_columns.length === 1
        ? "." + fk.child_columns[0]
        : ".(" + fk.child_columns.join(", ") + ")") +
      (singular ? " - " : " > ") +
      fk.parent +
      (fk.parent_columns.length === 1
        ? "." + fk.parent_columns[0]
        : ".(" + fk.parent_columns.join(", ") + ")") +
      "\n";
  }
  for (const fk of logicalFks) {
    const nullable = !columns.find(
      (column) =>
        column.table_name === fk.child && column.name === fk.child_columns[0],
    ).not_null;
    const singular = indexes.some(
      (index) =>
        index.table_name === fk.child &&
        index.is_unique &&
        !index.predicate &&
        index.columns.length === 1 &&
        index.columns[0] === fk.child_columns[0],
    );
    mermaid +=
      "  " +
      fk.parent.toUpperCase() +
      (nullable ? " |o" : " ||") +
      "--" +
      (singular ? "o|" : "o{") +
      " " +
      fk.child.toUpperCase() +
      " : " +
      fk.child_columns[0] +
      "\n";
  }
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, "erd.dbml"), dbml);
  Parser.parse(dbml, "dbml");
  await writeFile(resolve(output, "erd.mmd"), mermaid);
  let dictionary = await readFile(
    resolve(output, "data-dictionary.md"),
    "utf8",
  );
  dictionary =
    dictionary.split("\n## Physical schema")[0] +
    "\n## Physical schema\n\nSinh từ database đã migrate; PostgreSQL catalog là nguồn của phần này. Nullable không có nghĩa là được tự suy dữ liệu.\n";
  for (const table of tables) {
    dictionary +=
      "\n### " +
      table +
      "\n\n" +
      purposes[table] +
      "\n\n| Cột | Kiểu | Bắt buộc | Khóa |\n|---|---|---|---|\n";
    for (const column of columns.filter(
      (column) => column.table_name === table,
    ))
      dictionary +=
        "| " +
        column.name +
        " | " +
        normalizeType(column.type) +
        " | " +
        (column.not_null ? "Có" : "Không") +
        " | " +
        [
          primary.some(
            (key) =>
              key.child === table && key.child_columns.includes(column.name),
          )
            ? "PK"
            : "",
          fks.some(
            (key) =>
              key.child === table && key.child_columns.includes(column.name),
          )
            ? "FK"
            : "",
        ]
          .filter(Boolean)
          .join(", ") +
        " |\n";
  }
  await writeFile(resolve(output, "data-dictionary.md"), dictionary);
  let constraints =
    "# Ràng buộc vật lý\n\nKhông dùng db push thay migrations: một số CHECK/trigger/partial index không biểu diễn hết trong Prisma/DBML.\n\n";
  for (const key of keys)
    if (["c", "u", "f"].includes(key.kind))
      constraints +=
        "- " + key.child + "." + key.name + ": " + key.definition + "\n";
  constraints += "\n## Index đặc biệt\n\n";
  for (const index of indexes)
    if (index.predicate || index.definition.includes("NULLS NOT DISTINCT"))
      constraints += "- " + index.definition + "\n";
  constraints += "\n## Trigger bảo vệ\n\n";
  const triggers = (
    await database.query(
      "SELECT trigger_name,event_object_table,event_manipulation FROM information_schema.triggers WHERE trigger_schema='public' ORDER BY event_object_table,trigger_name,event_manipulation",
    )
  ).rows;
  for (const trigger of triggers)
    constraints +=
      "- " +
      trigger.event_object_table +
      ": " +
      trigger.trigger_name +
      " (" +
      trigger.event_manipulation +
      ")\n";
  await writeFile(resolve(output, "constraints.md"), constraints);
  const viz = await instance();
  for (const [filename, selected] of [
    ["erd-full.svg", tables],
    ["erd-core.svg", [...catalog, ...academic, ...anchors, ...imports]],
  ]) {
    let dot =
      'digraph DiplomaChain { graph [rankdir=LR,bgcolor="#f8fafc",pad="0.5",nodesep="0.35",ranksep="1.1",splines=polyline]; node [shape=plain,fontname="Arial"]; edge [fontname="Arial",fontsize=9,color="#94a3b8",arrowsize=0.7];\n';
    for (const table of selected) {
      const color = catalog.includes(table)
        ? "#2563eb"
        : academic.includes(table)
          ? "#059669"
          : anchors.includes(table)
            ? "#7c3aed"
            : imports.includes(table)
              ? "#b45309"
              : "#475569";
      const fields = columns.filter((column) => column.table_name === table);
      dot +=
        '"' +
        table +
        '" [label=<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0" CELLPADDING="5" COLOR="#cbd5e1"><TR><TD COLSPAN="2" BGCOLOR="' +
        color +
        '"><FONT COLOR="white"><B>' +
        table +
        "</B></FONT></TD></TR>";
      for (const column of fields) {
        const pk = primary.some(
          (key) =>
            key.child === table && key.child_columns.includes(column.name),
        );
        const fk = fks.some(
          (key) =>
            key.child === table && key.child_columns.includes(column.name),
        );
        dot +=
          '<TR><TD ALIGN="LEFT" BGCOLOR="white"><FONT POINT-SIZE="10">' +
          (pk ? "PK " : fk ? "FK " : "") +
          escape(column.name) +
          (column.not_null ? "" : " ?") +
          '</FONT></TD><TD ALIGN="LEFT" BGCOLOR="white"><FONT POINT-SIZE="9" COLOR="#64748b">' +
          escape(normalizeType(column.type)) +
          "</FONT></TD></TR>";
      }
      dot += "</TABLE>>];\n";
    }
    for (const fk of logicalFks) {
      if (!selected.includes(fk.child) || !selected.includes(fk.parent))
        continue;
      const nullable = !columns.find(
        (column) =>
          column.table_name === fk.child && column.name === fk.child_columns[0],
      ).not_null;
      const singular = indexes.some(
        (index) =>
          index.table_name === fk.child &&
          index.is_unique &&
          !index.predicate &&
          index.columns.length === 1 &&
          index.columns[0] === fk.child_columns[0],
      );
      dot +=
        '"' +
        fk.parent +
        '" -> "' +
        fk.child +
        '" [label="' +
        fk.child_columns[0] +
        '",taillabel="' +
        (nullable ? "0..1" : "1") +
        '",headlabel="' +
        (singular ? "0..1" : "0..N") +
        '",labeldistance=1.5];\n';
    }
    dot += "}";
    await writeFile(
      resolve(output, filename),
      viz.renderString(dot, { format: "svg", engine: "dot" }),
    );
  }
  console.log(
    "Generated and validated ERD: " +
      tables.length +
      " tables, " +
      columns.length +
      " columns, " +
      fks.length +
      " foreign keys.",
  );
} finally {
  await database.end();
}
