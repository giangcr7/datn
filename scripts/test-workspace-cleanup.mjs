import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const temporaryRoot = fs.mkdtempSync(
  path.join(os.tmpdir(), "diplomachain-cleanup-"),
);
const workspace = path.join(temporaryRoot, "project");
const script = path.join(workspace, "scripts", "clean-workspace.ps1");
let checks = 0;
function check(label, condition) {
  assert(condition, label);
  checks++;
}
function write(relative, content = "fixture") {
  const target = path.join(workspace, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}
function run(...args) {
  return spawnSync(
    "powershell",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, ...args],
    { cwd: workspace, encoding: "utf8", windowsHide: true },
  );
}
function git(...args) {
  execFileSync("git", args, {
    cwd: workspace,
    windowsHide: true,
    stdio: "pipe",
  });
}
function hash(relative) {
  return createHash("sha256")
    .update(fs.readFileSync(path.join(workspace, relative)))
    .digest("hex");
}
const protectedFiles = [
  "README.md",
  "src/main.ts",
  ".data/documents/signed.pdf",
  ".data/backups/backup.dump",
  ".data/signing/private-key.pem",
  "wallet/identity.json",
  "docs/report.md",
  "node_modules/package/entry.js",
  "apps/api/assets/template.pdf",
  "apps/api/src/generated/client.ts",
  "apps/api/dist/main.js",
  "apps/web/.next/BUILD_ID",
  "chaincode/dist/contract.js",
];
const disposable = [
  "tmp/test.log",
  ".cache/render/page.png",
  ".data/logs/api.out.log",
  "apps/api/logs/debug.log",
  "apps/web/.next/dev/cache.bin",
  "apps/web/tsconfig.tsbuildinfo",
];
let junction = null;
try {
  fs.mkdirSync(path.dirname(script), { recursive: true });
  fs.copyFileSync(
    fileURLToPath(new URL("./clean-workspace.ps1", import.meta.url)),
    script,
  );
  git("init", "--quiet");
  for (const relative of [...protectedFiles, ...disposable]) write(relative);
  git("add", "README.md", "src/main.ts");
  const before = new Map(
    protectedFiles.map((relative) => [relative, hash(relative)]),
  );
  let result = run();
  check("preview succeeds", result.status === 0);
  check(
    "preview does not remove artifacts",
    disposable.every((relative) =>
      fs.existsSync(path.join(workspace, relative)),
    ),
  );
  result = run("-Apply");
  check("explicit cleanup succeeds", result.status === 0);
  check(
    "disposable files are removed",
    disposable.every(
      (relative) => !fs.existsSync(path.join(workspace, relative)),
    ),
  );
  check(
    "source, data, credentials, dependencies and production builds remain unchanged",
    protectedFiles.every((relative) => hash(relative) === before.get(relative)),
  );
  result = run("-Apply");
  check(
    "cleanup is idempotent",
    result.status === 0 &&
      result.stdout.includes("Standard cleanup targets are clean"),
  );

  write("tmp/intentional.txt");
  git("add", "tmp/intentional.txt");
  result = run("-Apply");
  check(
    "tracked file blocks cleanup",
    result.status !== 0 &&
      fs.existsSync(path.join(workspace, "tmp/intentional.txt")),
  );
  git("update-index", "--force-remove", "tmp/intentional.txt");
  write("apps/api/.env", "STORAGE_LOCAL_ROOT=../../tmp/storage\n");
  write("tmp/storage/signed.pdf");
  result = run("-Apply");
  check(
    "configured document storage blocks cleanup",
    result.status !== 0 &&
      fs.existsSync(path.join(workspace, "tmp/storage/signed.pdf")),
  );
  write("apps/api/.env", "STORAGE_LOCAL_ROOT=../../.data/documents\n");

  const outside = path.join(temporaryRoot, "outside");
  fs.mkdirSync(outside);
  const sentinel = path.join(outside, "must-keep.txt");
  fs.writeFileSync(sentinel, "external dependency sentinel");
  junction = path.join(workspace, ".cache");
  fs.symlinkSync(outside, junction, "junction");
  result = run("-Apply");
  check(
    "junction is rejected without traversing it",
    result.status !== 0 &&
      fs.readFileSync(sentinel, "utf8") === "external dependency sentinel",
  );
  fs.rmdirSync(junction);
  junction = null;
  write(".cache/nested/safe.txt");
  junction = path.join(workspace, ".cache", "nested", "dependency");
  fs.symlinkSync(outside, junction, "junction");
  result = run("-Apply");
  check(
    "nested junction blocks all deletion",
    result.status !== 0 &&
      fs.existsSync(path.join(workspace, "tmp/storage/signed.pdf")) &&
      fs.readFileSync(sentinel, "utf8") === "external dependency sentinel",
  );
  fs.rmdirSync(junction);
  junction = null;

  const listener = createServer();
  try {
    listener.listen(3100, "127.0.0.1");
    await once(listener, "listening");
    result = run("-Apply");
    check(
      "running server blocks deletion",
      result.status !== 0 &&
        fs.existsSync(path.join(workspace, ".cache/nested/safe.txt")),
    );
  } finally {
    await new Promise((resolve) => listener.close(resolve));
  }
  result = run("-Builds");
  check(
    "build cleanup is preview-only unless explicitly applied",
    result.status === 0 &&
      fs.existsSync(path.join(workspace, "apps/api/dist/main.js")),
  );
  result = run("-Apply", "-Builds");
  check(
    "explicit build cleanup removes rebuildable bundles",
    result.status === 0 &&
      !fs.existsSync(path.join(workspace, "apps/api/dist")) &&
      !fs.existsSync(path.join(workspace, "apps/web/.next")) &&
      !fs.existsSync(path.join(workspace, "chaincode/dist")),
  );
  check(
    "build cleanup preserves stored documents and external targets",
    hash(".data/documents/signed.pdf") ===
      before.get(".data/documents/signed.pdf") &&
      fs.readFileSync(sentinel, "utf8") === "external dependency sentinel",
  );
} finally {
  if (junction && fs.existsSync(junction)) fs.rmdirSync(junction);
  const resolved = path.resolve(temporaryRoot);
  assert(
    resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith("diplomachain-cleanup-"),
  );
  fs.rmSync(resolved, { recursive: true, force: true });
}
console.log(
  "Workspace cleanup safety checks passed: " +
    checks +
    ". All isolated test files removed.",
);
