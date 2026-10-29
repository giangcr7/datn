import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { createWebLoader } from "./lib/web-component-loader.mjs";
import { renderToStaticMarkup } from "react-dom/server";
import { transform } from "lightningcss";
import postcss from "postcss";
import ts from "typescript";

const pageUrl = new URL("../apps/web/src/app/page.tsx", import.meta.url);
const [source, stylesheet] = await Promise.all([
  readFile(pageUrl, "utf8"),
  readFile(
    new URL(
      "../apps/web/src/styles/university-portal.module.css",
      import.meta.url,
    ),
    "utf8",
  ),
]);
const compiledStyles = transform({
  filename: "page.module.css",
  code: Buffer.from(stylesheet),
  cssModules: true,
  errorRecovery: false,
});
const styleNames = Object.fromEntries(
  Object.entries(compiledStyles.exports).map(([name, definition]) => [
    name,
    definition.name,
  ]),
);
const compiled = ts.transpileModule(source, {
  fileName: fileURLToPath(pageUrl),
  reportDiagnostics: true,
  compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    esModuleInterop: true,
  },
});
const pageRequire = createRequire(import.meta.url);
const pageModule = { exports: {} };
new Function("require", "module", "exports", compiled.outputText)(
  (specifier) =>
    specifier === "@/styles/university-portal.module.css"
      ? { __esModule: true, default: styleNames }
      : specifier === "@/components/UniversityChrome"
        ? createWebLoader()("components/UniversityChrome.tsx")
        : pageRequire(specifier),
  pageModule,
  pageModule.exports,
);
const html = renderToStaticMarkup(
  React.createElement(pageModule.exports.default),
);
const text = (markup) =>
  markup
    .replace(/<[^>]+>/g, "")
    .replace(/ +/g, " ")
    .trim();
const links = [
  ...html.matchAll(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<[/]a>/g),
].map(([, href, content]) => ({ href, label: text(content) }));
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}

check("TypeScript transpilation succeeds", !compiled.diagnostics?.length);
check(
  "Ant Design icons have a client boundary",
  source.startsWith('"use client";'),
);
check(
  "CSS modules compile without warnings",
  compiledStyles.warnings.length === 0,
);
for (const name of new Set(
  [...source.matchAll(/styles[.]([a-zA-Z]+)/g)].map(([, name]) => name),
))
  check("CSS class exists: " + name, Object.hasOwn(styleNames, name));
check("one main landmark", html.split("<main ").length === 2);
check("one page heading", html.split("<h1 ").length === 2);
check(
  "the heading identifies the portal",
  text(html.match(/<h1[^>]*>(.*?)<[/]h1>/)?.[1] || "") ===
    "Cổng tra cứu và xác thực văn bằng",
);
check(
  "university identity is visible",
  html.includes("TRƯỜNG ĐẠI HỌC THỦY LỢI"),
);
check(
  "logo has alternative text",
  html.includes('alt="Logo Trường Đại học Thủy Lợi"'),
);
check(
  "verification and search are separate",
  html.split("<article ").length === 3,
);
check(
  "verification appears before search",
  html.indexOf('href="/verify"', html.indexOf("<main")) <
    html.indexOf('href="/search"', html.indexOf("<main")),
);

for (const [href, label] of [
  ["/verify", "Xác thực ngay"],
  ["/search", "Tra cứu ngay"],
  ["/login", "Đăng nhập"],
  ["/login?type=student", "Đăng nhập sinh viên"],
  ["/login?type=university", "Đăng nhập cán bộ"],
])
  check(
    "destination for " + label,
    links.some((link) => link.href === href && link.label === label),
  );

const ids = [...html.matchAll(/ id="([^"]+)"/g)].map(([, id]) => id);
check("HTML identifiers are unique", ids.length === new Set(ids).size);
for (const link of links.filter((link) => link.href.startsWith("#")))
  check(
    "in-page destination exists: " + link.href,
    ids.includes(link.href.slice(1)),
  );
check(
  "keyboard users can skip navigation",
  links[0].href === "#noi-dung" &&
    html.includes('<main id="noi-dung" tabindex="-1"'),
);
check(
  "requested introduction removed",
  !text(html).includes(
    "Tra cứu thông tin và kiểm tra tình trạng văn bằng tốt nghiệp do nhà trường quản lý.",
  ),
);
check(
  "removed utility labels leave no empty strip",
  !text(html).includes("HỆ THỐNG THÔNG TIN NHÀ TRƯỜNG") &&
    !text(html).includes("Văn bằng tốt nghiệp"),
);
check("guide has three steps", html.split("<li>").length === 4);
check(
  "guidance expands without JavaScript",
  html.split("<details>").length === 3 && html.split("<summary>").length === 3,
);
check(
  "QR does not claim to check arbitrary PDF content",
  text(html).includes("mã QR không thay thế việc kiểm tra nội dung tệp PDF"),
);
check(
  "requested lookup description removed",
  !text(html).includes("trong phạm vi được nhà trường cho phép tra cứu"),
);
check(
  "requested verification description removed",
  !text(html).includes(
    "Xác thực bằng tệp PDF hoặc mã QR mà không cần đăng nhập",
  ),
);
const privateRoutes = new Set([
  "dashboard",
  "diploma-records",
  "certificates",
  "catalog",
  "activity",
  "explorer",
  "users",
]);
check(
  "administrative navigation is not public",
  !links.some((link) => privateRoutes.has(link.href.split("/")[1])),
);
check(
  "no technical verification inputs",
  !/<input|Proof JSON|OCSP|TSA|Org1MSP|txId/i.test(html),
);
check(
  "no fabricated legal or network assurances",
  !/100%|giá trị pháp lý|không thể giả mạo|đang hoạt động bình thường/i.test(
    text(html),
  ),
);

const css = postcss.parse(stylesheet);
const mobile = css.nodes.find(
  (node) =>
    node.type === "atrule" &&
    node.name === "media" &&
    node.params === "(max-width: 640px)",
);
function mobileRule(selector, property, value) {
  return mobile?.nodes.some(
    (rule) =>
      rule.type === "rule" &&
      rule.selector
        .split(",")
        .map((item) => item.trim())
        .includes(selector) &&
      rule.nodes.some(
        (declaration) =>
          declaration.prop === property && declaration.value === value,
      ),
  );
}
check(
  "mobile stacks services",
  mobileRule(".services", "grid-template-columns", "minmax(0, 1fr)"),
);
check(
  "mobile stacks guidance and institutional accounts",
  mobileRule(".informationGrid", "grid-template-columns", "minmax(0, 1fr)"),
);
check(
  "mobile navigation uses compact readable labels",
  mobileRule(".navigationDetail", "display", "none"),
);
check("keyboard focus styling", stylesheet.includes(":focus-visible"));
check(
  "reduced motion is respected",
  css.nodes.some(
    (node) =>
      node.type === "atrule" &&
      node.params === "(prefers-reduced-motion: reduce)" &&
      node.toString().includes("transition: none"),
  ),
);

check(
  "the home navigation item identifies the current page",
  html.includes('aria-current="page"'),
);
check(
  "the masthead retains school identity without the removed subtitle",
  text(html).includes("TRƯỜNG ĐẠI HỌC THỦY LỢI") &&
    !text(html).includes("Hệ thống quản lý và xác thực văn bằng"),
);
check(
  "the page has no promotional slogan",
  !text(html).includes("KẾT NỐI THÔNG TIN, CỦNG CỐ NIỀM TIN"),
);
check(
  "service panels use a restrained institutional treatment",
  !stylesheet.includes("gradient(") && !stylesheet.includes("box-shadow"),
);
check(
  "the page has no entrance animations",
  !stylesheet.includes("animation:"),
);
check(
  "the footer retains the thesis context",
  text(html.slice(html.indexOf("<footer"))).includes(
    "Ứng dụng blockchain trong quản lý và xác thực văn bằng",
  ),
);

if (process.env.HOMEPAGE_TEST_BASE_URL) {
  const base = new URL(process.env.HOMEPAGE_TEST_BASE_URL);
  assert(
    ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname),
    "HTTP checks only run against a local test server",
  );
  const homeResponse = await fetch(base);
  const home = await homeResponse.text();
  check(
    "production homepage renders",
    homeResponse.ok &&
      home.includes("Cổng tra cứu và") &&
      !home.includes("NEXT_HTTP_ERROR_FALLBACK;500"),
  );
  check("production contains the new action", home.includes("Xác thực ngay"));
  check(
    "production does not retain the removed utility bar",
    !home.includes("HỆ THỐNG THÔNG TIN NHÀ TRƯỜNG"),
  );
  check(
    "production does not serve the previous promotional design",
    !home.includes("KẾT NỐI THÔNG TIN, CỦNG CỐ NIỀM TIN"),
  );
  const styleLinks = [...home.matchAll(/<link [^>]*>/g)]
    .map(([tag]) => tag)
    .filter((tag) => tag.includes('rel="stylesheet"'))
    .map((tag) => tag.match(/href="([^"]+)"/)?.[1]);
  check("production loads compiled CSS", styleLinks.length > 0);
  let hasHomepageStyles = false;
  for (const href of styleLinks) {
    const response = await fetch(new URL(href.replaceAll("&amp;", "&"), base));
    const contents = await response.text();
    check(
      "compiled stylesheet is served",
      response.ok && response.headers.get("content-type")?.includes("text/css"),
    );
    hasHomepageStyles ||= contents.includes("--home-blue");
  }
  check("homepage stylesheet is included", hasHomepageStyles);
  for (const path of [
    "/search",
    "/verify",
    "/login",
    "/login?type=student",
    "/login?type=university",
  ]) {
    const response = await fetch(new URL(path, base));
    const contents = await response.text();
    check(
      "public destination renders: " + path,
      response.ok && !contents.includes("NEXT_HTTP_ERROR_FALLBACK;500"),
    );
  }
  const logo = await fetch(new URL("/logo-tlu.png", base));
  check(
    "university logo is available",
    logo.ok && logo.headers.get("content-type")?.includes("image/png"),
  );
}

console.log(
  "Homepage checks passed: " +
    checks +
    ". No database writes or temporary files.",
);
