import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createServer as createProbe } from "node:net";
import { mkdtemp, rm, realpath } from "node:fs/promises";
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
let studentVersion = "a".repeat(64),
  failList = false,
  recovered = false;
const receipts = new Map(),
  calls = [];
function inbox(role) {
  const groups =
    role === "student"
      ? [
          {
            key: "student-supplement",
            title: "Nhà trường yêu cầu bổ sung thông tin",
            count: 1,
            href: "/student/requests?status=NEEDS_INFORMATION",
            fingerprint: studentVersion,
            severity: "warning",
          },
        ]
      : [
          {
            key: "blockchain-failed",
            title: "Giao dịch blockchain cần kiểm tra",
            count: 1,
            href: "/explorer",
            fingerprint: "c".repeat(64),
            severity: "error",
          },
          ...(role === "university"
            ? [
                {
                  key: "requests",
                  title: "Yêu cầu chỉnh sửa cần xử lý",
                  count: 2,
                  href: "/diploma-records/requests",
                  fingerprint: "d".repeat(64),
                  severity: "info",
                },
              ]
            : []),
        ];
  const items = groups
    .filter((group) => !recovered || group.key !== "blockchain-failed")
    .map((group) => ({
      ...group,
      read: receipts.get(role + ":" + group.key) === group.fingerprint,
    }));
  return {
    items,
    unread: items.filter((item) => !item.read).length,
    totalTasks: items.reduce((sum, item) => sum + item.count, 0),
    generatedAt: new Date().toISOString(),
  };
}
const backend = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost"),
    role = request.headers.authorization
      ?.replace("Bearer inbox-", "")
      .replace("-token", "");
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : undefined;
  calls.push({
    path: url.pathname,
    search: url.search,
    method: request.method,
    role,
    body,
  });
  response.setHeader("Content-Type", "application/json");
  const send = (data, status = 200) => {
    response.statusCode = status;
    response.end(JSON.stringify(data));
  };
  if (url.pathname.startsWith("/change-requests"))
    return send({ data: [], total: 0, page: 1, limit: 10 });
  if (url.pathname === "/inbox" && failList)
    return send({ message: "Mất kết nối kiểm thử thông báo" }, 503);
  if (url.pathname === "/inbox") return send(inbox(role));
  if (url.pathname === "/inbox/read") {
    const item = inbox(role).items.find(
      (entry) =>
        entry.key === body.key && entry.fingerprint === body.fingerprint,
    );
    if (!item)
      return send(
        { message: "Công việc đã thay đổi. Hãy tải lại thông báo." },
        409,
      );
    receipts.set(role + ":" + body.key, body.fingerprint);
    return send(inbox(role));
  }
  return send({ message: "Not found" }, 404);
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
    "--hostname",
    "127.0.0.1",
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
      sub: "inbox-test",
      id: "inbox-test",
      name: "Tài khoản kiểm thử",
      role,
      isHeadquarters: true,
      canApproveDiplomas: role === "university",
      accessToken: "inbox-" + role + "-token",
      accessTokenExpires: Date.now() + 600000,
      ...extra,
    },
  });
}
async function request(route, session, method = "GET", body) {
  return fetch(base + route, {
    method,
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
    officer = await cookie("university"),
    admin = await cookie("admin");
  check("anonymous list blocked", (await request("/api/inbox")).status === 401);
  check(
    "anonymous read blocked",
    (await request("/api/inbox/read", null, "POST", {})).status === 401,
  );
  for (const session of [
    await cookie("employer"),
    await cookie("university", { isHeadquarters: false }),
    await cookie("university", { canApproveDiplomas: false }),
  ])
    check(
      "unapproved role blocked",
      (await request("/api/inbox", session)).status === 403,
    );
  check("forbidden roles never reach backend", calls.length === 0);
  for (const [label, session] of [
    ["student", student],
    ["officer", officer],
    ["admin", admin],
  ])
    check(label + " list allowed", (await request("/api/inbox", session)).ok);
  check(
    "private notification response never cached",
    (await request("/api/inbox", student)).headers
      .get("cache-control")
      .includes("no-store"),
  );
  check(
    "proxy rejects arbitrary endpoints",
    (await request("/api/inbox/other", student)).status === 400,
  );
  check(
    "proxy preserves upstream stale conflict",
    (
      await request("/api/inbox/read", student, "POST", {
        key: "requests",
        fingerprint: "0".repeat(64),
      })
    ).status === 409,
  );
  if (process.env.WORKDESK_BROWSER_MODULE) {
    const { chromium } = await import(
      pathToFileURL(resolve(process.env.WORKDESK_BROWSER_MODULE))
    );
    browserTemp = await mkdtemp(join(tmpdir(), "diplomachain-inbox-browser-"));
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
          (response) => new URL(response.url()).pathname === "/api/inbox",
        ),
        page.goto(base + route),
      ]);
      await page.waitForFunction(
        () => document.querySelectorAll(".ant-btn-loading").length === 0,
      );
    }
    await go("/student/requests");
    await page
      .getByRole("button", { name: "Thông báo công việc", exact: true })
      .click();
    let drawer = page.getByRole("dialog");
    await drawer
      .getByText("Nhà trường yêu cầu bổ sung thông tin", { exact: true })
      .waitFor();
    check(
      "student sees unread summary",
      await drawer.getByText("1 nhóm chưa đọc", { exact: true }).isVisible(),
    );
    check(
      "student sees no technical group",
      (await drawer
        .getByText("Giao dịch blockchain cần kiểm tra", { exact: true })
        .count()) === 0,
    );
    await drawer
      .getByRole("button", { name: "Đánh dấu đã đọc", exact: true })
      .click();
    await drawer.getByText("Đã đọc", { exact: true }).waitFor();
    check(
      "read group remains visible",
      await drawer
        .getByText("Nhà trường yêu cầu bổ sung thông tin", { exact: true })
        .isVisible(),
    );
    await go("/student/requests");
    await page
      .getByRole("button", { name: "Thông báo công việc", exact: true })
      .click();
    drawer = page.getByRole("dialog");
    await drawer.getByText("Đã đọc", { exact: true }).waitFor();
    check(
      "read state persists after browser reload",
      receipts.get("student:student-supplement") === studentVersion,
    );
    studentVersion = "b".repeat(64);
    await drawer.getByRole("button", { name: "Cập nhật", exact: true }).click();
    await drawer.getByText("Chưa đọc", { exact: true }).waitFor();
    check(
      "new fingerprint becomes unread at same count",
      await drawer.getByText("1 nhóm chưa đọc", { exact: true }).isVisible(),
    );
    await drawer
      .getByRole("button", { name: "Xem công việc", exact: true })
      .click();
    await page.waitForURL("**/student/requests?status=NEEDS_INFORMATION");
    await page.getByText("Cần bổ sung", { exact: true }).waitFor();
    check(
      "notification opens matching status filter",
      calls.some(
        (call) =>
          call.path === "/change-requests" &&
          call.search.includes("status=NEEDS_INFORMATION"),
      ),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Thông báo công việc", exact: true })
      .click();
    drawer = page.getByRole("dialog");
    await drawer.getByText("Đã đọc", { exact: true }).waitFor();
    await page.waitForFunction(() => {
      const bounds = document
        .querySelector('[role="dialog"]')
        ?.getBoundingClientRect();
      return (
        bounds &&
        bounds.width <= innerWidth &&
        bounds.left >= 0 &&
        bounds.right <= innerWidth + 1
      );
    });
    const drawerBounds = await drawer.boundingBox();
    check(
      "mobile drawer stays fully inside viewport",
      drawerBounds.width <= 390 && drawerBounds.x + drawerBounds.width <= 391,
    );
    check(
      "student mobile page has no overflow",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    if (process.env.WORKDESK_TEST_PREVIEW_DIR) {
      const output = await realpath(process.env.WORKDESK_TEST_PREVIEW_DIR),
        within = relative(await realpath(tmpdir()), output);
      assert(within && !within.startsWith("..") && !isAbsolute(within));
      await page.screenshot({
        path: join(output, "inbox-student-mobile.png"),
        fullPage: true,
      });
    }
    await login(officer);
    await page.setViewportSize({ width: 1440, height: 1050 });
    await go("/diploma-records/requests");
    await page
      .getByRole("button", { name: "Thông báo công việc", exact: true })
      .click();
    drawer = page.getByRole("dialog");
    await drawer
      .getByText("Giao dịch blockchain cần kiểm tra", { exact: true })
      .waitFor();
    check(
      "officer sees independent unread groups",
      await drawer.getByText("2 nhóm chưa đọc", { exact: true }).isVisible(),
    );
    failList = true;
    await drawer.getByRole("button", { name: "Cập nhật", exact: true }).click();
    await drawer
      .getByText("Chưa cập nhật được thông báo", { exact: true })
      .waitFor();
    check(
      "load failure preserves existing notification groups",
      await drawer
        .getByText("Giao dịch blockchain cần kiểm tra", { exact: true })
        .isVisible(),
    );
    failList = false;
    recovered = true;
    await drawer.getByRole("button", { name: "Cập nhật", exact: true }).click();
    await drawer
      .getByText("Giao dịch blockchain cần kiểm tra", { exact: true })
      .waitFor({ state: "detached" });
    check(
      "resolved tasks disappear on refresh",
      await drawer
        .getByText("Yêu cầu chỉnh sửa cần xử lý", { exact: true })
        .isVisible(),
    );
    if (process.env.WORKDESK_TEST_PREVIEW_DIR)
      await page.screenshot({
        path: join(
          await realpath(process.env.WORKDESK_TEST_PREVIEW_DIR),
          "inbox-officer-desktop.png",
        ),
        fullPage: true,
      });
    check("no browser runtime errors", errors.length === 0);
  }
} catch (error) {
  const active = context?.pages().at(-1);
  if (active)
    console.error(
      "Synthetic inbox DOM:",
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
        browserTemp.includes("diplomachain-inbox-browser-"),
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
  "PASS: " + checks + " inbox proxy / browser checks; synthetic backend only.",
);
