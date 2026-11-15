// Applies the pending database migrations during Vercel's production build, before `next build` (npm run vercel-build).
// A failed migration fails the build, so a deploy never goes live on a database that is behind the code (issue #549).
// Preview and local builds skip it: only VERCEL_ENV=production touches the database, and CI's `npm run build` does not
// run this script at all. It uses the same direct connection (DATABASE_URL_UNPOOLED) as drizzle.config.ts and runs the
// same `drizzle-kit migrate` as `npm run db:migrate`, which applies every pending file in one transaction.
// Before it migrates, it takes a Neon snapshot of the branch it is about to change (decision #11), so a bad migration
// can be undone by restoring the snapshot. With NEON_API_KEY set, no snapshot means no migration and a failed build.
// Migrations follow expand-then-contract: see docs/agents/migrations.md.
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

const NEON_API = "https://console.neon.tech/api/v2";
/** How long a pre-migration snapshot is kept: long enough to notice a bad migration, short of the 100-snapshot plan cap. */
const SNAPSHOT_DAYS = 30;
/** 423 Locked (another operation is running, e.g. the compute waking for the count above) and 503 are safe to retry. */
const API_ATTEMPTS = 6;
const POLL_MS = 3000;
const POLLS = 100; // 5 minutes
const DONE = new Set(["finished", "skipped"]);
const FAILED = new Set(["failed", "error", "cancelling", "cancelled"]);

/** One Neon API call. Error messages carry the status and Neon's own message, never the key or the request headers. */
async function neonApi(path, init, { fetch, sleep }) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${NEON_API}${path}`, init);
    if ((res.status === 423 || res.status === 503) && attempt < API_ATTEMPTS) {
      await sleep(attempt * POLL_MS);
      continue;
    }
    const text = await res.text();
    if (!res.ok) {
      let message = text.slice(0, 200);
      try {
        message = JSON.parse(text).message ?? message;
      } catch {}
      throw new Error(`Neon API ${init.method ?? "GET"} ${path.split("?")[0]} answered ${res.status}: ${message}`);
    }
    return JSON.parse(text);
  }
}

/**
 * Takes a Neon snapshot of the branch that DATABASE_URL_UNPOOLED points at, and waits until Neon has finished it.
 * Skips (returns taken: false) when nothing is pending or NEON_API_KEY is unset; throws on anything else that stops a snapshot.
 */
export async function snapshotBeforeMigrating(env, pending, { fetch = globalThis.fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), now = () => new Date() } = {}) {
  if (pending === 0) return { taken: false, reason: "no pending migrations" };
  if (!env.NEON_API_KEY) return { taken: false, reason: "NEON_API_KEY is not set" };
  if (!env.NEON_PROJECT_ID) throw new Error("NEON_API_KEY is set but NEON_PROJECT_ID is not, so no snapshot can be taken; failing the deploy.");

  // The endpoint id is the first label of the host (ep-...), with "-pooler" on a pooled host.
  let endpointId = "";
  try {
    endpointId = new URL(env.DATABASE_URL_UNPOOLED ?? "").hostname.split(".")[0].replace(/-pooler$/, "");
  } catch {}
  if (!endpointId.startsWith("ep-")) throw new Error("DATABASE_URL_UNPOOLED does not point at a Neon endpoint (ep-...), so no snapshot can be taken; failing the deploy.");

  const deps = { fetch, sleep };
  const project = encodeURIComponent(env.NEON_PROJECT_ID);
  const get = { headers: { authorization: `Bearer ${env.NEON_API_KEY}`, accept: "application/json" } };
  const { endpoint } = await neonApi(`/projects/${project}/endpoints/${endpointId}`, get, deps);
  const branchId = endpoint.branch_id;

  const at = now();
  const name = `pre-migrate-${(env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "local"}-${at.toISOString().slice(0, 19).replaceAll(":", "")}`;
  const query = new URLSearchParams({ name, expires_at: new Date(at.getTime() + SNAPSHOT_DAYS * 86_400_000).toISOString() });
  const { snapshot, operations = [] } = await neonApi(`/projects/${project}/branches/${branchId}/snapshot?${query}`, { ...get, method: "POST" }, deps);

  for (const operation of operations) {
    let status = operation.status;
    for (let poll = 0; !DONE.has(status); poll++) {
      if (FAILED.has(status)) throw new Error(`Neon snapshot ${name}: operation ${operation.action} ${status}; failing the deploy.`);
      if (poll === POLLS) throw new Error(`Neon snapshot ${name}: operation ${operation.action} did not finish in ${(POLLS * POLL_MS) / 1000} s; failing the deploy.`);
      await sleep(POLL_MS);
      ({ status } = (await neonApi(`/projects/${project}/operations/${operation.id}`, get, deps)).operation);
    }
  }
  return { taken: true, id: snapshot.id, name, branchId };
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

  const snapshot = await snapshotBeforeMigrating(env, pending);
  log(
    snapshot.taken
      ? `migrate-on-build: Neon snapshot ${snapshot.name} (${snapshot.id}) of branch ${snapshot.branchId} is ready.`
      : `migrate-on-build: no Neon snapshot (${snapshot.reason}); migrating without one.`,
  );

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
