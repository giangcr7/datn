import { createRequire } from "node:module";
import { createPublicKey, randomUUID, sign, verify } from "node:crypto";
import { mkdir, readFile, writeFile, lstat } from "node:fs/promises";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  secretLocations,
  digest,
  inventory,
  secretFiles,
  createBundle,
  parseBundle,
} from "./lib/key-management.mjs";

const require = createRequire(import.meta.url);
export const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const vault = join(
  process.env.LOCALAPPDATA || "",
  "DiplomaChain",
  "secrets",
  digest(Buffer.from(workspace.toLowerCase())).slice(0, 12),
);
const powershell = join(
  process.env.SystemRoot || "C:/Windows",
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);

export function keyAccess(
  action,
  paths,
  manifest,
  roots = { workspace, vault },
) {
  const result = spawnSync(
    powershell,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      join(workspace, "scripts/lib/key-access.ps1"),
      "-Action",
      action,
    ],
    {
      input: JSON.stringify({ ...roots, paths, manifest }),
      encoding: "utf8",
      windowsHide: true,
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      "Key access operation failed; " +
        (result.stderr?.match(
          /DIPLOMACHAIN_KEY_ACCESS_FAILED:[A-Za-z]+:[0-9]+:[A-Za-z]+/,
        )?.[0] || "provider unavailable"),
    );
  return JSON.parse(result.stdout);
}

function security() {
  return require("../apps/api/dist/security/protected-data.js");
}
function wallets() {
  return require("../apps/api/dist/fabric/fabric-wallet.js");
}
export async function backupBundle(root = workspace) {
  return createBundle(root, async (bytes, path) => {
    if (!path.startsWith("wallet/")) return bytes;
    if (!path.endsWith(".json") && !path.includes("/keystore/")) return bytes;
    if (!bytes.toString("utf8").trimStart().startsWith("{")) return bytes;
    const value = JSON.parse(bytes.toString("utf8"));
    if (value.format === "diplomachain.enrollment-key.v1")
      return security().unprotectForCurrentUser(
        security().decodeProtectedBase64(value.protectedData),
        value.format + ":" + digest(Buffer.from(path)),
      );
    if (value.format !== "diplomachain.fabric-wallet.v1") return bytes;
    if (
      value.protection !== "windows-dpapi-current-user" ||
      !["Org1MSP", "Org2MSP"].includes(value.mspId) ||
      !/^[a-f0-9]{64}$/.test(value.certificateSha256)
    )
      throw new Error("Protected wallet backup rejected");
    const plaintext = security().unprotectForCurrentUser(
      security().decodeProtectedBase64(value.protectedData),
      value.format + ":" + value.mspId + ":" + value.certificateSha256,
    );
    try {
      wallets().validateFabricWallet(JSON.parse(plaintext.toString("utf8")), {
        expectedMspId: value.mspId,
        certificateSha256: value.certificateSha256,
      });
      return plaintext;
    } catch {
      plaintext.fill(0);
      throw new Error("Protected wallet backup identity rejected");
    }
  });
}
async function ensureVault() {
  if (process.platform !== "win32" || !process.env.LOCALAPPDATA)
    throw new Error("Windows user profile is required");
  await mkdir(vault, { recursive: true });
  if ((await lstat(vault)).isSymbolicLink())
    throw new Error("Vault must not be a link");
  const audit = keyAccess("Audit", [vault]);
  if (
    !audit.unexpectedGrants.length &&
    !audit.unprotectedPaths.some(
      (path) => path.toLowerCase() === vault.toLowerCase(),
    )
  )
    return;
  keyAccess(
    "Apply",
    [vault],
    join(vault, "acl-vault-" + randomUUID() + ".dpapi"),
  );
}

async function saveLocalBackup() {
  const data = await backupBundle();
  try {
    const sealed = security().protectForCurrentUser(
      data,
      "diplomachain.backup.v1",
    );
    const recovered = security().unprotectForCurrentUser(
      sealed,
      "diplomachain.backup.v1",
    );
    try {
      if (digest(recovered) !== digest(data))
        throw new Error("Backup verification failed");
      parseBundle(recovered);
    } finally {
      recovered.fill(0);
    }
    const path = join(vault, "keys-" + randomUUID() + ".dpapi");
    await writeFile(
      path,
      JSON.stringify({
        format: "diplomachain.local-backup.v1",
        protectedData: sealed.toString("base64"),
      }),
      { flag: "wx" },
    );
    return {
      path,
      files: parseBundle(data).files.length,
      omitted: parseBundle(data).omitted || [],
      verifiedInMemory: true,
    };
  } finally {
    data.fill(0);
  }
}

async function passwordFromStdin() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString();
    if (input.length > 8192) throw new Error("Invalid secure input");
  }
  const value = JSON.parse(input);
  if (typeof value.password !== "string")
    throw new Error("Passphrase required through secure stdin");
  return Buffer.from(value.password, "utf8");
}

async function readBackup(path, password) {
  const info = await lstat(path);
  if (!info.isFile() || info.size > 48 * 1024 * 1024)
    throw new Error("Invalid backup file");
  const envelope = JSON.parse(await readFile(path, "utf8"));
  if (envelope.format === "diplomachain.local-backup.v1")
    return security().unprotectForCurrentUser(
      security().decodeProtectedBase64(envelope.protectedData),
      "diplomachain.backup.v1",
    );
  if (envelope.format === "diplomachain.portable-backup.v1" && password)
    return security().openPasswordBackup(envelope, password);
  throw new Error("Unsupported backup or missing secure passphrase");
}

export async function main(args = process.argv.slice(2)) {
  const command = args[0] || "inventory";
  const option = (name) => {
    const index = args.indexOf("--" + name);
    return index < 0 ? undefined : args[index + 1];
  };
  const apply = args.includes("--apply");
  if (command === "inventory")
    return {
      createdAt: new Date().toISOString(),
      entries: await inventory(workspace),
      note: "File copies are not distinct cryptographic identities. Public certificate hashes are not secrets.",
    };
  if (command === "audit")
    return keyAccess(
      "Audit",
      (await secretLocations(workspace)).map((path) =>
        resolve(workspace, path),
      ),
    );
  if (command === "restore-acl") {
    if (!apply || !option("manifest"))
      throw new Error("Explicit --apply and --manifest are required");
    return keyAccess("Restore", [], resolve(option("manifest")));
  }
  if (
    ["backup-local", "backup-portable", "harden", "protect-wallet"].includes(
      command,
    )
  ) {
    if (!apply)
      throw new Error(
        "Explicit --apply is required; inventory and audit are read-only",
      );
    security();
    if (command === "protect-wallet") wallets();
    await ensureVault();
  }
  if (command === "backup-local") return saveLocalBackup();
  if (command === "backup-portable") {
    const password = await passwordFromStdin();
    const data = await backupBundle();
    try {
      const envelope = security().sealPasswordBackup(data, password);
      const recovered = security().openPasswordBackup(envelope, password);
      try {
        if (digest(data) !== digest(recovered))
          throw new Error("Backup verification failed");
        parseBundle(recovered);
      } finally {
        recovered.fill(0);
      }
      const path = join(vault, "portable-" + randomUUID() + ".keybackup");
      await writeFile(path, JSON.stringify(envelope), { flag: "wx" });
      return {
        path,
        files: parseBundle(data).files.length,
        omitted: parseBundle(data).omitted || [],
        verifiedInMemory: true,
        actionRequired:
          "Copy encrypted backup to offline storage; keep the passphrase separately",
      };
    } finally {
      password.fill(0);
      data.fill(0);
    }
  }
  if (command === "verify-backup" || command === "recover-wallet") {
    if (!option("backup")) throw new Error("--backup is required");
    const password = args.includes("--password-stdin")
      ? await passwordFromStdin()
      : undefined;
    let data;
    try {
      data = await readBackup(resolve(option("backup")), password);
      const bundle = parseBundle(data);
      if (command === "verify-backup")
        return {
          files: bundle.files.length,
          omitted: bundle.omitted || [],
          verifiedInMemory: true,
          wrotePlaintext: false,
        };
      if (!apply || !option("wallet"))
        throw new Error(
          "--apply and --wallet <bundle-relative-path> are required",
        );
      const entry = bundle.files.find((file) => file.path === option("wallet"));
      if (!entry) throw new Error("Wallet not found in backup");
      await ensureVault();
      const bytes = Buffer.from(entry.data, "base64");
      try {
        const raw = JSON.parse(bytes.toString("utf8"));
        if (raw.format)
          throw new Error(
            "Recovery requires a pre-migration backup containing the original wallet",
          );
        const envelope = wallets().sealFabricWallet(bytes, raw.mspId);
        const path = join(vault, "recovered-" + randomUUID() + ".json");
        await writeFile(path, JSON.stringify(envelope), { flag: "wx" });
        wallets().loadFabricWallet(path, {
          expectedMspId: raw.mspId,
          certificateSha256: envelope.certificateSha256,
        });
        return {
          path,
          certificateSha256: envelope.certificateSha256,
          wrotePlaintext: false,
          note: "Update runtime wallet path and certificate pin only after approving the recovered identity",
        };
      } finally {
        bytes.fill(0);
      }
    } finally {
      data?.fill(0);
      password?.fill(0);
    }
  }
  if (command === "harden") {
    const backup = await saveLocalBackup();
    const manifest = join(vault, "acl-project-" + randomUUID() + ".dpapi");
    const result = keyAccess(
      "Apply",
      (await secretLocations(workspace))
        .filter((path) => !backup.omitted.some((entry) => entry.path === path))
        .map((path) => resolve(workspace, path)),
      manifest,
    );
    return { backup, manifest, ...result };
  }
  if (command === "protect-wallet") {
    const source = resolve(workspace, "wallet/issuer-org1.json");
    const data = await readFile(source);
    try {
      const existing = JSON.parse(data.toString("utf8"));
      if (existing.format)
        throw new Error(
          "Wallet is already protected; use inventory and audit instead",
        );
      const backup = await saveLocalBackup();
      const envelope = wallets().sealFabricWallet(data, "Org1MSP");
      const path = join(vault, "issuer-org1-" + randomUUID() + ".json");
      await writeFile(path, JSON.stringify(envelope), { flag: "wx" });
      const identity = wallets().loadFabricWallet(path, {
        expectedMspId: "Org1MSP",
        certificateSha256: envelope.certificateSha256,
      });
      const challenge = Buffer.from(
        "DiplomaChain wallet migration identity check",
      );
      if (
        !verify(
          "sha256",
          challenge,
          createPublicKey(identity.privateKey),
          sign("sha256", challenge, identity.privateKey),
        )
      )
        throw new Error("Wallet signing check failed");
      const envPath = resolve(workspace, "apps/api/.env");
      let env = await readFile(envPath, "utf8");
      const values = {
        ORG1_WALLET_PATH: path.split(sep).join("/"),
        ORG1_WALLET_CERT_SHA256: identity.fingerprint,
        FABRIC_ALLOW_LEGACY_WALLET: "false",
      };
      for (const [key, value] of Object.entries(values)) {
        const pattern = new RegExp("^" + key + "=.*$", "m");
        const line = key + "=" + value;
        env = pattern.test(env)
          ? env.replace(pattern, () => line)
          : env.trimEnd() + "\n" + line + "\n";
      }
      await writeFile(envPath, env);
      await writeFile(source, JSON.stringify(envelope));
      let protectedEnrollmentFiles = 0;
      for (const file of await secretFiles(workspace)) {
        if (
          !file.path.startsWith("wallet/") ||
          !file.path.includes("/keystore/")
        )
          continue;
        const rawKey = await readFile(file.absolute);
        try {
          if (!rawKey.toString("utf8").includes("PRIVATE KEY-----")) continue;
          const format = "diplomachain.enrollment-key.v1";
          const protectedData = security().protectForCurrentUser(
            rawKey,
            format + ":" + digest(Buffer.from(file.path)),
          );
          const recovered = security().unprotectForCurrentUser(
            protectedData,
            format + ":" + digest(Buffer.from(file.path)),
          );
          try {
            if (digest(recovered) !== digest(rawKey))
              throw new Error("Enrollment key protection verification failed");
          } finally {
            recovered.fill(0);
          }
          await writeFile(
            file.absolute,
            JSON.stringify({
              format,
              protection: "windows-dpapi-current-user",
              protectedData: protectedData.toString("base64"),
            }),
          );
          protectedEnrollmentFiles++;
        } finally {
          rawKey.fill(0);
        }
      }
      return {
        backup,
        wallet: path,
        certificateSha256: identity.fingerprint,
        expiresAt: identity.expiresAt,
        identityUnchanged: true,
        plaintextWalletReplaced: true,
        protectedEnrollmentFiles,
        runtimeRestartRequired: true,
      };
    } finally {
      data.fill(0);
    }
  }
  throw new Error(
    "Unknown command. Use inventory, audit, backup-local, backup-portable, verify-backup, recover-wallet, harden, protect-wallet or restore-acl",
  );
}

if (
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url
) {
  try {
    console.log(JSON.stringify(await main(), null, 2));
  } catch {
    console.error(
      "Key management failed. Check the command, authorized Windows account, protected paths and backup integrity. No secret details are logged.",
    );
    process.exitCode = 1;
  }
}
