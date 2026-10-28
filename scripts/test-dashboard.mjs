import assert from "node:assert/strict";
import { tsImport } from "tsx/esm/api";

const { dashboardTasks, dashboardBatchLink, dashboardTime } = await tsImport(
  "../apps/web/src/lib/dashboard.ts",
  import.meta.url,
);
const { canAccessWorkspacePath } = await tsImport(
  "../apps/web/src/lib/workspace-access.ts",
  import.meta.url,
);
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
const officer = {
  role: "university",
  isHeadquarters: true,
  canApproveDiplomas: true,
};
const data = {
  summary: { requestedRecords: 7, pendingAnchoring: 3 },
  imports: {
    counts: { needsReview: 1, ready: 2, graduationOnly: 4, prepare: 5 },
  },
};
const tasks = dashboardTasks(data, true);
check("six distinct work stages", tasks.length === 6);
check(
  "does not mix raw rows, drafts and requests",
  tasks.map((task) => task.value).join(",") === "1,2,4,5,7,3",
);
for (const task of tasks)
  check(
    "officer may open task destination " + task.href,
    canAccessWorkspacePath(officer, task.href),
  );
check(
  "unknown data stays unknown rather than zero",
  dashboardTasks(null, true).every((task) => task.value === undefined),
);
check(
  "real zeros remain zeros",
  dashboardTasks(
    {
      ...data,
      imports: {
        counts: { needsReview: 0, ready: 0, graduationOnly: 0, prepare: 0 },
      },
    },
    true,
  )[0].value === 0,
);
const adminTasks = dashboardTasks(data, false);
check(
  "admin has monitoring only",
  adminTasks.length === 1 && adminTasks[0].href === "/explorer",
);
check(
  "admin destinations are authorized",
  adminTasks.every((task) =>
    canAccessWorkspacePath({ role: "admin" }, task.href),
  ),
);
const batch = {
  id: "batch 001",
  needsReview: 1,
  ready: 2,
  graduationOnly: 3,
  prepare: 4,
};
for (const [flags, pathname, status] of [
  [{}, "/import", "NEEDS_REVIEW"],
  [{ needsReview: 0 }, "/import", "READY"],
  [{ needsReview: 0, ready: 0 }, "/import", "IMPORTED"],
  [{ needsReview: 0, ready: 0, graduationOnly: 0 }, "/issue", null],
]) {
  const link = new URL(
    dashboardBatchLink({ ...batch, ...flags }),
    "https://local.invalid",
  );
  check(
    "batch route prioritizes actionable stage " + status,
    link.pathname === pathname && link.searchParams.get("status") === status,
  );
  check(
    "batch identity is retained and encoded " + status,
    link.searchParams.get("batchId") === batch.id,
  );
}
check("missing timestamp remains unknown", dashboardTime(null) === "—");
check("invalid timestamp is safe", dashboardTime("invalid") === "—");
check(
  "uses Vietnamese date at UTC month boundary",
  dashboardTime("2026-09-30T17:05:00Z").includes("1/10/26"),
);
console.log("Dashboard helper checks passed: " + checks + ".");
