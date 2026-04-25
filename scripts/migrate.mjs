#!/usr/bin/env node
import "dotenv/config";
import pkg from "pg";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const { Client } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

const ENSURE_TRACKING_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const USAGE = `
Usage:
  node scripts/migrate.mjs [apply]            Apply all pending migrations.
  node scripts/migrate.mjs status             Show applied vs pending.
  node scripts/migrate.mjs adopt <filename>   Mark a migration as applied
                                              WITHOUT running it. For DBs
                                              where the migration was run
                                              by hand before this script
                                              existed.
`.trim();

const connect = async () => {
  for (const v of ["PGUSER", "PGHOST", "PGDATABASE", "PGPORT"]) {
    if (!process.env[v]) {
      console.error(`Missing required env var: ${v}`);
      process.exit(1);
    }
  }
  const client = new Client({
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: parseInt(process.env.PGPORT, 10),
  });
  await client.connect();
  console.log(
    `Connected to ${process.env.PGUSER}@${process.env.PGHOST}:${process.env.PGPORT}/${process.env.PGDATABASE}`,
  );
  await client.query(ENSURE_TRACKING_TABLE);
  return client;
};

const listFiles = async () => {
  const entries = await fs.readdir(MIGRATIONS_DIR);
  return entries.filter((f) => f.endsWith(".sql")).sort();
};

const listApplied = async (client) => {
  const r = await client.query(
    "SELECT filename, applied_at FROM schema_migrations ORDER BY filename",
  );
  return r.rows;
};

const apply = async () => {
  const client = await connect();
  const applied = new Set((await listApplied(client)).map((r) => r.filename));
  const files = await listFiles();
  const pending = files.filter((f) => !applied.has(f));

  if (!pending.length) {
    console.log(`No pending migrations (${applied.size} already applied).`);
    await client.end();
    return;
  }

  console.log(`Pending: ${pending.join(", ")}`);
  for (const f of pending) {
    const sql = await fs.readFile(path.join(MIGRATIONS_DIR, f), "utf8");
    process.stdout.write(`  applying ${f}... `);
    // No outer transaction — some migrations use CREATE INDEX CONCURRENTLY,
    // which Postgres forbids inside a transaction block.
    try {
      await client.query(sql);
      await client.query(
        "INSERT INTO schema_migrations (filename) VALUES ($1)",
        [f],
      );
      console.log("ok");
    } catch (e) {
      console.log("FAILED");
      console.error(e);
      process.exit(1);
    }
  }
  await client.end();
  console.log("Done.");
};

const status = async () => {
  const client = await connect();
  const appliedRows = await listApplied(client);
  const appliedMap = new Map(appliedRows.map((r) => [r.filename, r.applied_at]));
  const files = await listFiles();
  await client.end();

  console.log("");
  console.log("File                                    Status      Applied at");
  console.log("--------------------------------------- ----------- -------------------------");
  const allFiles = new Set([...files, ...appliedMap.keys()]);
  const sorted = [...allFiles].sort();
  for (const f of sorted) {
    const inDir = files.includes(f);
    const inDb = appliedMap.has(f);
    let label;
    if (inDir && inDb) label = "applied";
    else if (inDir && !inDb) label = "pending";
    else label = "orphaned"; // recorded as applied but file is missing locally
    const when = appliedMap.get(f);
    console.log(
      `${f.padEnd(39)} ${label.padEnd(11)} ${when ? when.toISOString() : ""}`,
    );
  }
};

const adopt = async (filename) => {
  if (!filename) {
    console.error("adopt: filename required");
    console.error(USAGE);
    process.exit(1);
  }
  const files = await listFiles();
  if (!files.includes(filename)) {
    console.error(
      `adopt: ${filename} is not present in migrations/. ` +
        `Available: ${files.join(", ")}`,
    );
    process.exit(1);
  }
  const client = await connect();
  const r = await client.query(
    "INSERT INTO schema_migrations (filename) VALUES ($1) ON CONFLICT (filename) DO NOTHING RETURNING filename",
    [filename],
  );
  if (r.rows.length) {
    console.log(`Marked ${filename} as applied (without running it).`);
  } else {
    console.log(`${filename} was already recorded as applied — nothing to do.`);
  }
  await client.end();
};

const main = async () => {
  const cmd = process.argv[2] || "apply";
  if (cmd === "apply") return apply();
  if (cmd === "status") return status();
  if (cmd === "adopt") return adopt(process.argv[3]);
  if (cmd === "help" || cmd === "-h" || cmd === "--help") {
    console.log(USAGE);
    return;
  }
  console.error(`Unknown command: ${cmd}`);
  console.error(USAGE);
  process.exit(1);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
