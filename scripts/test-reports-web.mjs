import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { createServer as createProbe } from "node:net";
import { mkdtemp, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";

const root = fileURLToPath(new URL("../", import.meta.url));
config({ path: join(root, "apps/web/.env.local"), quiet: true });
assert(
  process.env.NEXTAUTH_SECRET,
  "NEXTAUTH_SECRET is required for isolated sessions",
);
const requests = [],
  attachment = Buffer.from("ISOLATED_REPORT_DOWNLOAD");
const summary = { total: 3, active: 1, revoked: 1, replaced: 1 };
const report = {
  institutionName: "Trường kiểm thử",
  generatedAt: "2026-11-03T02:00:00Z",
  filters: "Tất cả văn bằng đã phát hành",
  summary,
  byYear: [{ name: "2024", ...summary }],
  byMajor: [{ name: "Ngành kiểm thử", ...summary }],
  byGrade: [{ name: "Khá", ...summary }],
  byStatus: [
    { name: "ON_CHAIN", total: 1, active: 1, revoked: 0, replaced: 0 },
  ],
};
const backend = createServer((request, response) => {
  const url = new URL(request.url, "http://localhost");
  if (url.pathname.startsWith("/reports/"))
    requests.push({
      path: url.pathname,
      params: url.searchParams,
      authorization: request.headers.authorization,
    });
  response.setHeader("Content-Type", "application/json");
  if (url.pathname === "/reports/overview") {
    response.end(JSON.stringify(report));
  } else if (url.pathname === "/reports/export") {
    if (url.searchParams.get("format") === "csv") {
      response.statusCode = 400;
      response.end(JSON.stringify({ message: ["Định dạng không hợp lệ"] }));
      return;
    }
    const format = url.searchParams.get("format") || "xlsx";
    response.setHeader(
      "Content-Type",
      format === "pdf"
        ? "application/pdf"
        : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    response.setHeader(
      "Content-Disposition",
      'attachment; filename="BaoCao_Test.' + format + '"',
    );
    response.end(attachment);
  } else if (url.pathname === "/cert/register")
    response.end(
      JSON.stringify({
        data: [
          {
            uuid: "00000000-0000-4000-8000-000000000001",
            fullName: "Nguyễn Văn Kiểm Thử",
            mssv: "0012345678",
            status: "ON_CHAIN",
            soHieu: "TEST-RPT-1",
            documentStatus: "ACTIVE",
          },
        ],
        pagination: { total: 1, page: 1, limit: 20, totalPages: 1 },
      }),
    );
  else {
    response.statusCode = 503;
    response.end(
      JSON.stringify({ message: "Isolated fixture: no business database" }),
    );
  }
});
await new Promise((ok) => backend.listen(0, "127.0.0.1", ok));
const probe = createProbe();
await new Promise((ok) => probe.listen(0, "127.0.0.1", ok));
const port = probe.address().port;
await new Promise((ok) => probe.close(ok));
const base = "http://localhost:" + port;
let logs = "";
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
  stream.on("data", (chunk) => {
    logs = (logs + chunk).slice(-8000);
  });
let checks = 0,
  context,
  browserTemp;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
async function cookie(flags = {}) {
  return await encode({
    secret: process.env.NEXTAUTH_SECRET,
    maxAge: 300,
    token: {
      sub: "isolated-report-user",
      id: "isolated-report-user",
      name: "Cán bộ kiểm thử",
      role: "university",
      org: "ORG2",
      isHeadquarters: true,
      canApproveDiplomas: true,
      accessToken: "isolated-report-token",
      accessTokenExpires: Date.now() + 300000,
      ...flags,
    },
  });
}
async function request(route, session) {
  return fetch(base + route, {
    headers: session ? { Cookie: "next-auth.session-token=" + session } : {},
    redirect: "manual",
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
  assert(ready, "Isolated web server failed to start: " + logs);
  const officer = await cookie();
  for (const action of ["overview", "export"]) {
    check(
      "anonymous report proxy denied " + action,
      (await request("/api/reports/" + action)).status === 401,
    );
    for (const flags of [
      { role: "student" },
      { role: "employer" },
      { isHeadquarters: false },
      { canApproveDiplomas: false },
    ])
      check(
        "role denied " + action + JSON.stringify(flags),
        (await request("/api/reports/" + action, await cookie(flags)))
          .status === 403,
      );
  }
  check("rejected sessions never reached backend", requests.length === 0);
  const overview = await request(
    "/api/reports/overview?year=2024&grade=" + encodeURIComponent("Khá"),
    officer,
  );
  check(
    "overview proxy preserves real summary",
    overview.ok && (await overview.json()).summary.total === 3,
  );
  check(
    "overview is private and uncached",
    overview.headers.get("cache-control").includes("no-store"),
  );
  check(
    "validated filters and isolated bearer token forwarded",
    requests.at(-1).params.get("grade") === "Khá" &&
      requests.at(-1).authorization === "Bearer isolated-report-token",
  );
  for (const format of ["xlsx", "pdf"]) {
    const download = await request(
      "/api/reports/export?kind=register&format=" + format + "&year=2024",
      officer,
    );
    check(
      "binary download intact " + format,
      download.ok &&
        Buffer.from(await download.arrayBuffer()).equals(attachment),
    );
    check(
      "attachment filename and cache protection " + format,
      download.headers
        .get("content-disposition")
        .includes("BaoCao_Test." + format) &&
        download.headers.get("cache-control").includes("no-store"),
    );
  }
  check(
    "admin may read scoped reports",
    (await request("/api/reports/overview", await cookie({ role: "admin" })))
      .ok,
  );
  check(
    "unknown report action is not proxied",
    (await request("/api/reports/unknown", officer)).status === 404,
  );
  check(
    "backend validation status preserved",
    (await request("/api/reports/export?format=csv", officer)).status === 400,
  );
  const dashboard = await request("/dashboard", officer);
  const html = await dashboard.text();
  for (const label of [
    "Báo cáo thống kê",
    "Xuất báo cáo Excel",
    "Xuất báo cáo PDF",
  ])
    check(
      "dashboard renders control " + label,
      dashboard.ok && html.includes(label),
    );
  const register = await request("/certificates", officer);
  const registerHtml = await register.text();
  check(
    "register includes both export controls",
    register.ok &&
      registerHtml.includes("Xuất Excel") &&
      registerHtml.includes("Xuất sổ PDF"),
  );
  if (process.env.REPORT_BROWSER_MODULE) {
    const { chromium } = await import(
      pathToFileURL(resolve(process.env.REPORT_BROWSER_MODULE))
    );
    browserTemp = await mkdtemp(join(tmpdir(), "diplomachain-report-browser-"));
    context = await chromium.launchPersistentContext(
      join(browserTemp, "profile"),
      {
        headless: true,
        executablePath: process.env.REPORT_BROWSER_EXECUTABLE,
        downloadsPath: join(browserTemp, "downloads"),
        viewport: { width: 1440, height: 1100 },
        locale: "vi-VN",
        timezoneId: "Asia/Ho_Chi_Minh",
      },
    );
    await context.addCookies([
      { name: "next-auth.session-token", value: officer, url: base },
    ]);
    const page = await context.newPage();
    const failures = [];
    page.on("pageerror", (error) => failures.push(error.message));
    await page.goto(base + "/dashboard");
    await page
      .getByRole("button", { name: "Xuất báo cáo Excel", exact: true })
      .waitFor();
    await page.getByLabel("Năm tốt nghiệp báo cáo").fill("2024");
    const filteredResponse = page.waitForResponse(
      (response) =>
        response.url().includes("/api/reports/overview?") &&
        response.url().includes("year=2024"),
    );
    await page
      .getByRole("button", { name: "Xem báo cáo", exact: true })
      .click();
    await filteredResponse;
    await page
      .getByRole("button", { name: "Xuất báo cáo Excel", exact: true })
      .waitFor({ state: "visible" });
    await page.getByLabel("Năm tốt nghiệp báo cáo").fill("2025");
    const downloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Xuất báo cáo Excel", exact: true })
      .click();
    const download = await downloadEvent;
    check(
      "browser downloads requested report",
      download.suggestedFilename() === "BaoCao_Test.xlsx" &&
        (await readFile(await download.path())).equals(attachment),
    );
    check(
      "browser download uses applied filters",
      requests
        .filter((item) => item.path === "/reports/export")
        .at(-1)
        .params.get("year") === "2024",
    );
    await page.getByLabel("Năm tốt nghiệp báo cáo").fill("2024");
    const pdfEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Xuất báo cáo PDF", exact: true })
      .click();
    const pdfDownload = await pdfEvent;
    check(
      "statistics PDF button downloads PDF",
      pdfDownload.suggestedFilename() === "BaoCao_Test.pdf" &&
        requests
          .filter((item) => item.path === "/reports/export")
          .at(-1)
          .params.get("kind") === "statistics",
    );
    await page.getByRole("tab", { name: "Theo ngành", exact: true }).click();
    await page.getByText("Ngành kiểm thử", { exact: true }).waitFor();
    check(
      "group tabs show report data",
      await page.getByText("Ngành kiểm thử", { exact: true }).isVisible(),
    );
    if (process.env.REPORT_TEST_PREVIEW_DIR) {
      const output = await realpath(process.env.REPORT_TEST_PREVIEW_DIR);
      const within = relative(await realpath(tmpdir()), output);
      assert(within && !within.startsWith("..") && !isAbsolute(within));
      await page
        .getByText("Báo cáo thống kê", { exact: true })
        .scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(output, "reports-desktop.png") });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.waitForFunction(
        () =>
          document.querySelector(".ant-layout-sider")?.getBoundingClientRect()
            .width <= 1,
      );
      await page
        .getByText("Báo cáo thống kê", { exact: true })
        .scrollIntoViewIfNeeded();
      check(
        "mobile report does not overflow viewport",
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
      );
      await page.screenshot({ path: join(output, "reports-mobile.png") });
    }
    await page.goto(base + "/certificates");
    await page.getByText("Nguyễn Văn Kiểm Thử", { exact: true }).waitFor();
    const registerDownloadEvent = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Xuất sổ PDF", exact: true })
      .click();
    const registerDownload = await registerDownloadEvent;
    check(
      "register PDF button uses register endpoint",
      registerDownload.suggestedFilename() === "BaoCao_Test.pdf" &&
        requests
          .filter((item) => item.path === "/reports/export")
          .at(-1)
          .params.get("kind") === "register",
    );
    check("no browser runtime errors", failures.length === 0);
  }
} finally {
  await context?.close();
  if (browserTemp) {
    const absolute = resolve(browserTemp);
    const within = relative(resolve(tmpdir()), absolute);
    assert(within && !within.startsWith("..") && !isAbsolute(within));
    assert(absolute.includes("diplomachain-report-browser-"));
    await rm(absolute, { recursive: true, force: true });
  }
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await Promise.race([exited, delay(5000)]);
  }
  await new Promise((ok) => backend.close(ok));
}
console.log(
  "Report production proxy/UI checks passed: " +
    checks +
    ". Isolated synthetic backend only.",
);
