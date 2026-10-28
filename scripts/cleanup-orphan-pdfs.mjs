import assert from "node:assert/strict";
import { lstat, readdir, realpath, unlink } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { config } from "dotenv";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, "apps/api/.env"), quiet: true });
const remove = process.argv.includes("--delete");
const minimumAge = Date.now() - 24 * 60 * 60 * 1000;
const keyPattern = /^[0-9a-f-]{36}\/[0-9a-f]{64}\.pdf$/i;
const driver = process.env.STORAGE_DRIVER || "local";
assert(["local", "s3"].includes(driver), "Unsupported storage driver");
const database = new pg.Client({ connectionString: process.env.DATABASE_URL });
let s3;
let localRoot;
let scanned = 0;
let unreferenced = 0;
let deleted = 0;
async function* candidates() {
  if (driver === "s3") {
    assert(process.env.STORAGE_S3_BUCKET, "STORAGE_S3_BUCKET is required");
    s3 = new S3Client({
      region: process.env.AWS_REGION || "ap-southeast-1",
      endpoint: process.env.STORAGE_S3_ENDPOINT || undefined,
      forcePathStyle: process.env.STORAGE_S3_FORCE_PATH_STYLE === "true",
    });
    let continuation;
    do {
      const result = await s3.send(
        new ListObjectsV2Command({
          Bucket: process.env.STORAGE_S3_BUCKET,
          ContinuationToken: continuation,
        }),
      );
      for (const object of result.Contents || []) {
        if (
          keyPattern.test(object.Key || "") &&
          object.LastModified?.getTime() < minimumAge
        )
          yield { key: object.Key };
      }
      continuation = result.IsTruncated
        ? result.NextContinuationToken
        : undefined;
    } while (continuation);
  } else {
    const directory = resolve(
      root,
      "apps/api",
      process.env.STORAGE_LOCAL_ROOT || "../../.data/documents",
    );
    try {
      localRoot = await realpath(directory);
    } catch (error) {
      if (error.code === "ENOENT") return;
      throw error;
    }
    for (const institution of await readdir(localRoot, {
      withFileTypes: true,
    })) {
      if (
        !institution.isDirectory() ||
        institution.isSymbolicLink() ||
        !/^[0-9a-f-]{36}$/i.test(institution.name)
      )
        continue;
      const parent = resolve(localRoot, institution.name);
      for (const file of await readdir(parent, { withFileTypes: true })) {
        const key = institution.name + "/" + file.name;
        if (!file.isFile() || file.isSymbolicLink() || !keyPattern.test(key))
          continue;
        const path = resolve(parent, file.name);
        if ((await lstat(path)).mtimeMs < minimumAge) yield { key, path };
      }
    }
  }
}
try {
  await database.connect();
  for await (const candidate of candidates()) {
    scanned++;
    await database.query("BEGIN");
    try {
      await database.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
        candidate.key,
      ]);
      const result = await database.query(
        "SELECT 1 FROM signed_diploma_documents WHERE origin_pdf_key=$1 OR signed_pdf_key=$1 LIMIT 1",
        [candidate.key],
      );
      if (result.rowCount === 0) {
        unreferenced++;
        if (remove) {
          if (driver === "s3")
            await s3.send(
              new DeleteObjectCommand({
                Bucket: process.env.STORAGE_S3_BUCKET,
                Key: candidate.key,
              }),
            );
          else {
            const actual = await realpath(candidate.path);
            const scoped = relative(localRoot, actual);
            assert(
              scoped &&
                !scoped.startsWith("..") &&
                !isAbsolute(scoped) &&
                actual === candidate.path,
              "Cleanup target must remain inside the storage root without symlinks",
            );
            const metadata = await lstat(actual);
            if (
              !metadata.isFile() ||
              metadata.isSymbolicLink() ||
              metadata.mtimeMs >= minimumAge
            ) {
              await database.query("COMMIT");
              continue;
            }
            await unlink(actual);
          }
          deleted++;
        }
      }
      await database.query("COMMIT");
    } catch (error) {
      await database.query("ROLLBACK");
      throw error;
    }
  }
  console.log(
    JSON.stringify({
      mode: remove ? "delete" : "dry-run",
      minimumAgeHours: 24,
      scanned,
      unreferenced,
      deleted,
    }),
  );
} finally {
  s3?.destroy();
  await database.end();
}
