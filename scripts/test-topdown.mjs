#!/usr/bin/env node
// Run the top-down generator end-to-end against a single MMSI without
// going through the HTTP layer. Same code path as
// POST /admin/boats/:mmsi/generate-topdown — minus auth and HTTP.
//
// Usage:  node scripts/test-topdown.mjs <MMSI> [photoIds]
// Examples:
//   node scripts/test-topdown.mjs 230123456
//   node scripts/test-topdown.mjs 230123456 12,17    # restrict to media ids
//
// Reads PG* + GEMINI_API_KEY + GOOGLE_APPLICATION_CREDENTIALS from .env.
import "dotenv/config";
import DB from "../db.js";
import { generateBoatTopdown } from "../topdown.mjs";

const mmsi = process.argv[2];
if (!mmsi) {
  console.error("Usage: node scripts/test-topdown.mjs <MMSI> [photoIds]");
  process.exit(1);
}
const photoIds = process.argv[3]
  ? process.argv[3].split(",").map((s) => parseInt(s.trim(), 10))
  : undefined;

const main = async () => {
  const db = new DB();
  await db.connect();
  console.log(`Generating top-down for MMSI ${mmsi}...`);
  const result = await generateBoatTopdown(db, mmsi, { photoIds });
  console.log("\nResult:");
  console.log(JSON.stringify(result, null, 2));
  await db.close();
  if (result.status !== 200) process.exit(1);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
