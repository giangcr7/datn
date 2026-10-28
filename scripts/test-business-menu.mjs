import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { tsImport } from "tsx/esm/api";

const { getWorkspace, getWorkspaceLinks, canAccessWorkspacePath } =
  await tsImport("../apps/web/src/lib/workspace-access.ts", import.meta.url);
const { activitySearchParams } = await tsImport(
  "../apps/web/src/lib/activity.ts",
  import.meta.url,
);
const officer = {
  role: "university",
  isHeadquarters: true,
  canApproveDiplomas: true,
};
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
const links = getWorkspace(officer).links;
check(
  "exactly six top-level officer menus including overview",
  links.length + 1 === 6,
);
check(
  "business menu labels match the agreed scope",
  JSON.stringify(links.map((link) => link.label)) ===
    JSON.stringify([
      "Hồ sơ cấp văn bằng",
      "Sổ văn bằng",
      "Danh mục",
      "Nhật ký hoạt động",
      "Đối chiếu blockchain",
    ]),
);
for (const link of getWorkspaceLinks(officer)) {
  const source = await readFile(
    new URL(
      "../apps/web/src/app/(admin)" + link.path + "/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  check(
    "protected real page exists: " + link.path,
    source.includes("requireWorkspaceAccess("),
  );
}
for (const route of ["/catalog", "/activity", "/diploma-records"]) {
  check(
    "student is denied " + route,
    !canAccessWorkspacePath({ role: "student" }, route),
  );
  check(
    "archived staff is denied " + route,
    !canAccessWorkspacePath({ ...officer, isHeadquarters: false }, route),
  );
}
const params = activitySearchParams(
  {
    search: " staff ",
    action: "APPROVE_CERT",
    result: "SUCCESS",
    from: "2026-10-27",
    to: "2026-10-27",
  },
  2,
  50,
);
check(
  "date filters cover the full Vietnamese local day",
  params.get("from") === "2026-10-26T17:00:00.000Z" &&
    params.get("to") === "2026-10-27T16:59:59.999Z",
);
check(
  "audit filters retain search and paging",
  params.get("search") === "staff" &&
    params.get("page") === "2" &&
    params.get("limit") === "50",
);
const catalog = await readFile(
  new URL(
    "../apps/web/src/app/(admin)/catalog/CatalogClient.tsx",
    import.meta.url,
  ),
  "utf8",
);
check(
  "catalog has real program and alias mutations",
  catalog.includes("/api/catalog/programs") &&
    catalog.includes("/api/catalog/program-aliases"),
);
check(
  "catalog links back to data rechecking",
  catalog.includes('href="/import"'),
);
const activity = await readFile(
  new URL(
    "../apps/web/src/app/(admin)/activity/ActivityClient.tsx",
    import.meta.url,
  ),
  "utf8",
);
check(
  "activity is read-only",
  !/method:\s*['"](?:POST|PATCH|DELETE)/.test(activity),
);
console.log("Business menu checks passed: " + checks);
