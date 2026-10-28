import assert from "node:assert/strict";
import {
  createPrivateKey,
  randomBytes,
  webcrypto,
  X509Certificate,
} from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { spawn } from "node:child_process";
import * as asn1js from "asn1js";
import {
  AttributeTypeAndValue,
  BasicConstraints,
  BasicOCSPResponse,
  Certificate,
  CryptoEngine,
  Extension,
  ExtKeyUsage,
  OCSPResponse,
  SignedData,
  TimeStampResp,
  setEngine,
} from "pkijs";

setEngine(
  "node-webcrypto",
  new CryptoEngine({ name: "node-webcrypto", crypto: webcrypto }),
);

function developmentOnly() {
  assert(
    process.env.NODE_ENV !== "production",
    "Local DEMO CA/TSA/OCSP must never run in production",
  );
}
function opensslPath() {
  return (
    process.env.OPENSSL_PATH ||
    (process.platform === "win32"
      ? "C:/Program Files/Git/usr/bin/openssl.exe"
      : "openssl")
  );
}
async function openssl(args, passwords = {}) {
  return new Promise((resolveCommand, reject) => {
    const child = spawn(opensslPath(), args, {
      windowsHide: true,
      env: { ...process.env, ...passwords },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let error = "";
    const timer = setTimeout(() => child.kill(), 10000);
    child.stderr.on("data", (chunk) => {
      error = (error + chunk.toString()).slice(-3000);
    });
    child.once("error", (failure) => {
      clearTimeout(timer);
      reject(failure);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveCommand();
      else reject(new Error("Demo OpenSSL failed: " + error));
    });
  });
}
function formatDate(date, long = false) {
  return (
    date
      .toISOString()
      .replace(/[-:]/g, "")
      .replace("T", "")
      .slice(long ? 0 : 2, 14) + "Z"
  );
}
async function makeCertificate(directory, name, issuer) {
  const keys = await webcrypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 3072,
      publicExponent: Uint8Array.of(1, 0, 1),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
  const certificate = new Certificate();
  certificate.version = 2;
  certificate.serialNumber = new asn1js.Integer({
    valueHex: Uint8Array.from([1, ...randomBytes(12)]).buffer,
  });
  const subject = "DiplomaChain Local DEMO " + name;
  for (const [type, value] of [
    ["2.5.4.3", subject],
    ["2.5.4.10", "DEMO ONLY - NOT A PUBLIC CA"],
    ["2.5.4.6", "VN"],
  ])
    certificate.subject.typesAndValues.push(
      new AttributeTypeAndValue({
        type,
        value:
          type === "2.5.4.6"
            ? new asn1js.PrintableString({ value })
            : new asn1js.Utf8String({ value }),
      }),
    );
  certificate.issuer = issuer?.certificate.subject || certificate.subject;
  certificate.notBefore.value = new Date(Date.now() - 300000);
  certificate.notAfter.value = new Date(
    Date.now() + (issuer ? 730 : 1825) * 86400000,
  );
  certificate.extensions = [
    new Extension({
      extnID: "2.5.29.19",
      critical: true,
      extnValue: new BasicConstraints({
        cA: !issuer,
        ...(!issuer ? { pathLenConstraint: 1 } : {}),
      })
        .toSchema()
        .toBER(false),
    }),
    new Extension({
      extnID: "2.5.29.15",
      critical: true,
      extnValue: new asn1js.BitString({
        unusedBits: issuer ? 6 : 1,
        valueHex: Uint8Array.of(issuer ? 0xc0 : 0x86).buffer,
      }).toBER(false),
    }),
  ];
  if (["TSA", "OCSP"].includes(name))
    certificate.extensions.push(
      new Extension({
        extnID: "2.5.29.37",
        critical: true,
        extnValue: new ExtKeyUsage({
          keyPurposes: [
            name === "TSA" ? "1.3.6.1.5.5.7.3.8" : "1.3.6.1.5.5.7.3.9",
          ],
        })
          .toSchema()
          .toBER(false),
      }),
    );
  await certificate.subjectPublicKeyInfo.importKey(keys.publicKey);
  await certificate.sign(issuer?.privateKey || keys.privateKey, "SHA-256");
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
  await writeFile(resolve(directory, name + "-cert.pem"), x509.toString(), {
    flag: "wx",
    mode: 0o600,
  });
  await writeFile(
    resolve(directory, name + "-key.pem"),
    key.export({
      format: "pem",
      type: "pkcs8",
      cipher: "aes-256-cbc",
      passphrase: password,
    }),
    { flag: "wx", mode: 0o600 },
  );
  return {
    certificate,
    privateKey: keys.privateKey,
    password,
    fingerprint: x509.fingerprint256.replaceAll(":", "").toLowerCase(),
    serial: x509.serialNumber,
    expiry: formatDate(new Date(x509.validTo)),
    subject,
  };
}

export async function setupDemoPki(directory, port = 3318) {
  developmentOnly();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try {
    return JSON.parse(
      await readFile(resolve(directory, "settings.json"), "utf8"),
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const ca = await makeCertificate(directory, "CA");
  const identities = { CA: ca };
  for (const name of ["ORG2", "ORG1", "TSA", "OCSP"])
    identities[name] = await makeCertificate(directory, name, ca);
  const local = (filename) =>
    resolve(directory, filename).replaceAll("\\", "/");
  const base = "http://127.0.0.1:" + port;
  await writeFile(
    resolve(directory, "endpoints.json"),
    JSON.stringify(
      {
        [ca.fingerprint]: { ocspUrl: base + "/ocsp", crlUrl: base + "/ca.crl" },
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await writeFile(resolve(directory, "revoked.json"), "{}", { mode: 0o600 });
  await writeFile(resolve(directory, "tsa-serial.txt"), "01\n", {
    mode: 0o600,
  });
  await writeFile(resolve(directory, "crl-number.txt"), "01\n", {
    mode: 0o600,
  });
  await mkdir(resolve(directory, "certs"), { recursive: true });
  await writeFile(
    resolve(directory, "openssl.cnf"),
    [
      "[tsa]",
      "default_tsa=tsa_config",
      "[tsa_config]",
      "serial=" + local("tsa-serial.txt"),
      "crypto_device=builtin",
      "signer_cert=" + local("TSA-cert.pem"),
      "certs=" + local("CA-cert.pem"),
      "signer_key=" + local("TSA-key.pem"),
      "signer_digest=sha256",
      "default_policy=1.3.6.1.4.1.57264.1.1",
      "digests=sha256,sha384,sha512",
      "accuracy=secs:1",
      "ordering=yes",
      "tsa_name=yes",
      "ess_cert_id_chain=no",
      "ess_cert_id_alg=sha256",
      "[ca]",
      "default_ca=local_ca",
      "[local_ca]",
      "database=" + local("index.txt"),
      "new_certs_dir=" + local("certs"),
      "certificate=" + local("CA-cert.pem"),
      "private_key=" + local("CA-key.pem"),
      "default_md=sha256",
      "default_crl_hours=1",
      "crlnumber=" + local("crl-number.txt"),
      "policy=policy_any",
      "[policy_any]",
      "commonName=supplied",
    ].join("\n") + "\n",
    { mode: 0o600 },
  );
  const settings = {
    PDF_SIGNING_MODE: "demo",
    PDF_PKI_ENABLED: "true",
    PDF_TSA_URL: base + "/tsa",
    PDF_PKI_TRUST_BUNDLE_PATH: local("CA-cert.pem"),
    PDF_PKI_ISSUERS_PATH: local("CA-cert.pem"),
    PDF_PKI_ENDPOINTS_PATH: local("endpoints.json"),
    PDF_PKI_ALLOWED_HOSTS: "127.0.0.1:" + port,
    PDF_PKI_TIMEOUT_MS: "5000",
    PDF_PKI_CACHE_SECONDS: "0",
    PDF_PKI_MAX_AGE_SECONDS: "86400",
  };
  for (const prefix of ["ORG1", "ORG2"]) {
    settings["PDF_" + prefix + "_CERT_PATH"] = local(prefix + "-cert.pem");
    settings["PDF_" + prefix + "_KEY_PATH"] = local(prefix + "-key.pem");
    settings["PDF_" + prefix + "_PASSWORD"] = identities[prefix].password;
    settings["PDF_" + prefix + "_CERT_SHA256"] = identities[prefix].fingerprint;
  }
  await writeFile(
    resolve(directory, "identities.json"),
    JSON.stringify(
      Object.fromEntries(
        Object.entries(identities).map(([name, item]) => [
          name,
          {
            password: item.password,
            serial: item.serial,
            expiry: item.expiry,
            subject: item.subject,
          },
        ]),
      ),
    ),
    { flag: "wx", mode: 0o600 },
  );
  await writeFile(
    resolve(directory, "settings.json"),
    JSON.stringify(settings, null, 2),
    { flag: "wx", mode: 0o600 },
  );
  return settings;
}

export async function startDemoPki(directory, port = 3318, controls = {}) {
  developmentOnly();
  const identities = JSON.parse(
    await readFile(resolve(directory, "identities.json"), "utf8"),
  );
  let queue = Promise.resolve();
  async function respond(request, response) {
    let temporary;
    try {
      if (request.url === "/health") {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.end('{"mode":"DEMO_ONLY","status":"ok"}');
        return;
      }
      if (!["/tsa", "/ocsp", "/ca.crl"].includes(request.url)) {
        response.writeHead(404);
        response.end();
        return;
      }
      if (
        (request.url === "/tsa" && controls.failTsa) ||
        (request.url === "/ocsp" && controls.failOcsp) ||
        (request.url === "/ca.crl" && controls.failCrl)
      ) {
        response.writeHead(503);
        response.end();
        return;
      }
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 65536) throw new Error("Demo PKI request too large");
        chunks.push(chunk);
      }
      temporary = await mkdtemp(
        resolve(tmpdir(), "diplomachain-pki-response-"),
      );
      const input = resolve(temporary, "request.der");
      const output = resolve(temporary, "response.der");
      await writeFile(input, Buffer.concat(chunks), { mode: 0o600 });
      const revocations = {
        ...JSON.parse(
          await readFile(resolve(directory, "revoked.json"), "utf8"),
        ),
        ...(controls.revoked || {}),
      };
      const rows = Object.entries(identities)
        .filter(
          ([name]) => name !== "CA" && !(controls.unknown || []).includes(name),
        )
        .map(([name, identity]) => {
          const revoked = revocations[name];
          return [
            revoked ? "R" : "V",
            identity.expiry,
            revoked ? formatDate(new Date(revoked)) : "",
            identity.serial,
            "unknown",
            "/CN=" + identity.subject,
          ].join("\t");
        });
      await writeFile(resolve(directory, "index.txt"), rows.join("\n") + "\n", {
        mode: 0o600,
      });
      const config = resolve(directory, "openssl.cnf");
      const ocspSigner = controls.delegatedOcsp ? "OCSP" : "CA";
      const command =
        request.url === "/tsa"
          ? [
              "ts",
              "-reply",
              "-config",
              config,
              "-queryfile",
              input,
              "-out",
              output,
              "-passin",
              "env:DEMO_TSA_PASSWORD",
            ]
          : request.url === "/ocsp"
            ? [
                "ocsp",
                "-index",
                resolve(directory, "index.txt"),
                "-rsigner",
                resolve(directory, ocspSigner + "-cert.pem"),
                "-rkey",
                resolve(directory, ocspSigner + "-key.pem"),
                "-CA",
                resolve(directory, "CA-cert.pem"),
                "-reqin",
                input,
                "-respout",
                output,
                ...(controls.noNextUpdate ? [] : ["-nmin", "10"]),
                "-rmd",
                "sha256",
                "-passin",
                "env:DEMO_OCSP_PASSWORD",
              ]
            : [
                "ca",
                "-gencrl",
                "-config",
                config,
                "-out",
                output,
                "-passin",
                "env:DEMO_CA_PASSWORD",
              ];
      await openssl(command, {
        DEMO_CA_PASSWORD: identities.CA.password,
        DEMO_TSA_PASSWORD: identities.TSA.password,
        DEMO_OCSP_PASSWORD: identities[ocspSigner].password,
      });
      let bytes = await readFile(output);
      if (request.url === "/ocsp" && controls.tamperOcsp) {
        const response = OCSPResponse.fromBER(bytes);
        const basic = BasicOCSPResponse.fromBER(
          response.responseBytes.response.valueBlock.valueHexView,
        );
        basic.signature.valueBlock.valueHexView[0] ^= 1;
        response.responseBytes.response = new asn1js.OctetString({
          valueHex: basic.toSchema().toBER(false),
        });
        bytes = Buffer.from(response.toSchema().toBER(false));
      }
      if (request.url === "/tsa" && controls.tamperTsa) {
        const response = TimeStampResp.fromBER(bytes);
        const signed = new SignedData({
          schema: response.timeStampToken.content,
        });
        signed.signerInfos[0].signature.valueBlock.valueHexView[0] ^= 1;
        response.timeStampToken.content = signed.toSchema();
        bytes = Buffer.from(response.toSchema().toBER(false));
      }
      response.writeHead(200, {
        "Content-Type":
          request.url === "/tsa"
            ? "application/timestamp-reply"
            : request.url === "/ocsp"
              ? "application/ocsp-response"
              : "application/pkix-crl",
      });
      response.end(bytes);
    } catch (error) {
      controls.onError?.(error);
      if (!response.headersSent) response.writeHead(500);
      response.end("Local DEMO PKI failure");
    } finally {
      if (temporary) {
        const scoped = relative(tmpdir(), temporary);
        assert(scoped && !scoped.startsWith("..") && !isAbsolute(scoped));
        await rm(temporary, { recursive: true, force: true });
      }
    }
  }
  const server = createServer((request, response) => {
    queue = queue
      .then(() => respond(request, response))
      .catch(() => {
        response.destroy();
      });
  });
  await new Promise((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolveServer);
  });
  return server;
}
