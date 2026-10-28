import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
config({ path: resolve(root, "apps/api/.env"), quiet: true });
const webUrl = "http://localhost:3100";
const apiPort = Number(
  process.env.SMOKE_API_PORT ||
    (process.env.SMOKE_USE_RUNNING_API === "true" ? 3001 : 3101),
);
const apiUrl = "http://localhost:" + apiPort + "/api";
const processes = [];
const cookies = new Map();
let logs = "";
let signedIn = false;
let checks = 0;
async function unused(port) {
  const net = await import("node:net");
  const server = net.createServer();
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(port, accept);
  });
  await new Promise((accept) => server.close(accept));
}
function start(args, cwd, env) {
  const process = spawn(globalThis.process.execPath, args, {
    cwd,
    env: { ...globalThis.process.env, ...env },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const stream of [process.stdout, process.stderr])
    stream.on("data", (data) => {
      logs = (logs + data).slice(-15000);
    });
  processes.push(process);
  return process;
}
async function ready(url, process) {
  for (let attempt = 0; attempt < 120; attempt++) {
    if (process.exitCode !== null)
      throw new Error("Server exited before readiness: " + logs.slice(-2000));
    try {
      if ((await fetch(url)).ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error(
    "Server did not become ready: " + url + " " + logs.slice(-2000),
  );
}
async function request(
  path,
  { body, form, authenticated = true, method } = {},
) {
  const headers = {};
  if (authenticated && cookies.size)
    headers.Cookie = [...cookies]
      .map(([key, value]) => key + "=" + value)
      .join("; ");
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
  const response = await fetch(webUrl + path, {
    method: method || (body === undefined && !form ? "GET" : "POST"),
    headers,
    redirect: "manual",
    body: form
      ? new URLSearchParams(form).toString()
      : body === undefined
        ? undefined
        : JSON.stringify(body),
  });
  if (authenticated)
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const separator = pair.indexOf("=");
      cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { response, data };
}
function check(label, condition) {
  assert(condition, label);
  checks++;
}
function blockedWorkspace(page, destination = "/dashboard") {
  return (
    ((page.response.status === 307 || page.response.status === 308) &&
      page.response.headers.get("location")?.endsWith(destination)) ||
    (page.response.status === 200 &&
      typeof page.data === "string" &&
      (page.data.includes("NEXT_REDIRECT;replace;" + destination + ";307;") ||
        page.data.includes("Màn hình không thuộc vai trò của bạn")))
  );
}
async function checkSessionPages(role) {
  const missingId = "00000000-0000-4000-8000-000000000001";
  const candidates = await request("/api/cert/candidates?page=1&limit=20");
  check(
    role + " candidate permissions",
    role === "ORG2"
      ? candidates.response.ok &&
          Array.isArray(candidates.data.data) &&
          Number.isInteger(candidates.data.pagination.total)
      : candidates.response.status === 403,
  );
  const paginatedPending = await request("/api/cert/pending?page=1&limit=20");
  check(
    role + " paginated request queue",
    paginatedPending.response.ok &&
      Array.isArray(paginatedPending.data.data) &&
      Number.isInteger(paginatedPending.data.pagination.total),
  );
  const bulkSubmit = await request("/api/cert/bulk/submit", {
    body: { diplomaIds: [missingId] },
  });
  check(
    role + " bulk submission permissions and per-record errors",
    role === "ORG2"
      ? bulkSubmit.response.ok &&
          bulkSubmit.data.failed === 1 &&
          bulkSubmit.data.results[0].uuid === missingId
      : bulkSubmit.response.status === 403,
  );
  const bulkApprove = await request("/api/cert/bulk/approve", {
    body: { diplomaIds: [missingId] },
  });
  check(
    role + " bulk approval permissions and per-record errors",
    role === "ORG1"
      ? bulkApprove.response.ok && bulkApprove.data.failed === 1
      : bulkApprove.response.status === 403,
  );
  if (role === "ORG2") {
    const empty = await request("/api/cert/bulk/submit", {
      body: { diplomaIds: [] },
    });
    check(
      "empty bulk selections are rejected by DTO",
      empty.response.status === 400,
    );
    const invalidBatch = await request(
      "/api/cert/candidates?page=1&batchId=invalid",
    );
    check(
      "invalid review batch returns a readable 400",
      invalidBatch.response.status === 400,
    );
  }
  const allowed =
    role === "ORG2"
      ? [
          ["/pending", "Theo dõi yêu cầu gửi trụ sở"],
          ["/certificates", "Văn bằng đã phát hành"],
          ["/issue", "Yêu cầu cấp phát và ghi nhận văn bằng"],
          ["/import", "Kiểm tra dữ liệu"],
          ["/students", "Hồ sơ sinh viên của cơ sở"],
          ["/students/import", "Nhập hồ sơ sinh viên"],
        ]
      : role === "ORG1"
        ? [
            ["/pending", "Trụ sở phê duyệt văn bằng"],
            ["/certificates", "Văn bằng toàn trường"],
            ["/explorer", "Blockchain"],
          ]
        : [
            ["/certificates", "Giám sát văn bằng"],
            ["/users", "DANH SÁCH TÀI KHOẢN HỆ THỐNG"],
            ["/explorer", "Blockchain"],
          ];
  for (const [path, heading] of allowed) {
    const page = await request(path);
    check(
      role + " renders " + path,
      page.response.ok &&
        typeof page.data === "string" &&
        page.data.includes(heading) &&
        !page.data.includes("must be wrapped in a"),
    );
  }
  const forbidden =
    role === "ORG2"
      ? ["/users", "/explorer"]
      : role === "ORG1"
        ? ["/users", "/issue", "/import", "/students", "/students/import"]
        : ["/pending", "/issue", "/import", "/students", "/students/import"];
  for (const path of [...forbidden, "/student/dashboard", "/student/profile"]) {
    const page = await request(path);
    check(
      role + " blocks direct navigation to " + path,
      blockedWorkspace(page),
    );
  }
  const dashboard = await request("/dashboard");
  for (const path of forbidden) {
    check(
      role + " dashboard has no link to " + path,
      !dashboard.data.includes('href="' + path + '"'),
    );
  }
  check(
    role + " dashboard removes legacy MongoDB/sync actions",
    !dashboard.data.includes("Sync từ Blockchain") &&
      !dashboard.data.includes("OFF-CHAIN (MONGODB)"),
  );
  const statistics = await request("/api/statistics");
  check(
    role + " gets workflow statistics",
    [
      "totalDraft",
      "totalRequested",
      "totalRejected",
      "totalPendingAnchor",
    ].every((field) => Number.isInteger(statistics.data[field])),
  );
  if (role === "ADMIN") {
    for (const path of [
      "/api/issue",
      "/api/students",
      "/api/imports/registry/preview",
      "/api/imports/program-aliases",
    ]) {
      const denied = await request(path, { body: {} });
      check(
        "ADMIN cannot write through " + path,
        denied.response.status === 403,
      );
    }
    const monitoring = await request("/api/certificates?page=1&limit=1");
    check(
      "ADMIN retains read-only diploma monitoring",
      monitoring.response.ok &&
        monitoring.data.success &&
        Array.isArray(monitoring.data.data),
    );
  }
}

try {
  await unused(3100);
  if (process.env.SMOKE_USE_RUNNING_API === "true") {
    assert((await fetch(apiUrl + "/health")).ok, "Running API must be healthy");
  } else {
    await unused(apiPort);
    const api = start(["dist/main.js"], resolve(root, "apps/api"), {
      PORT: String(apiPort),
      FABRIC_ENABLED: "false",
      OUTBOX_ENABLED: "false",
    });
    await ready(apiUrl + "/health", api);
  }
  const web = start(
    [require.resolve("next/dist/bin/next"), "start", "--port", "3100"],
    resolve(root, "apps/web"),
    { NEXTAUTH_URL: webUrl, API_URL: apiUrl },
  );
  await ready(webUrl + "/login", web);
  const anonymousStudent = await request("/student/dashboard", {
    authenticated: false,
  });
  check(
    "student workspace requires authentication",
    anonymousStudent.response.status === 307 &&
      anonymousStudent.response.headers.get("location")?.endsWith("/login"),
  );
  const anonymousIssue = await request("/api/issue", {
    body: {},
    authenticated: false,
  });
  check("issue proxy preserves 401", anonymousIssue.response.status === 401);
  const anonymousRevoke = await request("/api/revoke", {
    body: {},
    authenticated: false,
  });
  check("revoke proxy preserves 401", anonymousRevoke.response.status === 401);
  const csrf = await request("/api/auth/csrf");
  const login = await request("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.data.csrfToken,
      email: process.env.BOOTSTRAP_ORG2_EMAIL,
      password: process.env.BOOTSTRAP_ORG2_PASSWORD,
      role: "university",
      callbackUrl: webUrl + "/dashboard",
      json: "true",
    },
  });
  check(
    "NextAuth login succeeds",
    login.response.ok &&
      typeof login.data.url === "string" &&
      !login.data.url.includes("error="),
  );
  signedIn = true;
  const session = await request("/api/auth/session");
  check(
    "web session keeps backend staff role",
    session.data.user?.role === "university",
  );
  check(
    "branch session cannot approve diplomas",
    session.data.user?.canApproveDiplomas === false &&
      session.data.user?.isHeadquarters === false,
  );
  const programs = await request("/api/imports/programs");
  check(
    "program dropdown gets a plain array",
    programs.response.status === 200 &&
      Array.isArray(programs.data) &&
      programs.data.length > 0,
  );
  const validation = await request("/api/issue", { body: {} });
  check(
    "issue proxy preserves 400 and a readable message",
    validation.response.status === 400 &&
      typeof validation.data.error === "string" &&
      validation.data.error.length > 0,
  );
  const missing = await request("/api/cert/approve", {
    body: { uuid: "00000000-0000-0000-0000-000000000000" },
  });
  check(
    "HCM cannot approve, proxy preserves 403",
    missing.response.status === 403,
  );
  const pending = await request("/api/cert/pending");
  check(
    "pending wrapper matches UI",
    pending.response.status === 200 &&
      pending.data.success &&
      Array.isArray(pending.data.data),
  );
  const users = await request("/users");
  check(
    "staff cannot open ADMIN users page (status=" +
      users.response.status +
      ", location=" +
      users.response.headers.get("location") +
      ")",
    blockedWorkspace(users),
  );
  const loginPage = await request("/login");
  check(
    "login does not link to missing forgot-password route",
    !loginPage.data.includes('href="/forgot-password"'),
  );
  const branchDashboard = await request("/dashboard");
  check(
    "branch sees preparer workspace",
    branchDashboard.response.ok &&
      branchDashboard.data.includes("CÁN BỘ · LẬP HỒ SƠ"),
  );
  await checkSessionPages("ORG2");
  for (const [prefix, role, capability, label] of [
    ["ORG1", "university", true, "TRỤ SỞ · PHÊ DUYỆT"],
    ["ADMIN", "admin", false, "QUẢN TRỊ HỆ THỐNG"],
  ]) {
    const logoutCsrf = await request("/api/auth/csrf");
    await request("/api/auth/signout", {
      form: {
        csrfToken: logoutCsrf.data.csrfToken,
        callbackUrl: webUrl + "/login",
        json: "true",
      },
    });
    signedIn = false;
    const nextCsrf = await request("/api/auth/csrf");
    const nextLogin = await request("/api/auth/callback/credentials", {
      form: {
        csrfToken: nextCsrf.data.csrfToken,
        email: process.env["BOOTSTRAP_" + prefix + "_EMAIL"],
        password: process.env["BOOTSTRAP_" + prefix + "_PASSWORD"],
        role,
        callbackUrl: webUrl + "/dashboard",
        json: "true",
      },
    });
    check(
      prefix + " NextAuth login succeeds",
      nextLogin.response.ok && !nextLogin.data.url.includes("error="),
    );
    signedIn = true;
    const nextSession = await request("/api/auth/session");
    check(
      prefix + " session carries correct authority",
      nextSession.data.user?.role === role &&
        nextSession.data.user?.canApproveDiplomas === capability,
    );
    const workspace = await request("/dashboard");
    check(
      prefix + " workspace has distinct role label",
      workspace.response.ok && workspace.data.includes(label),
    );
    await checkSessionPages(prefix);
    const forbiddenApproval = await request("/api/cert/approve", {
      body: { uuid: "00000000-0000-0000-0000-000000000000" },
    });
    check(
      prefix + " approval proxy enforces business authority",
      forbiddenApproval.response.status === (capability ? 404 : 403),
    );
  }
  console.log(
    "Web/API integration checks passed: " +
      checks +
      ". Three NextAuth roles, session-dependent pages, workspace labels, permissions and HTTP 400/401/403/404 checked. No diplomas/students created; use test-headquarters-chain.mjs for ledger writes.",
  );
} finally {
  if (signedIn) {
    try {
      const csrf = await request("/api/auth/csrf");
      await request("/api/auth/signout", {
        form: {
          csrfToken: csrf.data.csrfToken,
          callbackUrl: webUrl + "/login",
          json: "true",
        },
      });
    } catch {}
  }
  for (const process of processes.reverse())
    if (process.exitCode === null) process.kill();
}
