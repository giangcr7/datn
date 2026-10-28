import assert from "node:assert/strict";
import { tsImport } from "tsx/esm/api";

const {
  canAccessWorkspacePath,
  getDiplomaActions,
  getWorkspace,
  getWorkspaceKind,
  getWorkspaceLinks,
} = await tsImport("../apps/web/src/lib/workspace-access.ts", import.meta.url);
const actors = {
  hcm: {
    role: "university",
    org: "ORG2",
    isHeadquarters: true,
    canApproveDiplomas: true,
  },
  hanoi: {
    role: "university",
    org: "ORG1",
    isHeadquarters: false,
    canApproveDiplomas: false,
  },
  admin: {
    role: "admin",
    org: "ORG1",
    isHeadquarters: true,
    canApproveDiplomas: true,
  },
  student: { role: "student", org: "ORG2" },
};
let checks = 0;
function check(label, actual, expected) {
  assert.deepEqual(actual, expected, label);
  checks++;
}
const routes = [
  "/dashboard",
  "/diploma-records",
  "/catalog",
  "/activity",
  "/users",
  "/explorer",
  "/students",
  "/students/import",
  "/import",
  "/issue",
  "/pending",
  "/certificates",
  "/student/dashboard",
  "/student/profile",
];
const expected = {
  hcm: [
    "/dashboard",
    "/diploma-records",
    "/catalog",
    "/activity",
    "/students",
    "/students/import",
    "/import",
    "/issue",
    "/pending",
    "/certificates",
    "/explorer",
  ],
  hanoi: [],
  admin: ["/dashboard", "/users", "/explorer", "/certificates", "/activity"],
  student: ["/student/dashboard", "/student/profile"],
};
for (const [name, actor] of Object.entries(actors)) {
  for (const route of routes)
    check(
      name + " route " + route,
      canAccessWorkspacePath(actor, route),
      expected[name].includes(route),
    );
  for (const link of getWorkspaceKind(actor) === "none"
    ? []
    : getWorkspaceLinks(actor))
    check(
      name + " navigation " + link.path,
      canAccessWorkspacePath(actor, link.path),
      true,
    );
  for (const status of [
    "DRAFT",
    "PENDING",
    "ANCHOR_PENDING",
    "REJECTED",
    "REVOKED",
    "REPLACED",
    "ON_CHAIN",
  ]) {
    const actions = getDiplomaActions(actor, {
      status,
      org: "ORG2",
      documentStatus: "ACTIVE",
    });
    check(
      name + " sharing " + status,
      actions.share,
      ["hcm", "student"].includes(name) && status === "ON_CHAIN",
    );
    check(
      name + " submit " + status,
      actions.submit,
      name === "hcm" && status === "DRAFT",
    );
    check(
      name + " revoke " + status,
      actions.revoke,
      name === "hcm" && status === "ON_CHAIN",
    );
    check(
      name + " verify " + status,
      actions.verify,
      ["hcm", "admin"].includes(name) &&
        ["ON_CHAIN", "REVOKED", "REPLACED"].includes(status),
    );
  }
}
check(
  "officer navigation contains exactly the five business entries after dashboard",
  getWorkspace(actors.hcm).links.map((link) => link.label),
  [
    "Hồ sơ cấp văn bằng",
    "Sổ văn bằng",
    "Danh mục",
    "Nhật ký hoạt động",
    "Đối chiếu blockchain",
  ],
);
check(
  "existing issuance routes are grouped without removing access",
  getWorkspace(actors.hcm).links[0].children.map((link) => link.path),
  ["/students", "/students/import", "/import", "/pending", "/issue"],
);
check(
  "branch cannot submit another campus draft",
  getDiplomaActions(actors.hcm, { status: "DRAFT", org: "ORG1" }).submit,
  false,
);
check(
  "staff without capability has no workspace",
  getWorkspaceKind({ ...actors.hanoi, canApproveDiplomas: false }),
  "none",
);
check(
  "approval capability outside main campus grants no workspace",
  getWorkspaceKind({ ...actors.hcm, isHeadquarters: false }),
  "none",
);
check(
  "admin flags never grant approval authority",
  getWorkspaceKind(actors.admin),
  "admin",
);
check(
  "unknown roles have no workspace",
  canAccessWorkspacePath({ role: "employer" }, "/dashboard"),
  false,
);
check(
  "anonymous users have no workspace",
  canAccessWorkspacePath(undefined, "/certificates"),
  false,
);
check(
  "unknown routes fail closed",
  canAccessWorkspacePath(actors.admin, "/users/delete"),
  false,
);
check(
  "query strings do not change access",
  canAccessWorkspacePath(actors.hcm, "/certificates?search=0099999991"),
  true,
);
console.log(
  "Workspace policy checks passed: " +
    checks +
    ". One officer, archived staff, admin and student; route allowlists and local issuance.",
);
