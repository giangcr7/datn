import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { encode } from "next-auth/jwt";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, "apps/web/.env.local"), quiet: true });
assert(
  process.env.NEXTAUTH_SECRET,
  "NEXTAUTH_SECRET is required for isolated session tests",
);
const port = 3100;
const base = "http://localhost:" + port;
const probe = createServer();
await new Promise((accept, reject) => {
  probe.once("error", reject);
  probe.listen(port, accept);
});
await new Promise((accept) => probe.close(accept));
let dashboardData = null;
const retryRequests = [];
const backend = createHttpServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method === "POST" && /^\/explorer\/anchors\/[0-9a-f-]+\/retry$/.test(request.url || "")) {
    let raw = "";
    request.on("data", (chunk) => { raw += chunk; });
    request.on("end", () => {
      const body = JSON.parse(raw);
      retryRequests.push({ path: request.url, body, authorization: request.headers.authorization });
      response.end(JSON.stringify({ message: "Queued in isolated fixture", anchor: { id: request.url.split("/")[3], status: "QUEUED" } }));
    });
  } else if (request.url === "/dashboard/overview" && dashboardData) {
    response.end(JSON.stringify(dashboardData));
  } else {
    response.statusCode = 401;
    response.end(JSON.stringify({ message: "Isolated test token" }));
  }
});
await new Promise((accept) => backend.listen(0, "127.0.0.1", accept));
const backendPort = backend.address().port;
let logs = "";
const server = spawn(
  process.execPath,
  [
    resolve(root, "node_modules/next/dist/bin/next"),
    "start",
    "--port",
    String(port),
  ],
  {
    cwd: resolve(root, "apps/web"),
    env: {
      ...process.env,
      NEXTAUTH_URL: base,
      API_URL: "http://127.0.0.1:" + backendPort,
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
for (const stream of [server.stdout, server.stderr])
  stream.on("data", (data) => {
    logs = (logs + data).slice(-10000);
  });
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
async function cookie(flags) {
  return (
    "next-auth.session-token=" +
    (await encode({
      secret: process.env.NEXTAUTH_SECRET,
      maxAge: 300,
      token: {
        sub: randomUUID(),
        id: randomUUID(),
        email: "isolated-menu@example.test",
        name: "Menu regression",
        role: "university",
        org: "ORG2",
        isHeadquarters: true,
        canApproveDiplomas: true,
        accessToken: "isolated-ui-test-not-an-api-token",
        accessTokenExpires: Date.now() + 300000,
        ...flags,
      },
    }))
  );
}
async function request(path, sessionCookie, method = "GET") {
  const response = await fetch(base + path, {
    redirect: "manual",
    method,
    headers: sessionCookie ? { Cookie: sessionCookie } : {},
  });
  return { response, html: await response.text() };
}
function redirects(result, destination) {
  return (
    ([307, 308].includes(result.response.status) &&
      result.response.headers.get("location")?.endsWith(destination)) ||
    result.html.includes("NEXT_REDIRECT;replace;" + destination + ";307;")
  );
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null)
      throw new Error("Isolated web server exited: " + logs.slice(-2000));
    try {
      if ((await fetch(base + "/login")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  assert(ready, "Isolated web server did not start");
  const officer = await cookie();
  for (const [path, heading] of [
    ["/dashboard", "Tổng quan"],
    ["/diploma-records", "Hồ sơ cấp văn bằng"],
    ["/catalog", "Danh mục"],
    ["/activity", "Nhật ký hoạt động"],
    ["/certificates", "Sổ văn bằng"],
    ["/explorer", "Đối chiếu blockchain"],
  ]) {
    const result = await request(path, officer);
    check(
      "officer can render the production page " + path,
      result.response.ok &&
        result.html.includes(heading) &&
        !result.html.includes("NEXT_HTTP_ERROR_FALLBACK;500"),
    );
    for (const label of [
      "Tổng quan",
      "Hồ sơ cấp văn bằng",
      "Sổ văn bằng",
      "Danh mục",
      "Nhật ký hoạt động",
      "Đối chiếu blockchain",
    ])
      check(
        "page contains the agreed navigation " + path + ": " + label,
        result.html.includes(label),
      );
    check(
      "anonymous access is redirected " + path,
      redirects(await request(path), "/login"),
    );
  }
  const admin = await cookie({ role: "admin" });
  const corrections = await request("/pending?view=rejected", officer);
  const replacements = await request("/pending?view=replacements", officer);
  for (const label of [
    "Sửa sai và phát hành văn bằng thay thế",
    "Sửa sai và thay thế",
    "Đang soạn",
    "Về Sổ văn bằng",
  ])
    check(
      "replacement workspace renders " + label,
      replacements.response.ok && replacements.html.includes(label),
    );
  check(
    "anonymous replacement workspace redirects",
    redirects(await request("/pending?view=replacements"), "/login"),
  );
  check(
    "admin replacement workspace redirects",
    redirects(await request("/pending?view=replacements", admin), "/dashboard"),
  );
  for (const [path, method] of [
    ["/api/cert/replacements", "GET"],
    [
      "/api/cert/replacements/00000000-0000-4000-8000-000000000001/create",
      "POST",
    ],
    [
      "/api/cert/replacements/00000000-0000-4000-8000-000000000001/approve",
      "POST",
    ],
    ["/api/cert/replacements/00000000-0000-4000-8000-000000000001", "PATCH"],
  ]) {
    check(
      "anonymous replacement proxy rejected " + path,
      (await request(path, undefined, method)).response.status === 401,
    );
    check(
      "admin replacement proxy rejected " + path,
      (await request(path, admin, method)).response.status === 403,
    );
  }
  for (const label of [
    "Hồ sơ bị từ chối và bổ sung",
    "Bị từ chối / Đang bổ sung",
    "Đang bổ sung",
    "Tra cứu",
  ])
    check(
      "correction workspace renders production UI " + label,
      corrections.response.ok && corrections.html.includes(label),
    );
  check(
    "anonymous correction workspace redirects",
    redirects(await request("/pending?view=rejected"), "/login"),
  );
  check(
    "admin cannot enter officer correction workspace",
    redirects(await request("/pending?view=rejected", admin), "/dashboard"),
  );
  for (const [path, method] of [
    ["/api/cert/corrections", "GET"],
    [
      "/api/cert/corrections/00000000-0000-4000-8000-000000000001/reopen",
      "POST",
    ],
    [
      "/api/cert/corrections/00000000-0000-4000-8000-000000000001/resubmit",
      "POST",
    ],
  ]) {
    check(
      "anonymous correction proxy rejected " + path,
      (await request(path, undefined, method)).response.status === 401,
    );
    check(
      "admin correction proxy rejected " + path,
      (await request(path, admin, method)).response.status === 403,
    );
  }
  const overview = await request("/dashboard", officer);
  for (const heading of [
    "Việc cần xử lý",
    "Đợt hồ sơ cần xử lý",
    "Báo cáo cơ bản",
    "Văn bằng ghi nhận gần đây",
  ])
    check(
      "dashboard renders useful work and reports " + heading,
      overview.html.includes(heading),
    );
  check(
    "dashboard failed fetch is not mistaken for zero",
    overview.html.includes("Chưa tải được Tổng quan") &&
      overview.html.includes("không phải 0"),
  );
  const adminOverview = await request("/dashboard", admin);
  check(
    "admin dashboard shows monitoring without officer work",
    adminOverview.response.ok &&
      adminOverview.html.includes("Theo dõi phát hành") &&
      !adminOverview.html.includes("Đợt hồ sơ cần xử lý"),
  );
  dashboardData = {
    summary: {
      totalRecords: 18,
      draftRecords: 4,
      requestedRecords: 2,
      rejectedRecords: 1,
      reopenedDrafts: 1,
      pendingAnchoring: 3,
      registered: 8,
      active: 6,
      revoked: 1,
      replaced: 1,
      registeredThisMonth: 5,
      undatedRegistrations: 0,
      students: 20,
      failedTransactions: 2,
    },
    imports: {
      counts: { needsReview: 2, ready: 3, graduationOnly: 1, prepare: 4 },
      batches: [
        {
          id: "test-batch-001",
          fileName: "Đợt tốt nghiệp cần xử lý.xlsx",
          createdAt: "2026-10-01T00:00:00Z",
          needsReview: 2,
          ready: 3,
          graduationOnly: 1,
          prepare: 4,
        },
      ],
    },
    byMajor: [{ name: "Công nghệ thông tin", value: 8 }],
    byYear: [{ name: "2024", value: 8 }],
    byMonth: [{ month: "2026-10", value: 5 }],
    recentIssued: [
      {
        id: "issued-001",
        fullName: "Nguyễn Thị Kiểm Thử",
        mssv: "0012345678",
        certificateNo: "000VB0123",
        status: "REVOKED",
        committedAt: "2026-10-27T03:00:00Z",
      },
    ],
    generatedAt: "2026-10-27T03:00:00Z",
    timezone: "Asia/Ho_Chi_Minh",
  };
  const loadedOverview = await request("/dashboard", officer);
  check(
    "production dashboard consumes the dedicated overview endpoint",
    loadedOverview.response.ok &&
      !loadedOverview.html.includes("Chưa tải được Tổng quan") &&
      loadedOverview.html.includes("Nguyễn Thị Kiểm Thử"),
  );
  check(
    "production dashboard retains leading zeros",
    loadedOverview.html.includes("0012345678") &&
      loadedOverview.html.includes("000VB0123"),
  );
  check(
    "production dashboard links to exact work batch",
    loadedOverview.html.includes(
      "batchId=test-batch-001&amp;status=NEEDS_REVIEW",
    ),
  );
  check(
    "production dashboard links to signed register identifier",
    loadedOverview.html.includes("/certificates?search=000VB0123"),
  );
  check(
    "production dashboard discloses sync failure rather than claiming success",
    loadedOverview.html.includes("2 giao dịch lỗi đồng bộ"),
  );
  dashboardData = {
    ...dashboardData,
    summary: Object.fromEntries(
      Object.keys(dashboardData.summary).map((key) => [key, 0]),
    ),
    imports: {
      counts: { needsReview: 0, ready: 0, graduationOnly: 0, prepare: 0 },
      batches: [],
    },
    byMajor: [],
    byYear: [],
    byMonth: [],
    recentIssued: [],
  };
  const emptyOverview = await request("/dashboard", officer);
  check(
    "real empty dataset is not a load error or stale prior report",
    emptyOverview.response.ok &&
      !emptyOverview.html.includes("Chưa tải được Tổng quan") &&
      !emptyOverview.html.includes("Nguyễn Thị Kiểm Thử") &&
      emptyOverview.html.includes("Chưa có dữ liệu"),
  );
  dashboardData = null;
  const explorer = await request("/explorer", officer);
  for (const label of [
    "Tra cứu giao dịch",
    "Nghiệp vụ",
    "Trạng thái đồng bộ",
    "Chưa xác định kết nối Fabric",
    "Đối chiếu trực tiếp",
  ])
    check(
      "explorer renders business reconciliation controls " + label,
      explorer.html.includes(label),
    );
  check(
    "explorer does not claim synchronized network or fictional block height",
    !explorer.html.includes("Synchronized") &&
      !explorer.html.includes("ĐỘ CAO KHỐI"),
  );
  const register = await request("/certificates", officer);
  for (const label of [
    "Tra cứu văn bằng",
    "Năm tốt nghiệp",
    "Quyết định tốt nghiệp",
    "Số vào sổ",
    "Xuất Excel",
    "Xóa bộ lọc",
  ])
    check(
      "register renders its business control " + label,
      register.html.includes(label),
    );
  check(
    "admin can render activity without approval rights",
    (await request("/activity", admin)).response.ok,
  );
  check(
    "admin cannot enter officer catalog",
    redirects(await request("/catalog", admin), "/dashboard"),
  );
  const student = await cookie({ role: "student" });
  check(
    "student cannot enter activity",
    redirects(await request("/activity", student), "/student/dashboard"),
  );
  const archived = await cookie({ isHeadquarters: false });
  check(
    "admin retains blockchain monitoring access",
    (await request("/explorer", admin)).response.ok,
  );
  check(
    "student cannot enter internal reconciliation",
    redirects(await request("/explorer", student), "/student/dashboard"),
  );
  check(
    "archived staff cannot enter reconciliation",
    redirects(await request("/explorer", archived), "/login"),
  );
  for (const [path, method] of [
    ["/api/explorer/overview", "GET"],
    ["/api/explorer/blocks", "GET"],
    ["/api/explorer/anchors", "GET"],
    ["/api/explorer/tx/test-tx", "GET"],
    ["/api/explorer/anchors/" + randomUUID() + "/check", "POST"],
    ["/api/explorer/anchors/" + randomUUID() + "/retry", "POST"],
  ]) {
    check(
      "explorer proxy requires authentication " + path,
      (await request(path, undefined, method)).response.status === 401,
    );
    check(
      "explorer proxy denies students " + path,
      (await request(path, student, method)).response.status === 403,
    );
    check(
      "explorer proxy denies archived staff " + path,
      (await request(path, archived, method)).response.status === 403,
    );
  }
  const retryId = randomUUID();
  const retryPath = "/api/explorer/anchors/" + retryId + "/retry";
  const retryBody = { reason: "Đã khôi phục kết nối peer", expectedRetryToken: "a".repeat(64) };
  check("unauthorized recovery attempts never reach backend", retryRequests.length === 0);
  for (const sessionCookie of [officer, admin]) {
    const response = await fetch(base + retryPath, {
      method: "POST", headers: { Cookie: sessionCookie, "Content-Type": "application/json" }, body: JSON.stringify(retryBody),
    });
    const result = await response.json();
    check("authorized retry proxy forwards the response without claiming commit", response.ok && result.success && result.data.anchor.status === "QUEUED");
    const forwarded = retryRequests.at(-1);
    check("retry proxy preserves note and stale-state token", JSON.stringify(forwarded.body) === JSON.stringify(retryBody));
    check("retry proxy supplies backend bearer authentication", forwarded.authorization === "Bearer isolated-ui-test-not-an-api-token");
    check("retry proxy targets the exact original anchor", forwarded.path === "/explorer/anchors/" + retryId + "/retry");
  }
  const malformed = await fetch(base + retryPath, { method: "POST", headers: { Cookie: officer, "Content-Type": "application/json" }, body: "{" });
  check("retry proxy rejects malformed JSON without backend call", malformed.status === 400 && retryRequests.length === 2);
  check(
    "archived staff cannot enter officer records",
    redirects(await request("/diploma-records", archived), "/login"),
  );
  check(
    "catalog proxy rejects unauthenticated requests",
    (await request("/api/catalog/programs")).response.status === 401,
  );
  check(
    "activity proxy rejects unauthenticated requests",
    (await request("/api/activity")).response.status === 401,
  );
  check(
    "register proxy rejects unauthenticated requests",
    (await request("/api/certificates")).response.status === 401,
  );
  check(
    "register proxy rejects student access",
    (await request("/api/certificates", student)).response.status === 403,
  );
  check(
    "register proxy rejects archived staff",
    (await request("/api/certificates", archived)).response.status === 403,
  );
  check(
    "catalog proxy rejects administrative mutation access",
    (await request("/api/catalog/programs", admin)).response.status === 403,
  );
  check(
    "activity proxy rejects student access",
    (await request("/api/activity", student)).response.status === 403,
  );
} finally {
  const exited = once(server, "exit");
  server.kill();
  await Promise.race([exited, delay(5000)]);
  await new Promise((accept) => backend.close(accept));
}
console.log(
  "Business menu production HTTP checks passed: " +
    checks +
    ". No real login or database writes.",
);
