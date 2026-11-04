import { createHash, X509Certificate } from "node:crypto";
import { lstat, readdir, readFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

export const secretRoots = [
  ".env.infrastructure",
  "apps/api/.env",
  "apps/api/.env.database",
  "apps/web/.env.local",
  "wallet",
  ".data/signing",
  "blockchain-network/organizations",
  ".fabric-ca-client",
];
export async function secretLocations(workspace) {
  const locations = [...secretRoots];
  const data = resolve(workspace, ".data");
  for (const entry of await readdir(data, { withFileTypes: true }).catch(
    (error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  )) {
    if (entry.name.startsWith("fabric-backup-") && entry.isDirectory())
      locations.push(".data/" + entry.name + "/organizations");
  }
  const backups = resolve(data, "backups");
  for (const entry of await readdir(backups, { withFileTypes: true }).catch(
    (error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    },
  )) {
    if (entry.isDirectory())
      locations.push(
        ".data/backups/" + entry.name + "/configuration-and-wallet.tar.gz",
      );
  }
  return locations;
}
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

export function safeRelative(path) {
  if (
    typeof path !== "string" ||
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path.includes(":") ||
    path.split("/").some((part) => !part || part === "." || part === "..")
  )
    throw new Error("Unsafe backup path");
  return path;
}

export async function secretFiles(workspace) {
  const files = [];
  async function visit(path) {
    let ancestor = resolve(path);
    while (ancestor !== dirname(ancestor)) {
      const entry = await lstat(ancestor).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (entry?.isSymbolicLink())
        throw new Error("Secret paths must not contain links");
      ancestor = dirname(ancestor);
    }
    const info = await lstat(path).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (!info) return;
    if (info.isSymbolicLink())
      throw new Error("Secret paths must not contain links");
    if (info.isDirectory()) {
      for (const name of await readdir(path)) await visit(resolve(path, name));
    } else if (info.isFile()) {
      const local = safeRelative(
        relative(workspace, path).split(sep).join("/"),
      );
      files.push({ path: local, absolute: path, bytes: info.size });
    }
  }
  for (const root of await secretLocations(workspace))
    await visit(resolve(workspace, root));
  return files.sort((first, second) => first.path.localeCompare(second.path));
}

export function classify(path) {
  if (/\.env/.test(path)) return "Application configuration";
  if (path.startsWith("wallet/")) return "Fabric application identity";
  if (path.startsWith(".data/signing/"))
    return /(?:CA|TSA)[-_]/i.test(path)
      ? "PDF CA / timestamp authority"
      : "PDF signing";
  if (/fabric-ca\/|\/ca\/|\/tlsca\//i.test(path)) return "Fabric CA / TLS CA";
  if (/\/users\/Admin@/i.test(path)) return "Fabric administrator";
  if (/\/tls\//i.test(path)) return "Fabric node TLS";
  return "Fabric node / enrollment";
}

export async function inventory(workspace) {
  const result = [];
  for (const file of await secretFiles(workspace)) {
    let bytes;
    try {
      bytes = await readFile(file.absolute);
    } catch (error) {
      if (
        ["EPERM", "EACCES"].includes(error.code) &&
        file.path.endsWith("/configuration-and-wallet.tar.gz")
      ) {
        result.push({
          path: file.path,
          role: "Retained historical evidence",
          kind: "unreadable-retained-backup",
          protection:
            "Existing ACL denies reading; content and permissions preserved",
        });
        continue;
      }
      throw error;
    }
    try {
      const text = bytes.toString("utf8");
      const role = classify(file.path);
      const privateKey = /-----BEGIN (?:[A-Z ]*PRIVATE KEY)-----/.test(text);
      if (
        privateKey ||
        /\.env|(?:settings|identities)\.json$/.test(file.path) ||
        file.path.startsWith("wallet/") ||
        /configuration-and-wallet\.tar\.gz$|fabric-ca-client-config\.yaml$/.test(
          file.path,
        )
      ) {
        result.push({
          path: file.path,
          role,
          kind: privateKey ? "private-key-file" : "secret-configuration",
          protection: /ENCRYPTED PRIVATE KEY|Proc-Type: 4,ENCRYPTED/.test(text)
            ? "encrypted PEM"
            : /windows-dpapi-current-user/.test(text)
              ? "Windows DPAPI CurrentUser"
              : "plaintext; ACL required",
        });
      }
      const certificates =
        text.match(
          /^-----BEGIN CERTIFICATE-----\r?\n[\s\S]*?^-----END CERTIFICATE-----/gm,
        ) || [];
      if (file.path.startsWith("wallet/") && file.path.endsWith(".json")) {
        const wallet = JSON.parse(text);
        if (typeof wallet.credentials?.certificate === "string")
          certificates.push(wallet.credentials.certificate);
        else if (typeof wallet.certificate === "string")
          certificates.push(wallet.certificate);
      }
      for (const pem of certificates) {
        const certificate = new X509Certificate(pem);
        result.push({
          path: file.path,
          role,
          kind: "public-certificate",
          sha256: certificate.fingerprint256.replaceAll(":", "").toLowerCase(),
          expiresAt: new Date(certificate.validTo).toISOString(),
          daysRemaining: Math.floor(
            (Date.parse(certificate.validTo) - Date.now()) / 86400000,
          ),
          selfSigned: certificate.checkIssued(certificate),
        });
      }
    } finally {
      bytes.fill(0);
    }
  }
  return result;
}

export async function createBundle(
  workspace,
  transform = async (bytes) => bytes,
) {
  const files = [];
  const omitted = [];
  let total = 0;
  for (const file of await secretFiles(workspace)) {
    total += file.bytes;
    if (total > 16 * 1024 * 1024)
      throw new Error("Secret backup exceeds the 16 MiB limit");
    let bytes;
    try {
      bytes = await readFile(file.absolute);
    } catch (error) {
      if (
        ["EPERM", "EACCES"].includes(error.code) &&
        file.path.endsWith("/configuration-and-wallet.tar.gz")
      ) {
        omitted.push({
          path: file.path,
          reason:
            "Existing ACL denies reading; historical evidence preserved unchanged",
        });
        continue;
      }
      throw error;
    }
    let normalized;
    try {
      normalized = await transform(bytes, file.path);
      files.push({
        path: file.path,
        sha256: digest(normalized),
        data: normalized.toString("base64"),
      });
    } finally {
      bytes.fill(0);
      normalized?.fill(0);
    }
  }
  if (!files.length) throw new Error("No secrets found for backup");
  return Buffer.from(
    JSON.stringify({
      format: "diplomachain.key-bundle.v1",
      createdAt: new Date().toISOString(),
      files,
      omitted,
    }),
  );
}

export function parseBundle(bytes) {
  if (bytes.length > 32 * 1024 * 1024) throw new Error("Backup is too large");
  const bundle = JSON.parse(bytes.toString("utf8"));
  if (
    bundle.format !== "diplomachain.key-bundle.v1" ||
    !Array.isArray(bundle.files) ||
    !bundle.files.length ||
    bundle.files.length > 5000
  )
    throw new Error("Invalid backup bundle");
  const seen = new Set();
  for (const file of bundle.files) {
    safeRelative(file.path);
    const normalized = file.path.toLowerCase();
    if (
      seen.has(normalized) ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      typeof file.data !== "string" ||
      file.data.length % 4 !== 0 ||
      !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)
    )
      throw new Error("Invalid backup entry");
    seen.add(normalized);
    const data = Buffer.from(file.data, "base64");
    try {
      if (digest(data) !== file.sha256)
        throw new Error("Backup checksum mismatch");
    } finally {
      data.fill(0);
    }
  }
  return bundle;
}
