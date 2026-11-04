// Safety checks shared by the dev scripts that write to or read from a database (scripts/widget-eval.mjs,
// scripts/layout-check.mjs), kept in one place so they are tested (src/dev/script-guards.test.ts).
// Its one import has no imports of its own, so Node can load this file straight from a script.
import { TOOLS_NAME } from "../src/auth/passcode.ts";

/** Throws unless `base` points at this machine: the hostname must be exactly localhost, 127.0.0.1 or ::1. */
export function assertLocalBase(base) {
  let hostname;
  try {
    hostname = new URL(base).hostname;
  } catch {
    throw new Error(`Refusing to run against "${base}": it is not a URL.`);
  }
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname)) {
    throw new Error(`Refusing to run against ${base}: this script only runs against a local server (host localhost, 127.0.0.1 or ::1).`);
  }
}

/**
 * Throws unless the database is plainly a test branch: prints the target host, refuses the production host when
 * PROD_DB_HOST names it, and otherwise requires EVAL_DB_OK=branch (the owner's statement that DATABASE_URL is a Neon test branch).
 */
export function assertTestDatabase(url, env = process.env, log = console.log) {
  const host = new URL(url).hostname;
  log(`Database target: ${host}`);
  if (env.PROD_DB_HOST && host === env.PROD_DB_HOST) {
    throw new Error(`Refusing to run: DATABASE_URL points at the production host ${host} (PROD_DB_HOST).`);
  }
  if (env.EVAL_DB_OK !== "branch") {
    throw new Error(`Refusing to run against ${host}: set EVAL_DB_OK=branch to confirm DATABASE_URL is a Neon test branch, not production.`);
  }
}

/** Throws unless `learnerId` is the tools Learner (the only Learner these scripts may write to or read from). */
export async function assertToolsLearner(client, learnerId) {
  const { rows } = await client.query("select name, archived_at from learners where id = $1", [learnerId]);
  const row = rows[0];
  if (!row || row.name !== TOOLS_NAME) {
    throw new Error(`Refusing to touch Learner ${learnerId}: it is ${row ? `"${row.name}"` : "not found"}, not the "${TOOLS_NAME}" Learner.`);
  }
}

/** The text of one stored message: a plain string, or the text blocks of a content array joined by newlines. */
export function textOf(m) {
  if (typeof m?.content === "string") return m.content;
  return Array.isArray(m?.content) ? m.content.filter((b) => b?.type === "text").map((b) => b.text).join("\n") : "";
}
