import assert from "node:assert/strict";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import test from "node:test";
import { setupDemoPki } from "./lib/demo-pki.mjs";
import { keyAccess, backupBundle } from "./manage-keys.mjs";
import {
  createBundle,
  parseBundle,
  safeRelative,
  inventory,
  classify,
  digest,
} from "./lib/key-management.mjs";

const require = createRequire(import.meta.url);
const protectedData = require("../apps/api/dist/security/protected-data.js");
const wallets = require("../apps/api/dist/fabric/fabric-wallet.js");
const { ConfigService } = require("@nestjs/config");
const { FabricService } = require("../apps/api/dist/fabric/fabric.service.js");
const { CertContract } = require("../chaincode/dist/certContract.js");

test(
  "key custody isolated regression suite",
  { timeout: 120000 },
  async (suite) => {
    const directory = await mkdtemp(
      join(tmpdir(), "diplomachain-key-custody-"),
    );
    const fixture = join(directory, "workspace");
    const fixtureVault = join(directory, "vault");
    try {
      await mkdir(join(fixture, "wallet"), { recursive: true });
      await mkdir(fixtureVault);
      const settings = await setupDemoPki(join(directory, "pki"));
      const certificate = await readFile(settings.PDF_ORG1_CERT_PATH, "utf8");
      const encryptedKey = await readFile(settings.PDF_ORG1_KEY_PATH);
      const key = createPrivateKey({
        key: encryptedKey,
        passphrase: settings.PDF_ORG1_PASSWORD,
      });
      encryptedKey.fill(0);
      const raw = {
        type: "X.509",
        mspId: "Org1MSP",
        credentials: {
          certificate,
          privateKey: key.export({ format: "pem", type: "pkcs8" }).toString(),
        },
      };
      const bytes = Buffer.from(JSON.stringify(raw));
      const identity = wallets.validateFabricWallet(raw, {
        expectedMspId: "Org1MSP",
      });
      const options = {
        expectedMspId: "Org1MSP",
        certificateSha256: identity.fingerprint,
      };
      const path = join(fixture, "wallet/issuer-org1.json");
      const envelope = wallets.sealFabricWallet(bytes, "Org1MSP");
      await writeFile(path, JSON.stringify(envelope));
      bytes.fill(0);
      const check = async (name, run) => suite.test(name, run);
      await check("DPAPI roundtrip and purpose binding", () => {
        const original = Buffer.from("synthetic-secret");
        const sealed = protectedData.protectForCurrentUser(
          original,
          "custody-test",
        );
        assert.deepEqual(
          protectedData.unprotectForCurrentUser(sealed, "custody-test"),
          original,
        );
        assert.throws(() =>
          protectedData.unprotectForCurrentUser(sealed, "different-purpose"),
        );
      });
      await check("DPAPI rejects modified ciphertext", () => {
        const changed = Buffer.from(envelope.protectedData, "base64");
        changed[changed.length - 1] ^= 1;
        assert.throws(() =>
          protectedData.unprotectForCurrentUser(
            changed,
            "diplomachain.fabric-wallet.v1:Org1MSP:" + identity.fingerprint,
          ),
        );
      });
      await check(
        "protected wallet preserves identity and can sign in memory",
        () => {
          const restored = wallets.loadFabricWallet(path, options);
          assert.equal(restored.fingerprint, identity.fingerprint);
          const challenge = Buffer.from("isolated signing challenge");
          assert(
            verify(
              "sha256",
              challenge,
              createPublicKey(restored.privateKey),
              sign("sha256", challenge, restored.privateKey),
            ),
          );
        },
      );
      await check(
        "protected file contains no plaintext PEM private key",
        async () => {
          assert(!(await readFile(path, "utf8")).includes("BEGIN PRIVATE KEY"));
        },
      );
      await check("protected wallet requires a pinned certificate", () =>
        assert.throws(() =>
          wallets.loadFabricWallet(path, { expectedMspId: "Org1MSP" }),
        ),
      );
      await check("wallet rejects a wrong pin", () =>
        assert.throws(() =>
          wallets.loadFabricWallet(path, {
            ...options,
            certificateSha256: "a".repeat(64),
          }),
        ),
      );
      await check("wallet rejects a wrong MSP", () =>
        assert.throws(() =>
          wallets.loadFabricWallet(path, {
            ...options,
            expectedMspId: "Org2MSP",
          }),
        ),
      );
      await check("wallet rejects a mismatched key pair", () => {
        const other = generateKeyPairSync("ec", { namedCurve: "prime256v1" })
          .privateKey.export({ type: "pkcs8", format: "pem" })
          .toString();
        assert.throws(() =>
          wallets.validateFabricWallet(
            { ...raw, credentials: { certificate, privateKey: other } },
            options,
          ),
        );
      });
      await check(
        "wallet rejects expired and not-yet-valid certificates",
        () => {
          const now = Date.now;
          try {
            Date.now = () => Date.parse(identity.expiresAt) + 1;
            assert.throws(() => wallets.validateFabricWallet(raw, options));
            Date.now = () => 0;
            assert.throws(() => wallets.validateFabricWallet(raw, options));
          } finally {
            Date.now = now;
          }
        },
      );
      await check(
        "missing and malformed wallets produce sanitized errors",
        async () => {
          assert.throws(
            () => wallets.loadFabricWallet(join(directory, "missing"), options),
            /Fabric wallet unavailable/,
          );
          const malformed = join(directory, "malformed.json");
          await writeFile(malformed, "synthetic-private-secret{");
          assert.throws(
            () => wallets.loadFabricWallet(malformed, options),
            (error) => !error.message.includes("synthetic-private-secret"),
          );
        },
      );
      await check("tampered protected wallet is rejected", async () => {
        const changed = Buffer.from(envelope.protectedData, "base64");
        changed[changed.length - 1] ^= 1;
        const tampered = join(directory, "tampered.json");
        await writeFile(
          tampered,
          JSON.stringify({
            ...envelope,
            protectedData: changed.toString("base64"),
          }),
        );
        assert.throws(() => wallets.loadFabricWallet(tampered, options));
      });
      await check(
        "wallet rejects modified public certificate metadata",
        async () => {
          const tampered = join(directory, "metadata-tampered.json");
          await writeFile(
            tampered,
            JSON.stringify({
              ...envelope,
              certificate: envelope.certificate + "\n",
            }),
          );
          assert.throws(() => wallets.loadFabricWallet(tampered, options));
        },
      );
      const legacy = join(directory, "synthetic-legacy.json");
      await writeFile(legacy, JSON.stringify(raw));
      await check("legacy wallet requires an explicit opt-in", () => {
        assert.throws(() => wallets.loadFabricWallet(legacy, options));
        assert.equal(
          wallets.loadFabricWallet(legacy, { ...options, allowLegacy: true })
            .fingerprint,
          identity.fingerprint,
        );
      });
      await check(
        "production gateway rejects legacy even when opt-in is true",
        async () => {
          const config = new ConfigService({
            NODE_ENV: "production",
            FABRIC_ENABLED: "true",
            FABRIC_NETWORK_BASE: fixture,
            ORG1_WALLET_PATH: legacy,
            FABRIC_ALLOW_LEGACY_WALLET: "true",
          });
          const service = new FabricService(config);
          await assert.rejects(service.getGateway("Org1MSP"), /wallet|danh t/i);
          service.onModuleDestroy();
        },
      );
      await check(
        "ACL backup, restriction, denial probes and rollback",
        async () => {
          const roots = { workspace: fixture, vault: fixtureVault };
          const paths = [join(fixture, "wallet")];
          const manifest = join(fixtureVault, "acl.dpapi");
          const before = keyAccess("Audit", paths, undefined, roots);
          const applied = keyAccess("Apply", paths, manifest, roots);
          assert.equal(applied.unexpectedGrants.length, 0);
          const reapplied = keyAccess(
            "Apply",
            paths,
            join(fixtureVault, "acl-reapply.dpapi"),
            roots,
          );
          assert.equal(reapplied.unexpectedGrants.length, 0);
          const probe = keyAccess("Probe", paths, undefined, roots);
          assert(probe.probes.length > 0);
          assert(
            probe.probes.every(
              (entry) =>
                entry.anonymousReadDenied && entry.anonymousWriteDenied,
            ),
          );
          assert(!(await readFile(manifest, "utf8")).includes("sddl"));
          const restored = keyAccess("Restore", paths, manifest, roots);
          assert.deepEqual(restored.unexpectedGrants, before.unexpectedGrants);
        },
      );
      await check("ACL refuses paths outside its declared roots", () =>
        assert.throws(() =>
          keyAccess("Audit", [directory], undefined, {
            workspace: fixture,
            vault: fixtureVault,
          }),
        ),
      );
      await check(
        "backup restores all bytes in memory and rejects corruption",
        async () => {
          const bundle = await createBundle(fixture);
          try {
            assert.equal(parseBundle(bundle).files.length, 1);
            const parsed = JSON.parse(bundle.toString());
            parsed.files[0].data = Buffer.from("changed").toString("base64");
            assert.throws(() =>
              parseBundle(Buffer.from(JSON.stringify(parsed))),
            );
          } finally {
            bundle.fill(0);
          }
        },
      );
      await check(
        "backup rejects traversal, alternate streams and duplicate paths",
        async () => {
          for (const unsafe of [
            "../key",
            "C:/key",
            "wallet\\key",
            "wallet/key:stream",
            "/root/key",
          ])
            assert.throws(() => safeRelative(unsafe));
          const bundle = await createBundle(fixture);
          try {
            const parsed = JSON.parse(bundle.toString());
            parsed.files.push(parsed.files[0]);
            assert.throws(() =>
              parseBundle(Buffer.from(JSON.stringify(parsed))),
            );
          } finally {
            bundle.fill(0);
          }
        },
      );
      await check(
        "inventory is redacted and classifies CA keys correctly",
        async () => {
          const report = JSON.stringify(await inventory(fixture));
          assert(!report.includes(raw.credentials.privateKey));
          assert(!report.includes(envelope.protectedData));
          assert.equal(
            classify(
              "blockchain-network/organizations/fabric-ca/org1/msp/keystore/key.pem",
            ),
            "Fabric CA / TLS CA",
          );
        },
      );
      await check(
        "chaincode rejects a foreign MSP and missing issuer attribute",
        async () => {
          const contract = new CertContract();
          const args = [
            "00000000-0000-4000-8000-000000000000",
            "1",
            "diploma-v1",
            "a".repeat(64),
            "Org1MSP",
          ];
          await assert.rejects(
            contract.AnchorDiploma(
              { clientIdentity: { getMSPID: () => "Org2MSP" } },
              ...args,
            ),
            /MSP mismatch/,
          );
          await assert.rejects(
            contract.AnchorDiploma(
              {
                clientIdentity: {
                  getMSPID: () => "Org1MSP",
                  assertAttributeValue: () => false,
                },
              },
              ...args,
            ),
            /not an authorized/,
          );
        },
      );
      await check(
        "inventory handles certificates alongside wallet JSON",
        async () => {
          const certPath = join(fixture, "wallet/public-cert.pem");
          await writeFile(certPath, certificate);
          try {
            assert(
              (await inventory(fixture)).some(
                (entry) => entry.kind === "public-certificate",
              ),
            );
          } finally {
            await rm(certPath);
          }
        },
      );
      await check(
        "portable bundles normalize protected enrollment keys and wallets only in memory",
        async () => {
          const root = join(directory, "portable-fixture");
          const local = "wallet/enrollment/keystore/key";
          await mkdir(join(root, "wallet/enrollment/keystore"), {
            recursive: true,
          });
          const original = Buffer.from(raw.credentials.privateKey);
          const format = "diplomachain.enrollment-key.v1";
          const protectedKey = protectedData.protectForCurrentUser(
            original,
            format + ":" + digest(Buffer.from(local)),
          );
          await writeFile(
            join(root, local),
            JSON.stringify({
              format,
              protectedData: protectedKey.toString("base64"),
            }),
          );
          await writeFile(
            join(root, "wallet/issuer-org1.json"),
            JSON.stringify(envelope),
          );
          const bundle = await backupBundle(root);
          try {
            const restored = parseBundle(bundle);
            const entry = restored.files.find((file) => file.path === local);
            assert.equal(entry.sha256, digest(original));
            const wallet = JSON.parse(
              Buffer.from(
                restored.files.find(
                  (file) => file.path === "wallet/issuer-org1.json",
                ).data,
                "base64",
              ).toString(),
            );
            assert.equal(
              wallets.validateFabricWallet(wallet, options).fingerprint,
              identity.fingerprint,
            );
            assert(
              !(await readFile(join(root, local), "utf8")).includes(
                "PRIVATE KEY-----",
              ),
            );
          } finally {
            original.fill(0);
            bundle.fill(0);
          }
        },
      );
      await check("no runtime plaintext wallet files are created", async () => {
        assert.deepEqual(await readdir(join(fixture, "wallet")), [
          "issuer-org1.json",
        ]);
      });
    } finally {
      const absolute = directory.toLowerCase();
      assert(
        absolute.startsWith(tmpdir().toLowerCase() + "\\") ||
          absolute.startsWith(tmpdir().toLowerCase() + "/"),
      );
      await rm(directory, { recursive: true, force: true });
    }
  },
);
