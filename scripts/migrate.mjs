#!/usr/bin/env node
import "dotenv/config";
import pkg from "pg";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const { Client } = pkg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");

// schema_migrations records every filename we've successfully applied.
// To adopt this system on a database where some migrations have already
// been run by hand (e.g. prod):
//   INSERT INTO schema_migrations (filename) VALUES ('001_messages_unique_msgid.sql');
const ENSURE_TRACKING_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    filename   TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const main = async () => {
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

  const appliedRows = (
    await client.query("SELECT filename FROM schema_migrations")
  ).rows;
  const applied = new Set(appliedRows.map((r) => r.filename));

  const files = (await fs.readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

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

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
