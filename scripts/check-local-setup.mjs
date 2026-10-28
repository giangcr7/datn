import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import pg from "pg";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = {
  ...parse(await readFile(resolve(root, "apps/api/.env.database"))),
  ...parse(await readFile(resolve(root, "apps/api/.env"))),
  ...process.env,
};
const connectionString = env.DIRECT_DATABASE_URL || env.DATABASE_URL;
const client = new pg.Client({
  connectionString,
  connectionTimeoutMillis: 3000,
  query_timeout: 5000,
  options: "-c default_transaction_read_only=on -c statement_timeout=5000",
});
try {
  await client.connect();
  const result = await client.query(
    "SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations",
  );
  const directory = resolve(root, "apps/api/prisma/migrations");
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.filter((item) => item.isDirectory())) {
    const sql = await readFile(resolve(directory, entry.name, "migration.sql"));
    const sha256 = createHash("sha256").update(sql).digest("hex");
    const applied = result.rows.find(
      (row) =>
        row.migration_name === entry.name &&
        row.finished_at &&
        !row.rolled_back_at,
    );
    if (!applied)
      throw new Error(
        "Migration chua ap dung: " + entry.name + ". Chay .\\start.ps1 -Setup.",
      );
    if (applied.checksum !== sha256)
      throw new Error(
        "Migration da ap dung bi thay doi: " +
          entry.name +
          ". Can kiem tra, khong tu sua database.",
      );
  }
  if (result.rows.some((row) => !row.finished_at && !row.rolled_back_at))
    throw new Error(
      "Co migration that bai/chua hoan tat; kiem tra Prisma truoc khi khoi dong.",
    );
  const seeded = await client.query(
    "SELECT EXISTS (SELECT 1 FROM institutions WHERE code = 'TLU') AS ready",
  );
  if (!seeded.rows[0].ready)
    throw new Error("Chua co danh muc truong; chay .\\start.ps1 -Setup.");
  console.log("Database da chuan bi; bo qua generate/migrate/seed.");
} catch (error) {
  console.error(
    error.code === "42P01"
      ? "Database chua duoc chuan bi; chay .\\start.ps1 -Setup."
      : error.code
        ? "Khong kiem tra duoc database (ma " +
          error.code +
          "); xem cau hinh/khoi dong PostgreSQL."
        : error.message,
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
