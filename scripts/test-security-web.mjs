import assert from "node:assert/strict";
import { createWebLoader } from "./lib/web-component-loader.mjs";

let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}

let currentSession;
let incoming = new Headers();
let apiFailure = false;
const publicResult = { success: true, isValid: true };
const redirects = [];
const load = createWebLoader({
  "next-auth": { getServerSession: async () => currentSession },
  "next/headers": { headers: async () => incoming },
  "next/navigation": {
    redirect: (target) => {
      redirects.push(target);
      throw new Error("redirect:" + target);
    },
  },
  "@/lib/auth-options": { authOptions: {} },
  "@/lib/api": {
    apiCall: async () => {
      if (apiFailure) throw new Error("Fixture unavailable");
      return publicResult;
    },
  },
});
const { requireWorkspaceAccess } = load("lib/workspace-session.ts");
const { forwardedClientHeaders, requestClientHeaders } =
  load("lib/client-ip.ts");
const loginLayout = load("app/(public)/login/layout.tsx").default;
const verificationRoute = load("app/api/verify/route.ts");
const pdfRoute = load("app/api/verify/pdf/route.ts");
const originalForward = process.env.FORWARD_CLIENT_IP;
const originalFetch = globalThis.fetch;
try {
  for (const [role, path] of [
    ["admin", "/dashboard"],
    ["university", "/dashboard"],
    ["student", "/student/dashboard"],
  ]) {
    currentSession = {
      user: {
        id: "fixture",
        role,
        mustChangePassword: true,
        isHeadquarters: true,
        canApproveDiplomas: role === "university",
      },
      accessToken: "in-memory-fixture-token",
    };
    await assert.rejects(
      requireWorkspaceAccess(path),
      (error) => error.message === "redirect:/change-password",
    );
    check(
      "mandatory password change redirects " + role,
      redirects.at(-1) === "/change-password",
    );
    await assert.rejects(
      loginLayout({ children: "fixture" }),
      (error) => error.message === "redirect:/change-password",
    );
    check(
      "login layout redirects restricted " + role,
      redirects.at(-1) === "/change-password",
    );
  }
  currentSession = {
    user: { role: "admin" },
    accessToken: "fixture",
    error: "RefreshAccessTokenError",
  };
  await assert.rejects(
    requireWorkspaceAccess("/dashboard"),
    (error) => error.message === "redirect:/login",
  );
  check(
    "failed refresh does not allow a workspace page",
    redirects.at(-1) === "/login",
  );

  incoming = new Headers({ "X-Forwarded-For": "192.0.2.10, 127.0.0.1" });
  delete process.env.FORWARD_CLIENT_IP;
  check(
    "does not forward a client-controlled header by default",
    Object.keys(forwardedClientHeaders(incoming)).length === 0,
  );
  check(
    "does not read request headers when proxy forwarding is disabled",
    Object.keys(await requestClientHeaders()).length === 0,
  );
  check(
    "forwards an explicitly trusted IP chain only when enabled",
    forwardedClientHeaders(incoming, true)["X-Forwarded-For"] ===
      "192.0.2.10, 127.0.0.1",
  );
  check(
    "supports NextAuth request header records",
    forwardedClientHeaders({ "x-forwarded-for": "2001:db8::1" }, true)[
      "X-Forwarded-For"
    ] === "2001:db8::1",
  );
  for (const value of [
    "unknown",
    "192.0.2.10, evil",
    "127.0.0.1:1234",
    "a".repeat(513),
    "192.0.2.1,".repeat(9),
  ])
    check(
      "rejects malformed or excessive forwarded chains",
      Object.keys(forwardedClientHeaders({ "x-forwarded-for": value }, true))
        .length === 0,
    );
  process.env.FORWARD_CLIENT_IP = "true";
  check(
    "uses trusted request context when explicitly enabled",
    (await requestClientHeaders())["X-Forwarded-For"] ===
      "192.0.2.10, 127.0.0.1",
  );
  const verifyRequest = () =>
    new Request("http://fixture.invalid/api/verify", {
      method: "POST",
      body: JSON.stringify({ uuid: "fixture" }),
    });
  for (const failure of [false, true]) {
    apiFailure = failure;
    const response = await verificationRoute.POST(verifyRequest());
    check(
      "JSON verification never caches a result or error",
      response.headers.get("Cache-Control") === "no-store",
    );
    check(
      "JSON verification preserves success and error status",
      response.status === (failure ? 500 : 200),
    );
  }

  let forwarded;
  globalThis.fetch = async (_url, options) => {
    forwarded = options.headers;
    return Response.json(publicResult);
  };
  const upload = new FormData();
  upload.append(
    "file",
    new File(["%PDF-fixture"], "fixture.pdf", {
      type: "application/pdf",
    }),
  );
  const pdfResponse = await pdfRoute.POST(
    new Request("http://fixture.invalid/api/verify/pdf", {
      method: "POST",
      body: upload,
    }),
  );
  check(
    "PDF verification does not cache the public result",
    pdfResponse.status === 200 &&
      pdfResponse.headers.get("Cache-Control") === "no-store",
  );
  check(
    "PDF upload uses opt-in trusted forwarding",
    forwarded["X-Forwarded-For"] === "192.0.2.10, 127.0.0.1",
  );
  const oversized = await pdfRoute.POST(
    new Request("http://fixture.invalid/api/verify/pdf", {
      method: "POST",
      headers: { "Content-Length": String(11 * 1024 * 1024) },
      body: "fixture",
    }),
  );
  check(
    "PDF size rejection is also non-cacheable",
    oversized.status === 413 &&
      oversized.headers.get("Cache-Control") === "no-store",
  );
  console.log("Web security regression: " + checks + " checks passed");
} finally {
  globalThis.fetch = originalFetch;
  if (originalForward === undefined) delete process.env.FORWARD_CLIENT_IP;
  else process.env.FORWARD_CLIENT_IP = originalForward;
}
