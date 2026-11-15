// Applies the pending database migrations during Vercel's production build, before `next build` (npm run vercel-build).
// A failed migration fails the build, so a deploy never goes live on a database that is behind the code.
// Preview and local builds skip it: only VERCEL_ENV=production touches the database, and CI's `npm run build` does not
// run this script at all. It uses the same direct connection (DATABASE_URL_UNPOOLED) as drizzle.config.ts and runs the
// same `drizzle-kit migrate` as `npm run db:migrate`, which applies every pending file in one transaction.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { neon } from "@neondatabase/serverless";

/** What this build does about migrations: skip it, or run it against the direct connection. Throws when it must run but cannot. */
export function migrationPlan(env) {
  if (env.VERCEL_ENV !== "production") {
    return { run: false, reason: `VERCEL_ENV is ${env.VERCEL_ENV ? `"${env.VERCEL_ENV}"` : "not set"}, not "production"` };
  }
  if (!env.DATABASE_URL_UNPOOLED) {
    throw new Error("Production build, but DATABASE_URL_UNPOOLED is not set in this Vercel environment, so migrations cannot run.");
  }
  return { run: true, url: env.DATABASE_URL_UNPOOLED };
}

/** How many of the repo's migrations the database has not applied yet (never negative: a database ahead of this build is fine). */
export function pendingCount(inRepo, applied) {
  return Math.max(0, inRepo - applied);
}

async function appliedCount(sql) {
  const [{ present }] = await sql.query("select to_regclass('drizzle.__drizzle_migrations') is not null as present");
  if (!present) return 0;
  const [{ n }] = await sql.query("select count(*)::int as n from drizzle.__drizzle_migrations");
  return n;
}

export async function migrateOnBuild(env = process.env, log = console.log) {
  const plan = migrationPlan(env);
  if (!plan.run) {
    log(`migrate-on-build: skipped (${plan.reason}).`);
    return;
  }
  const inRepo = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8")).entries.length;
  const sql = neon(plan.url);
  const before = await appliedCount(sql);
  const pending = pendingCount(inRepo, before);
  log(`migrate-on-build: ${inRepo} migrations in the repo, ${before} applied in the database, ${pending} pending.`);
  if (pending === 0) return;

  const run = spawnSync(process.execPath, ["./node_modules/drizzle-kit/bin.cjs", "migrate"], { stdio: "inherit", env });
  if (run.status !== 0) {
    throw new Error(`drizzle-kit migrate failed (${run.error ? run.error.message : `exit ${run.status ?? run.signal}`}); failing the deploy.`);
  }
  const after = await appliedCount(sql);
  if (after < inRepo) {
    throw new Error(`After migrating, the database has ${after} of ${inRepo} migrations applied; failing the deploy.`);
  }
  log(`migrate-on-build: applied ${after - before} migration(s); the database is now at ${after} of ${inRepo}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  migrateOnBuild().catch((error) => {
    console.error(`migrate-on-build: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
}
