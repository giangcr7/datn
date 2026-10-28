import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { setupDemoPki, startDemoPki } from "./lib/demo-pki.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, ".data/signing/pki-v2");
const envPath = resolve(root, "apps/api/.env");
const env = await readFile(envPath, "utf8");
const existing = parse(env);
assert(
  existing.NODE_ENV !== "production" &&
    !["certificate"].includes(existing.PDF_SIGNING_MODE),
  "Refusing to replace production signing configuration with a local DEMO CA",
);
const settings = await setupDemoPki(directory);
if (process.argv.includes("--configure-env")) {
  let updated = env;
  for (const [key, value] of Object.entries(settings)) {
    const expression = new RegExp("^" + key + "=.*$", "m");
    updated = expression.test(updated)
      ? updated.replace(expression, key + "=" + value)
      : updated.trimEnd() + "\n" + key + "=" + value + "\n";
  }
  await writeFile(envPath, updated, { mode: 0o600 });
}
if (process.argv.includes("--serve")) {
  const server = await startDemoPki(directory);
  console.log(
    "Local DEMO TSA/OCSP/CRL listening on 127.0.0.1:3318. Not a public trust service.",
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => server.close());
} else
  console.log(
    "Local DEMO PKI certificates ready. Existing PDF files and old signing keys are preserved.",
  );
