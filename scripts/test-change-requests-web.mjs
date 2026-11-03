import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createServer as createProbe } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";

const root = fileURLToPath(new URL("../", import.meta.url));
config({ path: join(root, "apps/web/.env.local"), quiet: true });
assert(
  process.env.NEXTAUTH_SECRET,
  "NEXTAUTH_SECRET required for synthetic sessions",
);
const id = (number) =>
  "00000000-0000-4000-8000-" + String(number).padStart(12, "0");
const records = [];
const calls = [];
let failList = false;
const backend = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean);
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined;
  calls.push({
    method: request.method,
    path: url.pathname,
    body,
    token: request.headers.authorization,
  });
  response.setHeader("Content-Type", "application/json");
  const send = (data, status = 200) => {
    response.statusCode = status;
    response.end(JSON.stringify(data));
  };
  if (parts[0] !== "change-requests") return send({ error: "Not found" }, 404);
  if (parts[1] === "eligible")
    return send({
      data: [
        {
          id: id(1),
          certificateNo: "VB-TEST-01",
          registryNo: "VS-TEST-01",
          current: { fullName: "Nguyễn Văn Cũ", dob: "2002-01-01" },
          activeRequestId:
            records.find(
              (item) =>
                !["RESOLVED", "REJECTED", "CANCELLED"].includes(item.status),
            )?.id || null,
        },
      ],
    });
  if (request.method === "GET") {
    if (failList)
      return send({ message: "Không tải được danh sách kiểm thử" }, 503);
    const rows = records.filter(
      (record) =>
        !url.searchParams.get("status") ||
        record.status === url.searchParams.get("status"),
    );
    return send({ data: rows, total: rows.length, page: 1, limit: 10 });
  }
  if (parts[2] === "action") {
    const record = records.find((item) => item.id === parts[1]);
    if (!record || record.revision !== body.expectedRevision)
      return send({ message: "Yêu cầu đã thay đổi" }, 409);
    record.status = body.status;
    record.revision++;
    record.events.push({
      id: id(100 + record.revision),
      actorLabel: ["PENDING", "CANCELLED"].includes(body.status)
        ? "Sinh viên"
        : "Nhà trường",
      status: body.status,
      note: body.note,
      revision: record.revision,
      createdAt: new Date().toISOString(),
    });
    return send(record);
  }
  const record = {
    id: id(10 + records.length),
    diplomaId: body.diplomaId,
    certificateNo: "VB-TEST-01",
    registryNo: "VS-TEST-01",
    studentName: "Nguyễn Văn Cũ",
    studentCode: "SV-TEST-01",
    status: "PENDING",
    revision: 1,
    changes: body.changes.map((change) => ({
      field: change.field,
      before: "Nguyễn Văn Cũ",
      after: change.value,
    })),
    reason: body.reason,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    resolvedDiplomaId: null,
    replacement: null,
    events: [
      {
        id: id(100),
        actorLabel: "Sinh viên",
        status: "PENDING",
        note: body.reason,
        revision: 1,
        createdAt: new Date().toISOString(),
      },
    ],
  };
  records.push(record);
  send(record, 201);
});
await new Promise((done) => backend.listen(0, "127.0.0.1", done));
const probe = createProbe();
await new Promise((done) => probe.listen(0, "127.0.0.1", done));
const port = probe.address().port;
await new Promise((done) => probe.close(done));
const base = "http://localhost:" + port;
let logs = "",
  checks = 0,
  context,
  browserTemp;
const server = spawn(
  process.execPath,
  [
    join(root, "node_modules/next/dist/bin/next"),
    "start",
    "--port",
    String(port),
  ],
  {
    cwd: join(root, "apps/web"),
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      NEXTAUTH_URL: base,
      API_URL: "http://127.0.0.1:" + backend.address().port,
    },
  },
);
for (const stream of [server.stdout, server.stderr])
  stream.on("data", (data) => {
    logs = (logs + data).slice(-10000);
  });
function check(label, condition) {
  assert(condition, label);
  checks++;
}
async function cookie(role, extra = {}) {
  return encode({
    secret: process.env.NEXTAUTH_SECRET,
    maxAge: 600,
    token: {
      sub: "workdesk-test",
      id: "workdesk-test",
      name: "Tài khoản kiểm thử",
      role,
      isHeadquarters: true,
      canApproveDiplomas: role === "university",
      accessToken: "isolated-workdesk-token",
      accessTokenExpires: Date.now() + 600000,
      ...extra,
    },
  });
}
async function request(route, session, method = "GET", body) {
  return fetch(base + route, {
    method,
    redirect: "manual",
    headers: {
      "Content-Type": "application/json",
      ...(session ? { Cookie: "next-auth.session-token=" + session } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      if ((await fetch(base + "/login")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert(ready, logs);
  const student = await cookie("student"),
    officer = await cookie("university");
  check(
    "anonymous request proxy denied",
    (await request("/api/change-requests")).status === 401,
  );
  for (const session of [
    await cookie("admin"),
    await cookie("employer"),
    await cookie("university", { isHeadquarters: false }),
    await cookie("university", { canApproveDiplomas: false }),
  ])
    check(
      "non-business roles blocked",
      (await request("/api/change-requests", session)).status === 403,
    );
  check("blocked calls never reach backend", calls.length === 0);
  check(
    "student request list admitted",
    (await request("/api/change-requests", student)).ok,
  );
  check(
    "officer request list admitted",
    (await request("/api/change-requests", officer)).ok,
  );
  check(
    "bearer forwarded",
    calls.at(-1).token === "Bearer isolated-workdesk-token",
  );
  check(
    "officer cannot submit a student request",
    (await request("/api/change-requests", officer, "POST", {})).status === 400,
  );
  check(
    "proxy path whitelist",
    (await request("/api/change-requests/private-route", student)).status ===
      400,
  );
  check(
    "request data never cached",
    (await request("/api/change-requests", student)).headers
      .get("cache-control")
      .includes("no-store"),
  );
  for (const [route, session] of [
    ["/student/requests", officer],
    ["/diploma-records/requests", student],
  ]) {
    const response = await request(route, session),
      html = await response.text();
    check(
      "cross-role page redirects: " + route,
      (response.status >= 300 && response.status < 400) ||
        html.includes("NEXT_REDIRECT") ||
        /http-equiv="refresh"/i.test(html),
    );
  }
  if (process.env.WORKDESK_BROWSER_MODULE) {
    const { chromium } = await import(
      pathToFileURL(resolve(process.env.WORKDESK_BROWSER_MODULE))
    );
    browserTemp = await mkdtemp(
      join(tmpdir(), "diplomachain-requests-browser-"),
    );
    context = await chromium.launchPersistentContext(
      join(browserTemp, "profile"),
      {
        headless: true,
        executablePath: process.env.WORKDESK_BROWSER_EXECUTABLE,
        viewport: { width: 1440, height: 1050 },
        locale: "vi-VN",
      },
    );
    async function login(session) {
      await context.clearCookies();
      await context.addCookies([
        { name: "next-auth.session-token", value: session, url: base },
      ]);
    }
    await login(student);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    async function go(route) {
      await Promise.all([
        page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === "/api/change-requests",
        ),
        page.goto(base + route),
      ]);
      await page.waitForFunction(
        () => document.querySelectorAll(".ant-btn-loading").length === 0,
      );
    }
    await go("/student/requests");
    await page
      .getByRole("button", { name: "Gửi yêu cầu", exact: true })
      .click();
    let dialog = page.getByRole("dialog");
    await dialog.getByLabel("Văn bằng", { exact: true }).click();
    await page.getByTitle("VB-TEST-01 · VS-TEST-01", { exact: true }).click();
    await dialog.getByLabel("Thông tin cần chỉnh sửa", { exact: true }).click();
    await page.getByTitle("Họ và tên", { exact: true }).click();
    await dialog
      .getByLabel("Họ và tên đề nghị", { exact: true })
      .fill("Nguyễn Văn Đúng");
    await dialog
      .getByLabel("Lý do và căn cứ đối chiếu", { exact: true })
      .fill("Đối chiếu thông tin với giấy khai sinh bản gốc.");
    await dialog
      .getByRole("button", { name: "Gửi yêu cầu", exact: true })
      .click();
    await dialog.waitFor({ state: "hidden" });
    await page.locator('tr[data-row-key="' + id(10) + '"]').waitFor();
    check(
      "student submits selected fields only",
      calls.some(
        (call) =>
          call.method === "POST" &&
          call.path === "/change-requests" &&
          call.body.changes.length === 1 &&
          call.body.changes[0].value === "Nguyễn Văn Đúng",
      ),
    );
    await page.getByRole("button", { name: "Chi tiết", exact: true }).click();
    const drawer = page.getByRole("dialog");
    await drawer.getByText("Nguyễn Văn Đúng", { exact: true }).waitFor();
    check(
      "student cannot see staff action",
      (await drawer
        .getByRole("button", { name: "Tiếp nhận xử lý", exact: true })
        .count()) === 0,
    );
    await login(officer);
    await go("/diploma-records/requests");
    await page.getByRole("button", { name: "Chi tiết", exact: true }).click();
    await page
      .getByRole("button", { name: "Tiếp nhận xử lý", exact: true })
      .click();
    dialog = page.getByRole("dialog").filter({
      has: page.getByLabel("Ý kiến xử lý và căn cứ", { exact: true }),
    });
    await dialog
      .getByLabel("Ý kiến xử lý và căn cứ", { exact: true })
      .fill("Đã tiếp nhận và đang đối chiếu hồ sơ.");
    await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page
      .getByRole("button", { name: "Yêu cầu bổ sung", exact: true })
      .waitFor();
    check(
      "staff transition includes revision token",
      calls.some(
        (call) =>
          call.body?.status === "IN_REVIEW" && call.body.expectedRevision === 1,
      ),
    );
    check(
      "cannot complete without replacement",
      await page
        .getByRole("button", {
          name: "Hoàn tất bằng văn bằng thay thế",
          exact: true,
        })
        .isDisabled(),
    );
    check(
      "existing replacement flow remains reachable",
      (await page
        .getByRole("link", { name: "Hồ sơ thay thế", exact: true })
        .getAttribute("href")) === "/pending?view=replacements",
    );
    await page
      .getByRole("button", { name: "Yêu cầu bổ sung", exact: true })
      .click();
    dialog = page.getByRole("dialog").filter({
      has: page.getByLabel("Ý kiến xử lý và căn cứ", { exact: true }),
    });
    await dialog
      .getByLabel("Ý kiến xử lý và căn cứ", { exact: true })
      .fill("Cần bổ sung số văn bản đối chiếu.");
    await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await login(student);
    await go("/student/requests");
    await page.getByRole("button", { name: "Chi tiết", exact: true }).click();
    await page
      .getByText("Cần bổ sung số văn bản đối chiếu.", { exact: true })
      .waitFor();
    await page
      .getByRole("button", { name: "Gửi thông tin bổ sung", exact: true })
      .click();
    dialog = page.getByRole("dialog").filter({
      has: page.getByLabel("Nội dung gửi nhà trường", { exact: true }),
    });
    await dialog
      .getByLabel("Nội dung gửi nhà trường", { exact: true })
      .fill("Số văn bản đối chiếu: 12/KT.");
    await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    check(
      "student supplementary response includes fresh revision",
      calls.some(
        (call) =>
          call.body?.status === "PENDING" && call.body.expectedRevision === 3,
      ),
    );
    await page.locator(".ant-drawer-close").click();
    failList = true;
    await page.getByRole("button", { name: "Tải lại", exact: true }).click();
    await page
      .getByText("Không tải được danh sách kiểm thử", { exact: true })
      .waitFor();
    check(
      "load errors do not silently erase records",
      await page.locator('tr[data-row-key="' + id(10) + '"]').isVisible(),
    );
    failList = false;
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(300);
    check(
      "student mobile has no page overflow",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await login(officer);
    await go("/diploma-records/requests");
    await page.locator('tr[data-row-key="' + id(10) + '"]').waitFor();
    check(
      "staff mobile has no page overflow",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    check("no browser runtime errors", errors.length === 0);
  }
} catch (error) {
  const active = context?.pages().at(-1);
  if (active)
    console.error(
      "Synthetic test DOM:",
      await active.locator("body").innerText(),
      "Recent calls:",
      calls.slice(-5),
    );
  throw error;
} finally {
  await context?.close();
  if (browserTemp) {
    const within = relative(resolve(tmpdir()), resolve(browserTemp));
    assert(
      within &&
        !within.startsWith("..") &&
        !isAbsolute(within) &&
        browserTemp.includes("diplomachain-requests-browser-"),
    );
    await rm(browserTemp, { recursive: true, force: true, maxRetries: 3 });
  }
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await Promise.race([exited, delay(5000)]);
  }
  await new Promise((done) => backend.close(done));
}
console.log(
  "PASS: " +
    checks +
    " request proxy / browser checks; synthetic backend only.",
);
