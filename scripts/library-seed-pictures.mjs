// Copies the laptop's picture readings into the database, so the weekly refresh never reads a picture
// twice (table library_pictures). Run once after the backfill; safe to run again (a stored reading is kept):
//   npm run library:seed-pictures -- <scratch dir>
// Reads <scratch>/pictures.json, written by `library:pictures`.
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { saveReading } from "../src/library/picture-cache.ts";

const [scratchArg] = process.argv.slice(2);
if (!scratchArg) {
  console.error("Usage: npm run library:seed-pictures -- <scratch dir>");
  process.exit(1);
}
const file = join(resolve(scratchArg), "pictures.json");
if (!existsSync(file)) {
  console.error(`No ${file}: run library:pictures first.`);
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set (npm run passes --env-file=.env).");
const db = drizzle({ client: neon(url) });
const readings = JSON.parse(readFileSync(file, "utf8"));
let n = 0;
for (const [address, reading] of Object.entries(readings)) {
  await saveReading(db, address, reading);
  n++;
}
console.log(`${n} picture readings stored in library_pictures.`);
