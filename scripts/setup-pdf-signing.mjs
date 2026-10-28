import {
  createPrivateKey,
  randomBytes,
  webcrypto,
  X509Certificate,
} from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as asn1js from "asn1js";
import {
  AttributeTypeAndValue,
  BasicConstraints,
  Certificate,
  CryptoEngine,
  Extension,
  setEngine,
} from "pkijs";
import { parse } from "dotenv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = resolve(root, ".data/signing");
setEngine(
  "node-webcrypto",
  new CryptoEngine({ name: "node-webcrypto", crypto: webcrypto }),
);
await mkdir(directory, { recursive: true, mode: 0o700 });
const configPath = resolve(directory, "demo.env");
let settings;
try {
  settings = parse(await readFile(configPath));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  settings = { PDF_SIGNING_MODE: "demo" };
  for (const prefix of ["ORG2", "ORG1"]) {
    const keys = await webcrypto.subtle.generateKey(
      {
        name: "RSASSA-PKCS1-v1_5",
        modulusLength: 3072,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["sign", "verify"],
    );
    const certificate = new Certificate();
    certificate.version = 2;
    certificate.serialNumber = new asn1js.Integer({
      value: randomBytes(6).readUIntBE(0, 6),
    });
    for (const [type, value] of [
      [
        "2.5.4.3",
        "TLU DEMO " +
          (prefix === "ORG2"
            ? "HCM Campus Approval"
            : "Ha Noi Headquarters Issuer"),
      ],
      ["2.5.4.10", "DiplomaChain Demo Only"],
      ["2.5.4.6", "VN"],
    ]) {
      certificate.subject.typesAndValues.push(
        new AttributeTypeAndValue({
          type,
          value:
            type === "2.5.4.6"
              ? new asn1js.PrintableString({ value })
              : new asn1js.Utf8String({ value }),
        }),
      );
    }
    certificate.issuer = certificate.subject;
    certificate.notBefore.value = new Date(Date.now() - 300000);
    certificate.notAfter.value = new Date(Date.now() + 365 * 86400000);
    certificate.extensions = [
      new Extension({
        extnID: "2.5.29.19",
        critical: true,
        extnValue: new BasicConstraints({ cA: false }).toSchema().toBER(false),
      }),
      new Extension({
        extnID: "2.5.29.15",
        critical: true,
        extnValue: new asn1js.BitString({
          unusedBits: 6,
          valueHex: Uint8Array.of(0xc0).buffer,
        }).toBER(false),
      }),
    ];
    await certificate.subjectPublicKeyInfo.importKey(keys.publicKey);
    await certificate.sign(keys.privateKey, "SHA-256");
    const x509 = new X509Certificate(
      Buffer.from(certificate.toSchema(true).toBER(false)),
    );
    const password = randomBytes(32).toString("hex");
    const key = createPrivateKey({
      key: Buffer.from(
        await webcrypto.subtle.exportKey("pkcs8", keys.privateKey),
      ),
      format: "der",
      type: "pkcs8",
    });
    const certificatePath = resolve(directory, prefix + "-demo-cert.pem");
    const keyPath = resolve(directory, prefix + "-demo-key.pem");
    await writeFile(certificatePath, x509.toString(), {
      flag: "wx",
      mode: 0o600,
    });
    await writeFile(
      keyPath,
      key.export({
        format: "pem",
        type: "pkcs8",
        cipher: "aes-256-cbc",
        passphrase: password,
      }),
      { flag: "wx", mode: 0o600 },
    );
    settings["PDF_" + prefix + "_CERT_PATH"] = certificatePath.replaceAll(
      "\\",
      "/",
    );
    settings["PDF_" + prefix + "_KEY_PATH"] = keyPath.replaceAll("\\", "/");
    settings["PDF_" + prefix + "_PASSWORD"] = password;
    settings["PDF_" + prefix + "_CERT_SHA256"] = x509.fingerprint256
      .replaceAll(":", "")
      .toLowerCase();
  }
  await writeFile(
    configPath,
    Object.entries(settings)
      .map(([key, value]) => key + "=" + value)
      .join("\n") + "\n",
    { flag: "wx", mode: 0o600 },
  );
}
if (process.argv.includes("--configure-env")) {
  const envPath = resolve(root, "apps/api/.env");
  let env = await readFile(envPath, "utf8");
  if (
    parse(env).NODE_ENV === "production" ||
    (parse(env).PDF_SIGNING_MODE &&
      parse(env).PDF_SIGNING_MODE !== "demo" &&
      parse(env).PDF_SIGNING_MODE !== "disabled")
  )
    throw new Error(
      "Refusing to replace a production/certificate signing configuration with demo keys",
    );
  for (const [key, value] of Object.entries(settings)) {
    const expression = new RegExp("^" + key + "=.*$", "m");
    env = expression.test(env)
      ? env.replace(expression, key + "=" + value)
      : env.trimEnd() + "\n" + key + "=" + value + "\n";
  }
  await writeFile(envPath, env, { mode: 0o600 });
}
console.log(
  "Demo certificates ready for HCM and Ha Noi. Keys and passwords stay in ignored local files. Demo only; no legal/trusted-CA claim.",
);
