import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  unlink,
} from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { encode } from "next-auth/jwt";

const root = fileURLToPath(new URL("../", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "diplomachain-university-ui-"));
const web = join(temporary, "apps/web");
const links = [];
const secret = randomBytes(32).toString("hex");
let child;
let logs = "";
let checks = 0;
function check(label, value) {
  assert(value, label);
  checks++;
}
const backend = createServer((request, response) => {
  response.setHeader("Content-Type", "application/json");
  if (request.method !== "GET") {
    response.statusCode = 405;
    response.end(JSON.stringify({ message: "Read-only isolated UI fixture" }));
  } else if (
    request.url?.startsWith("/imports/") &&
    request.url.includes("/duplicates?")
  ) {
    assert.equal(request.headers.authorization, "Bearer isolated-ui-token");
    response.end(
      JSON.stringify({
        current: { id: "row-fixture" },
        matches: [],
        total: 0,
        forwardedQuery: new URL(request.url, "http://fixture.invalid").search,
      }),
    );
  } else if (request.url === "/auth/users") response.end("[]");
  else if (request.url?.startsWith("/students"))
    response.end(JSON.stringify({ data: [] }));
  else if (request.url?.startsWith("/cert/student/")) response.end("[]");
  else if (request.url === "/auth/me")
    response.end(
      JSON.stringify({
        name: "Isolated Student",
        email: "student@example.test",
        mssv: "UI0001",
      }),
    );
  else {
    response.statusCode = 503;
    response.end(
      JSON.stringify({
        message: "Isolated backend is intentionally unavailable",
      }),
    );
  }
});
async function listen(server) {
  await new Promise((accept, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", accept);
  });
  return server.address().port;
}
async function link(source, destination) {
  await mkdir(resolve(destination, ".."), { recursive: true });
  await symlink(
    source,
    destination,
    process.platform === "win32" ? "junction" : "dir",
  );
  links.push(destination);
}
async function assertNoLinks(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert(
      !(await lstat(path)).isSymbolicLink(),
      "Unexpected link in task directory: " + path,
    );
    if (entry.isDirectory()) await assertNoLinks(path);
  }
}
async function cookie(role) {
  return (
    "next-auth.session-token=" +
    (await encode({
      secret,
      maxAge: 600,
      token: {
        sub: randomUUID(),
        id: randomUUID(),
        name: "Isolated UI account",
        email: "ui@example.test",
        role,
        isHeadquarters: true,
        canApproveDiplomas: true,
        campusName: "Cơ sở chính TP. Hồ Chí Minh",
        mssv: "UI0001",
        mustChangePassword: false,
        accessToken: "isolated-ui-token",
        accessTokenExpires: Date.now() + 600000,
      },
    }))
  );
}
try {
  const backendPort = await listen(backend);
  const probe = createServer();
  const port = await listen(probe);
  await new Promise((accept, reject) =>
    probe.close((error) => (error ? reject(error) : accept())),
  );
  const base = "http://127.0.0.1:" + port;
  await mkdir(web, { recursive: true });
  for (const name of [
    "src",
    "public",
    "package.json",
    "tsconfig.json",
    "next-env.d.ts",
    "next.config.js",
    "postcss.config.mjs",
  ])
    await cp(join(root, "apps/web", name), join(web, name), {
      recursive: true,
    });
  for (const name of ["package.json", "package-lock.json"])
    await cp(join(root, name), join(temporary, name));
  await link(join(root, "node_modules"), join(temporary, "node_modules"));
  await mkdir(join(web, "node_modules"), { recursive: true });
  await cp(
    join(root, "apps/web/node_modules/next"),
    join(web, "node_modules/next"),
    { recursive: true },
  );
  for (const name of ["@next", "@types", "react", "react-dom"])
    await link(
      join(root, "apps/web/node_modules", name),
      join(web, "node_modules", name),
    );
  child = spawn(
    process.execPath,
    [
      join(web, "node_modules/next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: web,
      env: {
        ...process.env,
        NEXTAUTH_SECRET: secret,
        NEXTAUTH_URL: base,
        API_URL: "http://127.0.0.1:" + backendPort,
        NEXT_PUBLIC_API_URL: "http://127.0.0.1:" + backendPort,
        NEXT_TELEMETRY_DISABLED: "1",
        AI_ASSISTANT_ENABLED: "false",
        AI_API_KEY: "",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [child.stdout, child.stderr])
    stream.on("data", (chunk) => {
      logs = (logs + chunk).slice(-30000);
    });
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (child.exitCode !== null)
      throw new Error("Isolated Next exited: " + logs);
    try {
      const response = await fetch(base + "/", {
        signal: AbortSignal.timeout(10000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(1000);
  }
  check("isolated Next server starts", ready);
  const officer = await cookie("university");
  const admin = await cookie("admin");
  const student = await cookie("student");
  const routes = [
    ["/", null, "Cổng tra cứu và xác thực văn bằng"],
    ["/search", null, "Tra cứu văn bằng tốt nghiệp"],
    ["/verify", null, "Xác thực văn bằng"],
    ["/login", null, "Đăng nhập hệ thống"],
    ["/register/student", null, "Kích hoạt tài khoản sinh viên"],
    ["/change-password", null, "Đổi mật khẩu"],
    ["/dashboard", officer, "Tổng quan"],
    ["/diploma-records", officer, "Hồ sơ cấp văn bằng"],
    ["/certificates", officer, "Sổ văn bằng"],
    ["/catalog", officer, "Danh mục"],
    ["/activity", officer, "Nhật ký hoạt động"],
    ["/explorer", officer, "Đối chiếu blockchain"],
    ["/import", officer, "Kiểm tra dữ liệu"],
    ["/issue", officer, "Duyệt và phát hành văn bằng"],
    ["/pending", officer, "Duyệt và xử lý hồ sơ"],
    ["/pending?view=rejected", officer, "Hồ sơ bị từ chối và bổ sung"],
    [
      "/pending?view=replacements",
      officer,
      "Sửa sai và phát hành văn bằng thay thế",
    ],
    ["/students", officer, "Hồ sơ sinh viên của cơ sở"],
    ["/students/import", officer, "Nhập hồ sơ sinh viên"],
    ["/users", admin, "Tài khoản hệ thống"],
    ["/student/dashboard", student, "Văn bằng của tôi"],
    ["/student/profile", student, "Thông tin tài khoản"],
  ];
  const stylesheets = new Set();
  for (const [path, session, heading] of routes) {
    const response = await fetch(base + path, {
      headers: session ? { cookie: session } : {},
      redirect: "manual",
      signal: AbortSignal.timeout(120000),
    });
    const html = await response.text();
    check(
      "page renders: " + path,
      response.status === 200 &&
        !html.includes('"digest":"') &&
        !html.includes("NEXT_HTTP_ERROR_FALLBACK;500"),
    );
    check("school identity: " + path, html.includes("TRƯỜNG ĐẠI HỌC THỦY LỢI"));
    check("expected heading: " + path, html.includes(heading));
    const visibleHtml = html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
    check(
      "removed captions are not rendered: " + path,
      ![
        "CÁN BỘ · DUYỆT VÀ PHÁT HÀNH",
        "Cơ sở chính TP. Hồ Chí Minh",
        "HỆ THỐNG THÔNG TIN NHÀ TRƯỜNG",
        "Hệ thống quản lý và xác thực văn bằng",
        "Tra cứu thông tin và kiểm tra tình trạng văn bằng tốt nghiệp",
        "Xác thực bằng tệp PDF hoặc mã QR mà không cần đăng nhập",
        "Tìm văn bằng bằng họ tên, ngày sinh và số định danh",
        "Không gửi thông tin cá nhân, mật khẩu, OTP hoặc tệp văn bằng",
      ].some((caption) => visibleHtml.includes(caption)),
    );
    check(
      "one main landmark: " + path,
      (html.match(/<main[ >]/g) || []).length === 1,
    );
    check(
      "one page heading: " + path,
      (html.match(/<h1[ >]/g) || []).length === 1,
    );
    const css = [...html.matchAll(/<link[^>]*>/g)]
      .map(([tag]) => tag)
      .filter((tag) => tag.includes('rel="stylesheet"'))
      .map((tag) => tag.match(/href="([^"]+)"/)?.[1])
      .filter(Boolean);
    check("compiled CSS linked: " + path, css.length > 0);
    for (const href of css) stylesheets.add(href.replaceAll("&amp;", "&"));
    console.log("PASS " + path);
  }
  const duplicatePath =
    "/api/imports/11111111-1111-4111-8111-111111111111/rows/22222222-2222-4222-8222-222222222222/duplicates?page=2&limit=5";
  check(
    "duplicate proxy requires authentication",
    (await fetch(base + duplicatePath)).status === 401,
  );
  const duplicateResponse = await fetch(base + duplicatePath, {
    headers: { cookie: officer },
  });
  const duplicateBody = await duplicateResponse.json();
  check(
    "duplicate proxy forwards read-only comparison",
    duplicateResponse.status === 200 &&
      duplicateBody.current.id === "row-fixture",
  );
  check(
    "duplicate proxy preserves pagination",
    duplicateBody.forwardedQuery === "?page=2&limit=5",
  );
  check(
    "duplicate comparison is not cached",
    duplicateResponse.headers.get("Cache-Control") === "private, no-store",
  );
  const assistantPost = (body, session, origin = base) =>
    fetch(base + "/api/assistant", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        ...(session ? { cookie: session } : {}),
      },
      body: JSON.stringify(body),
    });
  let assistantResponse = await assistantPost({
    question: "Tra cứu cần nhập những gì?",
  });
  const assistantAnswer = await assistantResponse.json();
  check(
    "public assistant uses honest guide mode without credentials",
    assistantResponse.status === 200 &&
      assistantAnswer.mode === "guide" &&
      assistantAnswer.sources.some((source) => source.href === "/search"),
  );
  check(
    "assistant response is not cached",
    assistantResponse.headers.get("Cache-Control") === "private, no-store",
  );
  const issueQuestion = {
    question: "Giải thích lỗi kiểm tra dữ liệu",
    context: { type: "registry-issues", codes: ["UNMAPPED_PROGRAM"] },
  };
  check(
    "public cannot request staff error explanations",
    (await assistantPost(issueQuestion)).status === 403,
  );
  check(
    "student cannot request staff error explanations",
    (await assistantPost(issueQuestion, student)).status === 403,
  );
  assistantResponse = await assistantPost(issueQuestion, officer);
  check(
    "authorized officer gets safe program guidance",
    assistantResponse.status === 200 &&
      (await assistantResponse.json()).sources.some(
        (source) => source.href === "/catalog",
      ),
  );
  check(
    "cross-origin assistant request rejected",
    (
      await assistantPost(
        { question: "Tra cứu" },
        null,
        "https://attacker.example",
      )
    ).status === 403,
  );
  check(
    "browser cannot override provider model",
    (await assistantPost({ question: "Tra cứu", model: "attacker" }, admin))
      .status === 400,
  );
  let allCss = "";
  for (const href of stylesheets) {
    const response = await fetch(new URL(href, base));
    check(
      "stylesheet served",
      response.ok && response.headers.get("content-type")?.includes("text/css"),
    );
    allCss += await response.text();
  }
  for (const marker of [
    "--school-primary",
    "--school-gold",
    "--font-roboto",
    "--school-font",
    ".workspace-page",
    ".page-title",
    "grid-template-columns",
    ".space-y-5",
  ])
    check("shared CSS contains " + marker, allCss.includes(marker));
  check(
    "school palette survives compilation",
    allCss.includes("var(--school-primary)"),
  );
  check(
    "no legacy fonts remain in compiled web styles",
    !/Segoe UI|Georgia|Times New Roman/.test(allCss),
  );
  const fontUrls = new Set(
    Array.from(allCss.matchAll(/url\(([^)]+)\)/g), (match) =>
      match[1].replace(/^['"]|['"]$/g, ""),
    ).filter((href) => /\.(?:ttf|woff2?)(?:[?#]|$)/.test(href)),
  );
  check(
    "Roboto normal and italic fonts are emitted locally",
    fontUrls.size >= 2 && [...fontUrls].every((href) => !/^https?:/.test(href)),
  );
  const expectedFonts = new Set([
    "d7598e12c5dbef095ff8272cfc55da0250bd07fbdecbac8a530b9b277872a134",
    "9725a847af6b460ffca162ae66d20dad48b01876137947180b42d7dcd7887182",
  ]);
  const servedFonts = new Set();
  for (const href of fontUrls) {
    const response = await fetch(new URL(href, base));
    check("compiled local font returns HTTP 200", response.ok);
    const bytes = Buffer.from(await response.arrayBuffer());
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (expectedFonts.has(hash)) servedFonts.add(hash);
  }
  check(
    "full Vietnamese font binaries served without subsetting",
    servedFonts.size === expectedFonts.size,
  );
  console.log(
    "Isolated university web checks passed: " +
      checks +
      ". Synthetic sessions and read-only fixtures; no real database, PDF or ledger requests.",
  );
} catch (error) {
  console.error(logs.slice(-16000));
  throw error;
} finally {
  if (child && child.exitCode === null) {
    if (process.platform === "win32") {
      await new Promise((accept, reject) => {
        const stop = spawn(
          "taskkill",
          ["/PID", String(child.pid), "/T", "/F"],
          { windowsHide: true, stdio: "ignore" },
        );
        stop.once("error", reject);
        stop.once("exit", (code) =>
          code === 0 || child.exitCode !== null
            ? accept()
            : reject(new Error("Could not stop isolated Next process")),
        );
      });
    } else child.kill("SIGTERM");
    for (let attempt = 0; attempt < 100 && child.exitCode === null; attempt++)
      await delay(100);
    assert(
      child.exitCode !== null || child.signalCode !== null,
      "Isolated server must stop before cleanup",
    );
  }
  await new Promise((accept, reject) =>
    backend.close((error) =>
      !error || error.code === "ERR_SERVER_NOT_RUNNING"
        ? accept()
        : reject(error),
    ),
  );
  const owned = relative(resolve(tmpdir()), resolve(temporary));
  assert(
    owned &&
      !owned.startsWith("..") &&
      !isAbsolute(owned) &&
      owned.startsWith("diplomachain-university-ui-"),
  );
  for (const path of links.reverse()) {
    assert((await lstat(path)).isSymbolicLink());
    await unlink(path);
  }
  await assertNoLinks(temporary);
  await rm(temporary, { recursive: true, force: true });
  console.log(
    "Removed task-owned server, dependency links and temporary build directory.",
  );
}
