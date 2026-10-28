import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { decode, encode } from "next-auth/jwt";
import { tsImport } from "tsx/esm/api";

const { applySessionCookiePolicy, sessionOnlyCookie, SESSION_MAX_AGE_SECONDS } =
  await tsImport("../apps/web/src/lib/auth-session-cookie.ts", import.meta.url);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(resolve(root, "apps/web/package.json"));
const secret = randomBytes(32).toString("hex");
const webPort = Number(process.env.AUTH_TEST_WEB_PORT || 3102);
const webUrl = "http://localhost:" + webPort;
const sessionName = "next-auth.session-token";
const futureExpiry = new Date(Date.now() + 86400000).toUTCString();
const persistentCookie = `${sessionName}=fixture; Path=/; Expires=${futureExpiry}; Max-Age=86400; HttpOnly; SameSite=Lax`;
let checks = 0;

function check(label, condition) {
  assert(condition, label);
  checks++;
}

check(
  "session-only cookie removes only persistence attributes",
  sessionOnlyCookie(persistentCookie) ===
    `${sessionName}=fixture; Path=/; HttpOnly; SameSite=Lax`,
);
for (const name of [sessionName + ".0", "__Secure-" + sessionName + ".1"]) {
  check(
    "handles secure and chunked cookies: " + name,
    sessionOnlyCookie(`${name}=fixture==; Secure; expires=${futureExpiry}`) ===
      `${name}=fixture==; Secure`,
  );
}
for (const cookie of [
  "next-auth.csrf-token=fixture; Max-Age=86400; HttpOnly",
  sessionName + "-other=fixture; Max-Age=86400",
  sessionName + "=; Max-Age=0; Path=/",
  sessionName + "=deleted; Max-Age=-1; Path=/",
  sessionName + "=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/",
]) {
  check(
    "preserves unrelated/deleted cookie: " + cookie,
    sessionOnlyCookie(cookie) === cookie,
  );
}
const original = new Response("redirect", { status: 302 });
original.headers.set("location", "/dashboard");
original.headers.append("set-cookie", persistentCookie);
original.headers.append(
  "set-cookie",
  "next-auth.csrf-token=fixture; Max-Age=86400; HttpOnly",
);
check(
  "remember keeps original response",
  applySessionCookiePolicy(original, true) === original,
);
const transformed = applySessionCookiePolicy(original, false);
check(
  "preserves response status and location",
  transformed.status === 302 &&
    transformed.headers.get("location") === "/dashboard",
);
check(
  "preserves separate Set-Cookie headers",
  transformed.headers.getSetCookie().length === 2,
);
check(
  "preserves CSRF cookie attributes",
  transformed.headers.getSetCookie()[1] === original.headers.getSetCookie()[1],
);
check("preserves response body", (await transformed.text()) === "redirect");
const empty = new Response(null);
check(
  "leaves cookie-free responses unchanged",
  applySessionCookiePolicy(empty, false) === empty,
);

const backendSessions = new Map();
const backend = createServer(async (request, response) => {
  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString() || "{}");
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/api/auth/logout") {
      backendSessions.delete(body.refreshToken);
      response.end(JSON.stringify({ success: true }));
      return;
    }
    let user;
    if (
      request.url === "/api/auth/login" &&
      body.password === "fixture-password"
    ) {
      const role = body.role.toLowerCase();
      user = {
        id: randomUUID(),
        name: body.email.startsWith("chunked-")
          ? "Long name fixture ".repeat(300)
          : "Remember login fixture",
        email: body.email,
        role,
        org: "ORG2",
        campusId: randomUUID(),
        isHeadquarters: false,
        canApproveDiplomas: false,
      };
    } else if (request.url === "/api/auth/refresh") {
      user = backendSessions.get(body.refreshToken);
      backendSessions.delete(body.refreshToken);
    }
    if (!user) {
      response
        .writeHead(401)
        .end(JSON.stringify({ message: "Invalid credentials" }));
      return;
    }
    const refreshToken = randomUUID();
    backendSessions.set(refreshToken, user);
    response.end(
      JSON.stringify({
        user,
        access_token: randomUUID(),
        refresh_token: refreshToken,
      }),
    );
  } catch {
    response
      .writeHead(500)
      .end(JSON.stringify({ message: "Fixture server error" }));
  }
});

function client() {
  const cookies = new Map();
  async function request(path, { form, body } = {}) {
    const headers = {
      Cookie: [...cookies]
        .map(([name, cookie]) => name + "=" + cookie.value)
        .join("; "),
    };
    if (form) headers["Content-Type"] = "application/x-www-form-urlencoded";
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(webUrl + path, {
      method: form || body ? "POST" : "GET",
      redirect: "manual",
      headers,
      body: form
        ? new URLSearchParams(form).toString()
        : body
          ? JSON.stringify(body)
          : undefined,
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair, ...attributes] = cookie.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (
        !value ||
        attributes.some((attribute) => /^\s*max-age=0$/i.test(attribute))
      ) {
        cookies.delete(name);
      } else {
        cookies.set(name, {
          value,
          persistent: attributes.some((attribute) =>
            /^\s*(expires|max-age)=/i.test(attribute),
          ),
        });
      }
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
  return { cookies, request };
}

function sessionToken(cookies) {
  return [...cookies]
    .filter(
      ([name]) => name === sessionName || name.startsWith(sessionName + "."),
    )
    .sort(([left], [right]) =>
      left.localeCompare(right, undefined, { numeric: true }),
    )
    .map(([, cookie]) => cookie.value)
    .join("");
}

function checkCookiePolicy(result, remember, label) {
  const cookies = result.response.headers
    .getSetCookie()
    .filter((cookie) =>
      /^next-auth\.session-token(?:\.\d+)?=.+?;/i.test(cookie),
    );
  check(label + " reissues session cookie", cookies.length > 0);
  for (const cookie of cookies) {
    check(
      label + " persistence matches checkbox",
      /;\s*(expires|max-age)=/i.test(cookie) === remember,
    );
    check(
      label + " keeps HttpOnly and SameSite",
      /;\s*HttpOnly/i.test(cookie) && /;\s*SameSite=Lax/i.test(cookie),
    );
    if (remember) {
      const expiry = cookie.match(/;\s*Expires=([^;]+)/i)?.[1];
      check(
        label + " expires in seven days",
        Math.abs(
          Date.parse(expiry) - Date.now() - SESSION_MAX_AGE_SECONDS * 1000,
        ) < 10000,
      );
    }
  }
}

async function scenario(role, choice, chunked = false) {
  const remember = choice === "true";
  const label = role + " remember=" + choice + (chunked ? " chunked" : "");
  const { cookies, request } = client();
  const csrf = await request("/api/auth/csrf");
  const login = await request("/api/auth/callback/credentials", {
    form: {
      csrfToken: csrf.data.csrfToken,
      email: (chunked ? "chunked-" : "") + role + "@fixture.invalid",
      password: "fixture-password",
      role: role.toUpperCase(),
      ...(choice === undefined ? {} : { remember: choice }),
      callbackUrl: webUrl + "/dashboard",
      json: "true",
    },
  });
  check(
    label + " signs in",
    login.response.ok && !login.data.url.includes("error="),
  );
  checkCookiePolicy(login, remember, label + " login");
  let token = await decode({ token: sessionToken(cookies), secret });
  check(
    label + " choice is stored in encrypted JWT",
    token.remember === remember,
  );
  check(
    label + " JWT expires in seven days",
    Math.abs(token.exp - token.iat - SESSION_MAX_AGE_SECONDS) < 2,
  );
  if (chunked) {
    check(
      label + " token is split into cookie chunks",
      [...cookies.keys()].filter((name) => name.startsWith(sessionName + "."))
        .length > 1,
    );
  }
  const loginPage = await request("/login");
  check(
    label + " existing session skips login form",
    loginPage.response.status === 307 &&
      loginPage.response.headers.get("location") ===
        (role === "student" ? "/student/dashboard" : "/dashboard"),
  );
  for (let index = 0; index < 2; index++) {
    const session = await request("/api/auth/session");
    check(label + " reads correct role", session.data.user?.role === role);
    checkCookiePolicy(session, remember, label + " session read " + index);
  }
  const update = await request("/api/auth/session", {
    body: { csrfToken: csrf.data.csrfToken, data: { remember: !remember } },
  });
  checkCookiePolicy(update, remember, label + " untrusted session update");
  token = await decode({ token: sessionToken(cookies), secret });
  check(
    label + " ignores untrusted remember updates",
    token.remember === remember,
  );
  const expiredAccess = await encode({
    token: { ...token, accessTokenExpires: 0 },
    secret,
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  for (const name of cookies.keys()) {
    if (name === sessionName || name.startsWith(sessionName + "."))
      cookies.delete(name);
  }
  if (expiredAccess.length > 3900) {
    for (let offset = 0; offset < expiredAccess.length; offset += 3900) {
      cookies.set(sessionName + "." + offset / 3900, {
        value: expiredAccess.slice(offset, offset + 3900),
        persistent: remember,
      });
    }
  } else {
    cookies.set(sessionName, { value: expiredAccess, persistent: remember });
  }
  const refreshed = await request("/api/auth/session");
  check(
    label + " refreshes expired backend access token",
    refreshed.data.accessToken !== token.accessToken && !refreshed.data.error,
  );
  checkCookiePolicy(refreshed, remember, label + " token refresh");
  const previousRefreshToken = token.refreshToken;
  token = await decode({ token: sessionToken(cookies), secret });
  check(
    label + " backend rotates refresh token",
    token.refreshToken !== previousRefreshToken &&
      !backendSessions.has(previousRefreshToken) &&
      backendSessions.has(token.refreshToken),
  );
  const reopened = client();
  for (const [name, cookie] of cookies) {
    if (cookie.persistent) reopened.cookies.set(name, cookie);
  }
  const reopenedSession = await reopened.request("/api/auth/session");
  check(
    label + " browser restart persistence",
    Boolean(reopenedSession.data.user) === remember,
  );
  const reopenedLogin = await reopened.request("/login");
  check(
    label + " reopened login page matches session state",
    reopenedLogin.response.status === (remember ? 307 : 200),
  );
  const logoutCsrf = await request("/api/auth/csrf");
  const logout = await request("/api/auth/signout", {
    form: {
      csrfToken: logoutCsrf.data.csrfToken,
      callbackUrl: webUrl + "/login",
      json: "true",
    },
  });
  check(
    label + " logout deletes browser token",
    logout.response.ok && !sessionToken(cookies),
  );
  check(
    label + " logout revokes backend token",
    !backendSessions.has(token.refreshToken),
  );
  const loggedOut = await request("/api/auth/session");
  check(
    label + " logout leaves no authenticated session",
    !loggedOut.data.user,
  );
}

let web;
let logs = "";
try {
  const portCheck = createServer();
  await new Promise((accept, reject) => {
    portCheck.once("error", reject);
    portCheck.listen(webPort, accept);
  });
  await new Promise((accept) => portCheck.close(accept));
  await new Promise((accept, reject) => {
    backend.once("error", reject);
    backend.listen(0, "127.0.0.1", accept);
  });
  web = spawn(
    process.execPath,
    [require.resolve("next/dist/bin/next"), "start", "--port", String(webPort)],
    {
      cwd: resolve(root, "apps/web"),
      env: {
        ...process.env,
        NEXTAUTH_SECRET: secret,
        NEXTAUTH_URL: webUrl,
        API_URL: "http://127.0.0.1:" + backend.address().port + "/api",
      },
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  for (const stream of [web.stdout, web.stderr]) {
    stream.on("data", (data) => {
      logs = (logs + data).slice(-15000);
    });
  }
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (web.exitCode !== null) throw new Error("Web server exited: " + logs);
    try {
      ready = (await fetch(webUrl + "/api/auth/providers")).ok;
    } catch {}
    if (ready) break;
    await delay(300);
  }
  assert(ready, "Web server did not become ready: " + logs);
  for (const role of ["student", "university", "admin"]) {
    await Promise.all([scenario(role, "true"), scenario(role, "false")]);
  }
  await scenario("student", undefined);
  await scenario("student", "invalid");
  await scenario("student", "true", true);
  await scenario("student", "false", true);
  for (const invalidToken of [
    "invalid-jwt",
    await encode({
      token: { sub: "expired-fixture", remember: true },
      secret,
      maxAge: -60,
    }),
  ]) {
    const expiredClient = client();
    expiredClient.cookies.set(sessionName, {
      value: invalidToken,
      persistent: true,
    });
    const expiredSession = await expiredClient.request("/api/auth/session");
    check(
      "expired/corrupt tokens do not authenticate",
      !expiredSession.data.user,
    );
    check(
      "expired/corrupt cookies are deleted",
      !sessionToken(expiredClient.cookies),
    );
    const loginPage = await expiredClient.request("/login");
    check(
      "expired/corrupt sessions can log in again",
      loginPage.response.status === 200,
    );
  }
  const failedClient = client();
  const csrf = await failedClient.request("/api/auth/csrf");
  const failedLogin = await failedClient.request(
    "/api/auth/callback/credentials",
    {
      form: {
        csrfToken: csrf.data.csrfToken,
        email: "student@fixture.invalid",
        password: "wrong",
        role: "STUDENT",
        remember: "true",
        json: "true",
      },
    },
  );
  check(
    "failed login does not create a remembered session",
    failedLogin.data.url.includes("error=") &&
      !sessionToken(failedClient.cookies),
  );
  check("all fixture backend sessions are revoked", backendSessions.size === 0);
  console.log(
    `Remember-login checks passed: ${checks}. Real NextAuth HTTP flow with an isolated mock backend; no production data changed.`,
  );
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  if (web && web.exitCode === null) {
    const exited = new Promise((accept) => web.once("exit", accept));
    web.kill();
    await exited;
  }
  backend.closeAllConnections();
  await new Promise((accept) => backend.close(accept));
}
