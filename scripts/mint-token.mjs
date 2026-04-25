#!/usr/bin/env node
// Mints a 24h JWT for a given user_id, signed with $JSON_SECRET. Useful
// for hitting authenticated endpoints (e.g. /admin/*) from curl without
// going through the mobile app's sign-in flow.
//
// Usage:  node scripts/mint-token.mjs <user_id>
import "dotenv/config";
import { makeToken } from "../auth/token.mjs";

const userId = process.argv[2];
if (!userId) {
  console.error("Usage: node scripts/mint-token.mjs <user_id>");
  process.exit(1);
}

const token = makeToken({ user_id: userId });
console.log(token);
