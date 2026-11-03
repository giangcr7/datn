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
import { tsImport } from "tsx/esm/api";

const root = fileURLToPath(new URL("../", import.meta.url));
config({ path: join(root, "apps/web/.env.local"), quiet: true });
assert(
  process.env.NEXTAUTH_SECRET,
  "NEXTAUTH_SECRET is required for isolated test sessions",
);
const { batchPublishEntries, issuanceRowHref } = await tsImport(
  "../apps/web/src/lib/issuance-batches.ts",
  import.meta.url,
);
const { canAccessWorkspacePath } = await tsImport(
  "../apps/web/src/lib/workspace-access.ts",
  import.meta.url,
);
const id = (number) =>
  "00000000-0000-4000-8000-" + String(number).padStart(12, "0");
const original = {
  id: id(1),
  code: "TEST_2024",
  name: "Đợt kiểm thử đã có",
  graduationYear: 2024,
  decisionNo: "123/QĐ-KT",
  decisionDate: "2024-06-01",
  programName: null,
  createdBy: "Cán bộ kiểm thử",
};
const makeRow = (number, invalid = false) => ({
  uuid: id(10 + number),
  fullName: "Nguyễn Văn Kiểm Thử " + number,
  mssv: "000" + number,
  soHieu: "VB-" + number,
  soVaoSo: "VS-" + number,
  major: "Xây dựng",
  batchState: "DRAFT",
  status: "DRAFT",
  updatedAt: "2026-11-03T01:00:00.000Z",
  reviewToken: "a".repeat(64),
  ready: !invalid,
  removable: true,
  checkErrors: invalid ? ["Ngày cấp chưa hợp lệ với hồ sơ tốt nghiệp"] : [],
  sourceBatchId: id(80),
  sourceRowId: id(90 + number),
});
const first = makeRow(1),
  invalid = makeRow(2, true),
  candidate = makeRow(3);
const allRows = [first, invalid, candidate];
const batches = [original],
  members = new Map([[original.id, [first, invalid]]]);
const requests = [];
let failPublication = false;
function summary(rows) {
  return {
    total: rows.length,
    DRAFT: rows.filter((row) => row.batchState === "DRAFT").length,
    PENDING: 0,
    REJECTED: 0,
    ANCHOR_PENDING: rows.filter((row) => row.batchState === "ANCHOR_PENDING")
      .length,
    ANCHOR_FAILED: 0,
    ON_CHAIN: 0,
    REVOKED: 0,
    REPLACED: 0,
    ready: rows.filter((row) => row.ready).length,
    needsReview: rows.filter((row) => row.checkErrors.length).length,
  };
}
const backend = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean).slice(2);
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = chunks.length
    ? JSON.parse(Buffer.concat(chunks).toString())
    : undefined;
  requests.push({
    path: url.pathname,
    params: url.searchParams,
    method: request.method,
    authorization: request.headers.authorization,
    body,
  });
  response.setHeader("Content-Type", "application/json");
  function send(value) {
    response.end(JSON.stringify(value));
  }
  if (!url.pathname.startsWith("/cert/issuance-batches")) {
    response.statusCode = 503;
    send({ message: "Isolated synthetic backend" });
    return;
  }
  if (parts[0] === "options") {
    send({
      decisions: [
        {
          id: id(70),
          documentNumber: "123/QĐ-KT",
          decisionYear: 2024,
          signedOn: "2024-06-01",
          graduationYears: [2024],
        },
      ],
      programs: [{ id: id(71), code: "XD", name: "Xây dựng" }],
    });
    return;
  }
  if (!parts.length) {
    if (request.method === "POST") {
      const batch = {
        ...original,
        ...body,
        id: id(2),
        decisionNo: original.decisionNo,
      };
      batches.push(batch);
      members.set(batch.id, []);
      send({ success: true, data: batch });
    } else
      send({
        data: batches.map((batch) => ({
          ...batch,
          summary: summary(members.get(batch.id)),
        })),
        pagination: {
          total: batches.length,
          page: 1,
          limit: 20,
          totalPages: 1,
        },
      });
    return;
  }
  const batch = batches.find((value) => value.id === parts[0]);
  if (!batch) {
    response.statusCode = 404;
    send({ message: "Không tìm thấy đợt" });
    return;
  }
  let rows = members.get(batch.id);
  if (parts[1] === "candidates") {
    const candidates = allRows.filter(
      (row) => ![...members.values()].some((list) => list.includes(row)),
    );
    send({ data: candidates, pagination: { total: candidates.length } });
    return;
  }
  if (parts[1] === "members") {
    if (parts[2] === "remove")
      members.set(
        batch.id,
        rows.filter((row) => !body.diplomaIds.includes(row.uuid)),
      );
    else
      members.set(batch.id, [
        ...rows,
        ...allRows.filter((row) => body.diplomaIds.includes(row.uuid)),
      ]);
    send({ success: true, changed: body.diplomaIds.length });
    return;
  }
  if (parts[1] === "publish") {
    if (failPublication) {
      response.statusCode = 503;
      send({ message: "Kết nối bị gián đoạn khi ký" });
      return;
    }
    const results = body.entries.map((entry, index) => {
      const row = rows.find((value) => value.uuid === entry.uuid);
      if (index === 0) {
        row.batchState = "ANCHOR_PENDING";
        row.ready = false;
        row.removable = false;
        return { uuid: row.uuid, success: true, status: "ANCHOR_PENDING" };
      }
      return {
        uuid: row.uuid,
        success: false,
        error: "Hồ sơ đã thay đổi sau khi kiểm tra",
      };
    });
    send({ success: true, results });
    return;
  }
  const status = url.searchParams.get("status");
  const filtered = rows.filter(
    (row) =>
      !status ||
      (status === "READY"
        ? row.ready
        : status === "NEEDS_REVIEW"
          ? row.checkErrors.length
          : row.batchState === status),
  );
  send({
    batch,
    summary: summary(rows),
    data: filtered,
    checkedAt: "2026-11-03T01:00:00Z",
    pagination: { total: filtered.length, page: 1, limit: 20, totalPages: 1 },
  });
});
await new Promise((ok) => backend.listen(0, "127.0.0.1", ok));
const probe = createProbe();
await new Promise((ok) => probe.listen(0, "127.0.0.1", ok));
const port = probe.address().port;
await new Promise((ok) => probe.close(ok));
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
async function cookie(flags = {}) {
  return encode({
    secret: process.env.NEXTAUTH_SECRET,
    maxAge: 300,
    token: {
      sub: "isolated-issuance-user",
      id: "isolated-issuance-user",
      name: "Cán bộ kiểm thử",
      role: "university",
      isHeadquarters: true,
      canApproveDiplomas: true,
      accessToken: "isolated-issuance-token",
      accessTokenExpires: Date.now() + 300000,
      ...flags,
    },
  });
}
async function request(route, session, method = "GET", body) {
  return fetch(base + route, {
    redirect: "manual",
    method,
    headers: {
      ...(session ? { Cookie: "next-auth.session-token=" + session } : {}),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw Error(logs);
    try {
      if ((await fetch(base + "/login")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(250);
  }
  assert(ready, logs);
  const officer = await cookie();
  const api = "/api/cert/issuance-batches";
  check("anonymous proxy is rejected", (await request(api)).status === 401);
  for (const flags of [
    { role: "admin" },
    { role: "student" },
    { role: "employer" },
    { isHeadquarters: false },
    { canApproveDiplomas: false },
  ]) {
    const session = await cookie(flags);
    check(
      "proxy denies role " + JSON.stringify(flags),
      (await request(api, session)).status === 403,
    );
    check(
      "proxy denies mutation " + JSON.stringify(flags),
      (
        await request(api + "/" + original.id + "/members", session, "POST", {
          diplomaIds: [candidate.uuid],
        })
      ).status === 403,
    );
    const accessResponse = await request("/diploma-records/batches", session);
    const accessHtml = await accessResponse.text();
    check(
      "page does not admit unauthorized role " + JSON.stringify(flags),
      (accessResponse.status >= 300 && accessResponse.status < 400) ||
        ((accessHtml.includes("NEXT_REDIRECT") ||
          /http-equiv="refresh"/i.test(accessHtml)) &&
          !accessHtml.includes("Lập đợt cấp văn bằng")),
    );
  }
  check("unauthorized requests do not reach backend", requests.length === 0);
  const response = await request(api + "?search=TEST_2024", officer);
  check(
    "authorized proxy returns actual backend response",
    response.ok && (await response.json()).data[0].id === original.id,
  );
  check(
    "private response is never cached",
    response.headers.get("cache-control").includes("no-store"),
  );
  check(
    "proxy preserves search and bearer token",
    requests.at(-1).params.get("search") === "TEST_2024" &&
      requests.at(-1).authorization === "Bearer isolated-issuance-token",
  );
  check(
    "approver can access nested batch page",
    canAccessWorkspacePath(
      { role: "university", isHeadquarters: true, canApproveDiplomas: true },
      "/diploma-records/batches",
    ),
  );
  check(
    "publish body includes checked timestamp",
    batchPublishEntries([first])[0].expectedUpdatedAt === first.updatedAt,
  );
  for (const rows of [[], [invalid], [first, first]]) {
    let rejected = false;
    try {
      batchPublishEntries(rows);
    } catch {
      rejected = true;
    }
    check("unsafe publish selection is rejected", rejected);
  }
  check(
    "repair link targets the exact source row",
    issuanceRowHref(invalid).includes("rowId=" + invalid.sourceRowId),
  );
  check(
    "blockchain failure routes to reconciliation",
    issuanceRowHref({ ...first, batchState: "ANCHOR_FAILED" }) === "/explorer",
  );
  check(
    "issued document routes to the register",
    issuanceRowHref({ ...first, batchState: "ON_CHAIN" }) === "/certificates",
  );
  const html = await (
    await request("/diploma-records/batches", officer)
  ).text();
  check(
    "production page renders batch controls",
    html.includes("Lập đợt cấp văn bằng") && html.includes("Đợt cấp văn bằng"),
  );
  if (process.env.ISSUANCE_BROWSER_MODULE) {
    const { chromium } = await import(
      pathToFileURL(resolve(process.env.ISSUANCE_BROWSER_MODULE))
    );
    browserTemp = await mkdtemp(
      join(tmpdir(), "diplomachain-issuance-browser-"),
    );
    context = await chromium.launchPersistentContext(
      join(browserTemp, "profile"),
      {
        headless: true,
        executablePath: process.env.ISSUANCE_BROWSER_EXECUTABLE,
        viewport: { width: 1440, height: 1050 },
        locale: "vi-VN",
        timezoneId: "Asia/Ho_Chi_Minh",
      },
    );
    await context.addCookies([
      { name: "next-auth.session-token", value: officer, url: base },
    ]);
    const page = await context.newPage(),
      errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base + "/diploma-records/batches");
    await page.getByText(original.name, { exact: true }).waitFor();
    await page
      .getByRole("button", { name: "Lập đợt cấp văn bằng", exact: true })
      .click();
    const create = page.getByRole("dialog");
    await create.getByLabel("Mã đợt", { exact: true }).fill("UI_2024");
    await create
      .getByLabel("Tên đợt", { exact: true })
      .fill("Đợt kiểm thử giao diện");
    await create.getByLabel("Quyết định tốt nghiệp", { exact: true }).click();
    await page
      .getByTitle("123/QĐ-KT · 2024 · 1/6/2024", { exact: true })
      .click();
    await create.getByRole("button", { name: "Tạo đợt", exact: true }).click();
    await page.getByText("Đợt kiểm thử giao diện", { exact: true }).waitFor();
    check(
      "create modal preserves authoritative decision, year and label",
      requests.some(
        (value) =>
          value.method === "POST" &&
          value.path === "/cert/issuance-batches" &&
          value.body.code === "UI_2024" &&
          value.body.graduationYear === 2024 &&
          value.body.decisionId === id(70),
      ),
    );
    await page.goto(base + "/diploma-records/batches?batchId=" + original.id);
    await page.getByText(first.fullName, { exact: true }).waitFor();
    check(
      "incomplete member cannot be selected for signing",
      await page
        .locator('tr[data-row-key="' + invalid.uuid + '"]')
        .getByRole("checkbox")
        .isDisabled(),
    );
    await page.getByRole("button", { name: "Thêm hồ sơ", exact: true }).click();
    const candidates = page.getByRole("dialog");
    await candidates.getByText(candidate.fullName, { exact: true }).waitFor();
    await candidates
      .locator('tr[data-row-key="' + candidate.uuid + '"]')
      .getByRole("checkbox")
      .check();
    await candidates
      .getByRole("button", { name: "Thêm 1 hồ sơ", exact: true })
      .click();
    await page.getByText(candidate.fullName, { exact: true }).waitFor();
    check(
      "membership action forwards only selected ids",
      requests.some(
        (value) =>
          value.path.endsWith("/members") &&
          value.body.diplomaIds.length === 1 &&
          value.body.diplomaIds[0] === candidate.uuid,
      ),
    );
    for (const row of [first, candidate])
      await page
        .locator('tr[data-row-key="' + row.uuid + '"]')
        .getByRole("checkbox")
        .check();
    await page
      .getByRole("button", { name: "Duyệt và ký 2 hồ sơ", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận duyệt và ký", exact: true })
      .click();
    await page
      .getByText("Hồ sơ đã thay đổi sau khi kiểm tra", { exact: true })
      .waitFor();
    check(
      "partial publication gives each record a visible result",
      await page
        .getByRole("dialog")
        .getByText("Đã duyệt, chờ blockchain", { exact: true })
        .isVisible(),
    );
    const publishRequest = requests.find((value) =>
      value.path.endsWith("/publish"),
    );
    check(
      "signing uses checked timestamps for selected records, not all batch members",
      publishRequest.body.entries.length === 2 &&
        publishRequest.body.entries.every(
          (entry) => entry.expectedUpdatedAt === first.updatedAt,
        ),
    );
    await page
      .getByRole("button", {
        name: "Đóng và kiểm tra lại trạng thái",
        exact: true,
      })
      .click();
    await page.getByText("Chờ blockchain", { exact: true }).first().waitFor();
    failPublication = true;
    await page
      .locator('tr[data-row-key="' + candidate.uuid + '"]')
      .getByRole("checkbox")
      .check();
    await page
      .getByRole("button", { name: "Duyệt và ký 1 hồ sơ", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Xác nhận duyệt và ký", exact: true })
      .click();
    await page.getByText(/Không tự gửi lại; hãy kiểm tra trạng thái/).waitFor();
    check(
      "ambiguous network failures remain visible after refreshing the batch",
      await page
        .getByText(/Không tự gửi lại; hãy kiểm tra trạng thái/)
        .isVisible(),
    );
    check(
      "network failures never trigger automatic signing retries",
      requests.filter((value) => value.path.endsWith("/publish")).length === 2,
    );
    await page
      .locator('tr[data-row-key="' + invalid.uuid + '"]')
      .getByRole("button", { name: "Gỡ khỏi đợt", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Gỡ khỏi đợt", exact: true })
      .click();
    await page
      .locator('tr[data-row-key="' + invalid.uuid + '"]')
      .waitFor({ state: "detached" });
    check(
      "removal preserves the original source record",
      allRows.includes(invalid) && !members.get(original.id).includes(invalid),
    );
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      for (const element of document.querySelectorAll(
        ".ant-table-body, .ant-table-content",
      ))
        element.scrollLeft = 0;
    });
    if (process.env.ISSUANCE_TEST_PREVIEW_DIR) {
      const output = await realpath(process.env.ISSUANCE_TEST_PREVIEW_DIR),
        within = relative(await realpath(tmpdir()), output);
      assert(within && !within.startsWith("..") && !isAbsolute(within));
      await page.screenshot({
        path: join(output, "issuance-desktop.png"),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForFunction(
      () =>
        document.querySelector(".ant-layout-sider")?.getBoundingClientRect()
          .width <= 1,
    );
    check(
      "mobile batch page does not overflow the viewport",
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    if (process.env.ISSUANCE_TEST_PREVIEW_DIR)
      await page.screenshot({
        path: join(
          await realpath(process.env.ISSUANCE_TEST_PREVIEW_DIR),
          "issuance-mobile.png",
        ),
        fullPage: true,
      });
    check("no browser runtime errors", errors.length === 0);
  }
} finally {
  await context?.close();
  if (browserTemp) {
    const within = relative(resolve(tmpdir()), resolve(browserTemp));
    assert(
      within &&
        !within.startsWith("..") &&
        !isAbsolute(within) &&
        resolve(browserTemp).includes("diplomachain-issuance-browser-"),
    );
    await rm(browserTemp, { recursive: true, force: true, maxRetries: 3 });
  }
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill();
    await Promise.race([exited, delay(5000)]);
  }
  await new Promise((ok) => backend.close(ok));
}
console.log(
  "Issuance batch web checks passed: " +
    checks +
    ". Synthetic backend only; no business data or blockchain writes.",
);
