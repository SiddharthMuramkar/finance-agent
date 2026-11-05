// The invite list and the Sign-up switch for Google sign-in (ADR 0011). Run:
//   INVITES_DB_OK=<database host> npm run invites -- add <email> [--learner owner] [--note "..."]
//   INVITES_DB_OK=<database host> npm run invites -- remove <email> | list | open | close
// Meant for production too, so it asks the owner to name the database: INVITES_DB_OK must equal the host
// it prints. The logic lives in src/auth/invites.ts (tested); this file only connects and prints.
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { INVITES_USAGE, runInvites } from "../src/auth/invites.ts";
import { assertNamedDatabase } from "./script-guards.mjs";

const argv = process.argv.slice(2);
if (!argv.length) {
  console.error(INVITES_USAGE);
  process.exit(1);
}
const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL_UNPOOLED or DATABASE_URL must be set (npm run passes --env-file=.env).");
  process.exit(1);
}
try {
  assertNamedDatabase(url);
  await runInvites(drizzle({ client: neon(url) }), argv, (line) => console.log(line));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
