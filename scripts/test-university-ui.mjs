import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import postcss from "postcss";
import { transform } from "lightningcss";
import { createWebLoader } from "./lib/web-component-loader.mjs";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
let pathname = "/search";
const load = createWebLoader({
  "next/navigation": {
    usePathname: () => pathname,
    useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
    useSearchParams: () => new URLSearchParams(),
  },
});
const { UniversityHeader, UniversityMasthead } = load(
  "components/UniversityChrome.tsx",
);
const { default: PublicShell } = load("app/(public)/PublicShell.tsx");
const { default: PageTitle } = load("components/PageTitle.tsx");
const { schoolColors, schoolTheme } = load("lib/school-theme.ts");
const markup = (Component, props, children) =>
  renderToStaticMarkup(React.createElement(Component, props, children));
for (const [section, href] of [
  ["home", "/"],
  ["search", "/search"],
  ["verify", "/verify"],
  ["account", "/login"],
]) {
  const html = markup(UniversityHeader, { active: section });
  check(
    "one active navigation item: " + section,
    (html.match(/aria-current="page"/g) || []).length === 1,
  );
  check(
    "active destination: " + href,
    [...html.matchAll(/<a[^>]*>/g)].some(
      ([tag]) =>
        tag.includes('href="' + href + '"') &&
        tag.includes('aria-current="page"'),
    ),
  );
  check(
    "school masthead retained: " + section,
    html.includes("TRƯỜNG ĐẠI HỌC THỦY LỢI") &&
      !html.includes("HỆ THỐNG THÔNG TIN NHÀ TRƯỜNG") &&
      !html.includes("Hệ thống quản lý và xác thực văn bằng"),
  );
  check(
    "guide resolves correctly: " + section,
    html.includes(
      'href="' + (section === "home" ? "#huong-dan" : "/#huong-dan") + '"',
    ),
  );
}
const masthead = markup(UniversityMasthead).replace(/<link[^>]*>/g, "");
for (const path of [
  "/search",
  "/verify",
  "/login",
  "/register/student",
  "/change-password",
]) {
  pathname = path;
  const Page = load("app/(public)" + path + "/page.tsx").default;
  const html = markup(PublicShell, null, React.createElement(Page));
  check("same masthead: " + path, html.includes(masthead));
  check(
    "one header and footer: " + path,
    (html.match(/<header/g) || []).length === 1 &&
      (html.match(/<footer/g) || []).length === 1,
  );
  check(
    "one main and page title: " + path,
    (html.match(/<main /g) || []).length === 1 &&
      (html.match(/<h1[ >]/g) || []).length === 1,
  );
  check(
    "keyboard skip target: " + path,
    html.includes('href="#noi-dung"') && html.includes('id="noi-dung"'),
  );
  check(
    "no manual proof field: " + path,
    !/Mã proof|Mã prof|Proof JSON|OCSP|TSA/.test(html),
  );
}
pathname = "/student/dashboard";
const studentHtml = markup(
  load("app/student/StudentShell.tsx").default,
  null,
  React.createElement(PageTitle, null, "Văn bằng của tôi"),
);
check("student uses same masthead", studentHtml.includes(masthead));
check(
  "student keeps its navigation",
  studentHtml.includes("Văn bằng của tôi") &&
    studentHtml.includes("Hồ sơ của tôi") &&
    studentHtml.includes("Đăng xuất"),
);
check(
  "student keeps accessible main",
  studentHtml.includes('id="student-content"') &&
    studentHtml.includes('href="#student-content"'),
);
pathname = "/dashboard";
const officer = {
  role: "university",
  isHeadquarters: true,
  canApproveDiplomas: true,
  campusName: "Cơ sở chính TP. Hồ Chí Minh",
};
const adminHtml = markup(
  load("app/(admin)/AdminShell.tsx").default,
  { user: officer },
  React.createElement(PageTitle, null, "Tổng quan"),
);
check(
  "staff shares university identity",
  adminHtml.includes("TRƯỜNG ĐẠI HỌC THỦY LỢI"),
);
check(
  "staff keeps business menus",
  [
    "Hồ sơ cấp văn bằng",
    "Sổ văn bằng",
    "Danh mục",
    "Nhật ký hoạt động",
    "Đối chiếu blockchain",
  ].every((name) => adminHtml.includes(name)),
);
check(
  "staff main and menu toggle accessible",
  adminHtml.includes('id="workspace-content"') &&
    adminHtml.includes('aria-label="Thu gọn menu"'),
);
check(
  "staff role and campus captions removed without changing menus",
  !adminHtml.includes("CÁN BỘ · DUYỆT VÀ PHÁT HÀNH") &&
    !adminHtml.includes(officer.campusName),
);
const dashboardHtml = markup(
  load("app/(admin)/dashboard/DashboardClient.tsx").default,
  { user: officer, initialOverview: null, loadError: false },
);
check(
  "dashboard role and campus captions removed",
  !dashboardHtml.includes("CÁN BỘ · DUYỆT VÀ PHÁT HÀNH") &&
    !dashboardHtml.includes(officer.campusName),
);
check(
  "dashboard still shows task destinations",
  dashboardHtml.includes("/import") && dashboardHtml.includes("/explorer"),
);
pathname = "/users";
check(
  "staff access controls retained",
  markup(
    load("app/(admin)/AdminShell.tsx").default,
    { user: officer },
    "private content",
  ).includes("Màn hình không thuộc vai trò của bạn"),
);
check(
  "primary palette matches homepage",
  schoolColors.primary === "#003b93" &&
    schoolColors.navy === "#163459" &&
    schoolColors.gold === "#bc9850",
);
check(
  "Ant Design uses shared palette",
  schoolTheme.token.colorPrimary === schoolColors.primary &&
    schoolTheme.token.colorBgLayout === schoolColors.background &&
    schoolTheme.token.borderRadius === 3,
);
const [
  globalCss,
  portalCss,
  workspaceCss,
  publicCss,
  rootLayout,
  themeRegistry,
] = await Promise.all([
  read("apps/web/src/app/globals.css"),
  read("apps/web/src/styles/university-portal.module.css"),
  read("apps/web/src/styles/workspace.module.css"),
  read("apps/web/src/styles/public-pages.module.css"),
  read("apps/web/src/app/layout.tsx"),
  read("apps/web/src/app/ThemeRegistry.tsx"),
]);
check(
  "root loads shared styles and palette",
  rootLayout.includes('import "./globals.css"') &&
    rootLayout.includes("schoolColors"),
);
check(
  "one shared Ant Design theme",
  themeRegistry.includes("theme={schoolTheme}"),
);
check(
  "public layout shared across route group",
  (await read("apps/web/src/app/(public)/layout.tsx")).includes(
    "<PublicShell>",
  ),
);
for (const [name, css] of [
  ["portal", portalCss],
  ["workspace", workspaceCss],
  ["public pages", publicCss],
]) {
  check(
    "CSS module compiles: " + name,
    transform({
      filename: name + ".module.css",
      code: Buffer.from(css),
      cssModules: true,
      errorRecovery: false,
    }).warnings.length === 0,
  );
  check("restrained surfaces: " + name, !/gradient\(|box-shadow:/.test(css));
  check("mobile breakpoint: " + name, css.includes("max-width: 640px"));
}
check(
  "active public tabs remain visible on mobile",
  !/\.navigationInner > \[aria-current="page"\]\s*\{\s*display: none/.test(
    portalCss,
  ),
);
check(
  "mobile sidebar overrides desktop sticky positioning",
  /@media \(max-width: 991px\)\s*\{\s*\.shell \.sidebar\s*\{\s*position: fixed/.test(
    workspaceCss,
  ),
);
check(
  "table overflow is contained",
  globalCss.includes(".ant-table-content") &&
    globalCss.includes("overflow-x: auto"),
);
for (const path of [
  "activity/ActivityClient",
  "catalog/CatalogClient",
  "dashboard/DashboardClient",
  "diploma-records/DiplomaRecordsClient",
  "explorer/ExplorerClient",
  "import/ImportClient",
  "certificates/CertificatesClient",
  "pending/PendingClient",
  "students/StudentsClient",
  "students/import/ImportStudentsClient",
]) {
  const source = await read("apps/web/src/app/(admin)/" + path + ".tsx");
  check(
    "shared workspace spacing: " + path,
    source.includes('className="workspace-page'),
  );
  check("shared heading: " + path, source.includes("<PageTitle"));
}
for (const path of [
  "pending/CorrectionsClient",
  "pending/ReplacementsClient",
]) {
  const source = await read("apps/web/src/app/(admin)/" + path + ".tsx");
  check(
    "nested tab uses section spacing: " + path,
    source.includes("workspace-section"),
  );
  check(
    "nested tab avoids duplicate h1: " + path,
    source.includes("<PageTitle level={2}>"),
  );
}
for (const path of [
  "dashboard/StudentDashboardClient",
  "profile/StudentProfileClient",
]) {
  const source = await read("apps/web/src/app/student/" + path + ".tsx");
  check(
    "student shared spacing and title: " + path,
    source.includes("workspace-page") && source.includes("<PageTitle"),
  );
  check(
    "student removes floating-card treatment: " + path,
    !/shadow-sm|rounded-xl|linear-gradient/.test(source),
  );
}
const require = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const tailwind = require("@tailwindcss/postcss");
const compiled = await postcss([
  tailwind({ base: fileURLToPath(new URL("../apps/web/", import.meta.url)) }),
]).process(globalCss, {
  from: fileURLToPath(
    new URL("../apps/web/src/app/globals.css", import.meta.url),
  ),
  map: false,
});
check("Tailwind utilities compile", compiled.warnings().length === 0);
for (const utility of [".flex", ".grid", ".mb-6", ".space-y-5", ".gap-4"])
  check("layout utility generated: " + utility, compiled.css.includes(utility));
check(
  "responsive grid utilities generated",
  compiled.css.includes("grid-template-columns: repeat(2, minmax(0, 1fr))") &&
    compiled.css.includes("width >= 48rem"),
);
check(
  "no preflight reset changes the approved homepage",
  !compiled.css.includes("list-style: none") &&
    !globalCss.includes("preflight.css"),
);
check(
  "utility blue uses school palette",
  compiled.css.includes("color: var(--school-primary)"),
);
console.log(
  "University UI checks passed: " +
    checks +
    ". No database writes or temporary artifacts.",
);
