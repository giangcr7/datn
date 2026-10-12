import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { config } from "dotenv";
import assert from "node:assert/strict";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, "apps/api/.env") });
const port = 3101;
const server = spawn(process.execPath, ["dist/main.js"], {
  cwd: resolve(root, "apps/api"),
  env: {
    ...process.env,
    PORT: String(port),
    FABRIC_ENABLED: "false",
    OUTBOX_ENABLED: "false",
    PUBLIC_DIRECTORY_ENABLED: "false",
  },
  windowsHide: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
server.stdout.on("data", (data) => {
  log += data.toString();
});
server.stderr.on("data", (data) => {
  log += data.toString();
});
async function request(path, body, token) {
  const response = await fetch("http://127.0.0.1:" + port + "/api" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
try {
  let ready = false,
    lastHealth;
  for (let attempt = 0; attempt < 120; attempt++) {
    await delay(500);
    try {
      lastHealth = await request("/health");
      if (lastHealth.status === 200) {
        ready = true;
        break;
      }
    } catch (error) {
      lastHealth = String(error);
    }
  }
  assert(
    ready,
    "API did not start. Last health=" +
      JSON.stringify(lastHealth) +
      "\n" +
      log.slice(-2500),
  );
  const login = await request("/auth/login", {
    email: process.env.BOOTSTRAP_ORG2_EMAIL,
    password: process.env.BOOTSTRAP_ORG2_PASSWORD,
    role: "university",
  });
  assert.equal(login.status, 201, "Bootstrap login failed");
  assert.equal(login.data.user.org, "ORG2");
  assert(login.data.access_token && login.data.refresh_token);
  const actor = login.data.access_token;
  const me = await request("/auth/me", undefined, actor);
  assert.equal(me.status, 200);
  assert(!me.data.password && !me.data.passwordHash);
  const certs = await request("/cert?page=1&limit=20", undefined, actor);
  assert.equal(certs.status, 200);
  assert(Array.isArray(certs.data.data));
  const privateRead = await request(
    "/cert/00000000-0000-0000-0000-000000000000",
  );
  assert.equal(privateRead.status, 401);
  const directory = await request("/cert/search?q=xx");
  assert.equal(directory.status, 403);
  const staffSearch = await request("/cert/search?q=xx", undefined, actor);
  assert.equal(staffSearch.status, 200);
  assert(Array.isArray(staffSearch.data));
  const programs = await request("/imports/programs", undefined, actor);
  assert.equal(programs.status, 200);
  assert.equal(programs.data.length, 13);
  const drafts = await request("/cert/pending", undefined, actor);
  assert.equal(drafts.status, 200);
  assert(Array.isArray(drafts.data));
  const users = await request("/auth/users", undefined, actor);
  assert.equal(users.status, 403);
  const loggedOut = await request("/auth/logout", {
    refreshToken: login.data.refresh_token,
  });
  assert.equal(loggedOut.status, 201);
  const refresh = await request("/auth/refresh", {
    refreshToken: login.data.refresh_token,
  });
  assert.equal(refresh.status, 401);
  const denied = await request("/cert?page=1&limit=20", undefined, actor);
  assert.equal(
    denied.status,
    401,
    "Refresh-token reuse must invalidate old access token",
  );
  console.log(
    "API smoke passed: health, login, membership, profile, pagination, admin guard, private-read guard, closed public directory, authenticated search, program catalog, pending list, refresh reuse/session invalidation. Fabric disabled; no diploma issuance performed.",
  );
} finally {
  server.kill();
}
