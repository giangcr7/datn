import assert from "node:assert/strict";
import { createWebLoader } from "./lib/web-component-loader.mjs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform } from "lightningcss";
import ts from "typescript";
import { tsImport } from "tsx/esm/api";

const helpers = await tsImport("../apps/web/src/lib/diploma-lookup.ts", {
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
const valid = {
  ...helpers.emptyLookupFields(),
  fullName: "  Nguyễn   Văn Đức  ",
  dob: "2001-02-28",
  mssv: "0012345678",
  className: "64CNTT",
  major: "Công nghệ thông tin",
  degreeType: "BACHELOR",
  namTotNghiep: "2025",
  grade: "Khá",
  gpa: "3,25",
  soHieu: "TLU.001",
  soVaoSo: "2025/001",
  issueDate: "2025-07-15",
  decisionNo: "123/QĐ-ĐHTL",
  decisionDate: "2025-06-15",
};
check(
  "all 14 business fields are present",
  Object.keys(helpers.emptyLookupFields()).length === 14,
);
check(
  "full form is valid",
  Object.keys(helpers.validateLookupFields(valid)).length === 0,
);
for (const identifier of ["mssv", "soHieu", "soVaoSo"]) {
  const fields = {
    ...helpers.emptyLookupFields(),
    fullName: valid.fullName,
    dob: valid.dob,
    [identifier]: valid[identifier],
  };
  check(
    "a single exact identifier is sufficient: " + identifier,
    Object.keys(helpers.validateLookupFields(fields)).length === 0,
  );
  check(
    "empty optional fields are omitted",
    Object.keys(helpers.lookupPayload(fields)).length === 3,
  );
}
for (const [field, value] of [
  ["fullName", ""],
  ["fullName", "a"],
  ["fullName", "a".repeat(256)],
  ["dob", ""],
  ["dob", "2023-02-29"],
  ["dob", "2199-01-01"],
  ["dob", "2001-02-28T00:00:00Z"],
  ["mssv", "1"],
  ["mssv", "001 2345"],
  ["className", "a".repeat(101)],
  ["soHieu", "a".repeat(121)],
  ["soVaoSo", "a".repeat(181)],
  ["major", "a".repeat(256)],
  ["degreeType", "INVALID"],
  ["grade", "INVALID"],
  ["namTotNghiep", "1899"],
  ["namTotNghiep", "2025.5"],
  ["gpa", "-1"],
  ["gpa", "10.01"],
  ["gpa", "3.251"],
  ["issueDate", "2025-02-29"],
  ["decisionDate", "2024-02-30"],
])
  check(
    "invalid field is rejected: " + field + "=" + value,
    Boolean(helpers.validateLookupFields({ ...valid, [field]: value })[field]),
  );
check(
  "name and DOB alone cannot enumerate the directory",
  Boolean(
    helpers.validateLookupFields({
      ...helpers.emptyLookupFields(),
      fullName: valid.fullName,
      dob: valid.dob,
    }).mssv,
  ),
);
const payload = helpers.lookupPayload(valid);
check("normalizes name whitespace", payload.fullName === "Nguyễn Văn Đức");
check("keeps leading zero student identifiers", payload.mssv === "0012345678");
check(
  "converts numeric fields without changing identifiers",
  payload.gpa === 3.25 && payload.namTotNghiep === 2025,
);
check(
  "zero GPA is retained",
  helpers.lookupPayload({ ...valid, gpa: "0" }).gpa === 0,
);
check(
  "leap days remain valid",
  Object.keys(helpers.validateLookupFields({ ...valid, dob: "2000-02-29" }))
    .length === 0,
);
for (const [status, label] of [
  ["ON_CHAIN", "Đã phát hành"],
  ["REVOKED", "Đã thu hồi"],
  ["REPLACED", "Đã được thay thế"],
])
  check(
    "business status " + status,
    helpers.lookupStatus(status).label === label,
  );
check(
  "does not declare unknown status valid",
  helpers.lookupStatus("UNKNOWN").tone !== "success",
);
check(
  "formats dates without a timezone shift",
  helpers.lookupDate("2025-07-15") === "15/07/2025",
);
check(
  "missing issue dates are not fabricated",
  helpers.lookupDate(null) === "Chưa ghi nhận",
);
const result = {
  uuid: "00000000-0000-0000-0000-000000000001",
  fullName: "Nguyễn Văn Đức",
  mssv: valid.mssv,
  soHieu: valid.soHieu,
  status: "ON_CHAIN",
};
const proofUrl = new URL(
  helpers.lookupVerificationHref(result.uuid),
  "http://localhost",
);
check(
  "result links to existing verification flow",
  JSON.parse(proofUrl.searchParams.get("proof")).uuid === result.uuid,
);
const signal = new AbortController().signal;
let captured;
const records = await helpers.requestDiplomaLookup(
  valid,
  signal,
  async (url, options) => {
    captured = { url, options };
    return Response.json({ success: true, results: [result] });
  },
);
check("request returns validated results", records[0].uuid === result.uuid);
check(
  "search sends personal data in a POST body, not a URL",
  captured.url === "/api/search" &&
    captured.options.method === "POST" &&
    !captured.url.includes("?"),
);
check(
  "passes abort signal and bypasses cache",
  captured.options.signal === signal && captured.options.cache === "no-store",
);
check(
  "submits every field",
  Object.keys(JSON.parse(captured.options.body)).length === 14,
);
await assert.rejects(
  () =>
    helpers.requestDiplomaLookup(
      helpers.emptyLookupFields(),
      signal,
      async () => {
        throw new Error("Must not send invalid form");
      },
    ),
  /kiểm tra lại/,
);
checks++;
for (const [response, expected] of [
  [new Response("rate limited", { status: 429 }), /một phút/],
  [
    Response.json({ success: false, error: "Lỗi đầu vào" }, { status: 400 }),
    /Lỗi đầu vào/,
  ],
  [new Response("not JSON", { status: 502 }), /chưa phản hồi đúng/],
  [Response.json({ success: true, results: null }), /chưa đầy đủ/],
  [
    Response.json({ success: true, results: [{ uuid: "only-id" }] }),
    /chưa đầy đủ/,
  ],
]) {
  await assert.rejects(
    () => helpers.requestDiplomaLookup(valid, signal, async () => response),
    expected,
  );
  checks++;
}
await assert.rejects(
  () =>
    helpers.requestDiplomaLookup(valid, signal, async () => {
      throw new Error("private network error");
    }),
  /Không thể kết nối kho/,
);
checks++;
const aborted = new AbortController();
aborted.abort();
await assert.rejects(
  () =>
    helpers.requestDiplomaLookup(valid, aborted.signal, async () => {
      throw new DOMException("Aborted", "AbortError");
    }),
  { name: "AbortError" },
);
checks++;

const require = createRequire(import.meta.url);
function compile(source, dependencies) {
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const target = { exports: {} };
  new Function("require", "module", "exports", compiled.outputText)(
    (specifier) => dependencies[specifier] ?? require(specifier),
    target,
    target.exports,
  );
  return target.exports;
}
const [page, css, route] = await Promise.all([
  readFile(
    new URL("../apps/web/src/app/(public)/search/page.tsx", import.meta.url),
    "utf8",
  ),
  readFile(
    new URL(
      "../apps/web/src/app/(public)/search/page.module.css",
      import.meta.url,
    ),
    "utf8",
  ),
  readFile(
    new URL("../apps/web/src/app/api/search/route.ts", import.meta.url),
    "utf8",
  ),
]);
const styles = transform({
  filename: "page.module.css",
  code: Buffer.from(css),
  cssModules: true,
  errorRecovery: false,
});
check("lookup CSS compiles", styles.warnings.length === 0);
const names = Object.fromEntries(
  Object.entries(styles.exports).map(([key, value]) => [key, value.name]),
);
const Page = compile(page, {
  "@/lib/diploma-lookup": helpers,
  "./page.module.css": { __esModule: true, default: names },
}).default;
const Shell = createWebLoader({
  "next/navigation": { usePathname: () => "/search" },
})("app/(public)/PublicShell.tsx").default;
const html = renderToStaticMarkup(
  React.createElement(Shell, null, React.createElement(Page)),
);
check(
  "the reference subtitle is preserved",
  html.includes("Vui lòng nhập thông tin để tra cứu"),
);
check(
  "lookup uses school blue and the shared page background",
  css.includes("--lookup-blue: var(--school-primary, #003b93)") &&
    !css.includes("background: #f2f6fb"),
);
check(
  "reference title is centered",
  /\.introduction\s*\{[^}]*text-align: center/s.test(css),
);
check(
  "reset appears before the centered search action",
  html.indexOf('aria-label="Nhập lại thông tin"') <
    html.indexOf('type="submit"') && html.includes("Tra cứu thông tin"),
);
check("no unsupported identity-card search is offered", !html.includes("CCCD"));
for (const field of helpers.lookupGroups.flatMap((group) => group.fields)) {
  check(
    "field is labeled: " + field.key,
    html.includes('for="lookup-' + field.key + '"') &&
      html.includes('id="lookup-' + field.key + '"'),
  );
}
check(
  "all groups are visible without hidden advanced filters",
  html.split("<fieldset ").length === 4,
);
check(
  "form has an explicit submit button",
  html.includes('type="submit"') && html.includes("Tra cứu văn bằng"),
);
check("form has a reset action", html.includes("Nhập lại"));
check(
  "required fields are clearly explained",
  html.includes("Nhập họ tên, ngày sinh và ít nhất một trong ba"),
);
check(
  "lookup is distinct from PDF verification",
  html.includes("không thay thế việc xác thực tệp văn bằng"),
);
check(
  "no technical proof field is presented",
  !/Proof JSON|Mã proof|Mã prof|OCSP|TSA|txId|ĐÃ NEO HASH/.test(html),
);
check(
  "keyboard and result announcements are supported",
  html.includes('href="#noi-dung"') &&
    html.includes('aria-live="polite"') &&
    html.includes('aria-current="page"'),
);
check(
  "mobile and tablet grids are defined",
  css.includes("max-width: 640px") &&
    css.includes("max-width: 900px") &&
    css.includes("grid-template-columns: minmax(0, 1fr)"),
);
check(
  "previous in-flight requests are cancelled on changes/reset",
  page.includes("controller.current?.abort()") &&
    page.includes("sequence.current !== requestId"),
);
check(
  "search no longer runs on every keystroke",
  !page.includes("setTimeout") && !page.includes("debounce"),
);

let backendCall;
let backendReply = [result];
let backendError;
const api = compile(route, {
  "@/lib/api": {
    apiCall: async (...args) => {
      backendCall = args;
      if (backendError) throw backendError;
      return backendReply;
    },
  },
  "next-auth": {
    getServerSession: () => {
      throw new Error("POST lookup must not require login");
    },
  },
  "../auth/[...nextauth]/route": { authOptions: {} },
});
const request = (value) =>
  new Request("http://localhost/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
let response = await api.POST(request(payload));
check(
  "public POST does not require authentication",
  response.status === 200 &&
    (await response.json()).results[0].uuid === result.uuid,
);
check(
  "proxy forwards structured fields to the lookup endpoint",
  backendCall[0] === "/cert/lookup" &&
    backendCall[1] === "POST" &&
    backendCall[2].soVaoSo === valid.soVaoSo,
);
check(
  "personal lookup results are not cached",
  response.headers.get("cache-control") === "private, no-store",
);
for (const status of [400, 403, 429, 500]) {
  backendError = Object.assign(new Error("PRIVATE_BACKEND_DETAIL"), { status });
  response = await api.POST(request(payload));
  const body = await response.json();
  check(
    "proxy preserves expected error status " + status,
    response.status === (status === 500 ? 502 : status),
  );
  check(
    "error responses remain uncached",
    response.headers.get("cache-control") === "private, no-store",
  );
  if (status === 500)
    check(
      "server errors do not expose internal details",
      !body.error.includes("PRIVATE_BACKEND_DETAIL"),
    );
}
backendError = undefined;
response = await api.POST(
  new Request("http://localhost/api/search", {
    method: "POST",
    body: "invalid JSON",
  }),
);
check("malformed JSON receives a validation response", response.status === 400);
if (process.env.LOOKUP_TEST_BASE_URL) {
  const base = new URL(process.env.LOOKUP_TEST_BASE_URL);
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname),
    "HTTP checks require a local test server",
  );
  const response = await fetch(new URL("/search", base));
  const markup = await response.text();
  check(
    "built search page renders",
    response.ok && !markup.includes("NEXT_HTTP_ERROR_FALLBACK;500"),
  );
  for (const field of helpers.lookupGroups.flatMap((group) => group.fields))
    check(
      "built form contains " + field.key,
      markup.includes('id="lookup-' + field.key + '"'),
    );
  check(
    "built search page uses reference subtitle",
    markup.includes("Vui lòng nhập thông tin để tra cứu"),
  );
  const styleLinks = [...markup.matchAll(/<link [^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => tag.includes('rel="stylesheet"'))
    .map((tag) => tag.match(/href="([^"]+)"/)?.[1]);
  let hasLookupStyles = false;
  for (const href of styleLinks) {
    const stylesheet = await fetch(
      new URL(href.replaceAll("&amp;", "&"), base),
    );
    const contents = await stylesheet.text();
    check(
      "built CSS is served",
      stylesheet.ok &&
        stylesheet.headers.get("content-type")?.includes("text/css"),
    );
    hasLookupStyles ||= contents.includes("--lookup-blue");
  }
  check("built search stylesheet is included", hasLookupStyles);
}
console.log(
  "Diploma lookup checks passed: " +
    checks +
    ". No database writes or temporary files.",
);
