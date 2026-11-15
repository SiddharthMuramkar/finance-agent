import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { testDb } from "../test/pglite";

// scripts/backup-drill.sh, run as the owner runs it, against fake `neon`, `psql`, `pg_dump` and `pg_restore`
// on PATH. The fakes log their calls and answer like Neon and Postgres 18 would. No network, no database.
const SCRIPT = join(process.cwd(), "scripts/backup-drill.sh");

/** The columns of library_passages, from src/db/schema.ts, as `string_agg(column_name ORDER BY column_name COLLATE "C")` gives them. */
const PASSAGE_COLUMNS = "credit,embedded_with,embedding,heading,id,latest_year,licence,published_on,ref,search,source_id,text,url";

const FAKE_NEON = String.raw`#!/usr/bin/env bash
set -u
printf '%s\n' "$*" >> "$FAKE_DIR/neon.log"
set -- "${"$"}{@:4}"   # drop --project-id ID --no-color
case "$1 ${"$"}{2:-}" in
  "connection-string main") echo "postgresql://u:pw@ep-main.example/neondb?sslmode=require" ;;
  "connection-string "*) echo "postgresql://u:pw@ep-drill.example/neondb?sslmode=require" ;;
  "branches get")
    if [[ $3 == main ]]; then echo '{"id":"br-main","name":"main","default":true,"protected":true}'; exit 0; fi
    grep -qx "$3" "$FAKE_DIR/branches" 2>/dev/null || { echo "branch not found" >&2; exit 1; }
    echo "{\"id\":\"$3\",\"name\":\"drill-restore-x\",\"default\":false,\"protected\":false}" ;;
  "branches create")
    if [[ " $* " == *" --schema-only "* && -n ${"$"}{FAKE_SCHEMA_ONLY_FAIL:-} ]]; then echo "ERROR: root branches limit" >&2; exit 1; fi
    n=$(( $(cat "$FAKE_DIR/counter" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$FAKE_DIR/counter"
    echo "br-drill-$n" >> "$FAKE_DIR/branches"
    echo "{\"branch\":{\"id\":\"br-drill-$n\"}}" ;;
  "branches delete")
    { grep -vx "$3" "$FAKE_DIR/branches" || true; } > "$FAKE_DIR/branches.tmp"; mv "$FAKE_DIR/branches.tmp" "$FAKE_DIR/branches"
    echo '{}' ;;
  *) echo "fake neon: unexpected: $*" >&2; exit 1 ;;
esac
`;

const FAKE_PSQL = String.raw`#!/usr/bin/env bash
set -u
[[ ${"$"}{1:-} == --version ]] && { echo "psql (PostgreSQL) 18.1"; exit 0; }
sql="" file=""
while [[ $# -gt 0 ]]; do case $1 in -c) sql=$2; shift 2 ;; -f) file=$2; shift 2 ;; -F|-v) shift 2 ;; *) shift ;; esac; done
printf '%s %s %s\n' "$PGHOST" "$PGDATABASE" "${"$"}{sql:-fingerprint}" >> "$FAKE_DIR/psql.log"
if [[ $file == - ]]; then
  cat > /dev/null
  echo "library_passages (all but vectors) | 5 | 0123abcd"
  echo "library_sources | 9 | 4567cdef"
  exit 0
fi
case $sql in
  "select 1") echo 1 ;;
  "show server_version_num") echo 180001 ;;
  "select count(*) from library_passages") echo 5 ;;
  *information_schema.columns*) echo "${"$"}{FAKE_PASSAGE_COLUMNS:-${PASSAGE_COLUMNS}}" ;;
  *pg_database*) [[ -f $FAKE_DIR/drill-db ]] && echo 1 || echo 0 ;;
  "create database "*) touch "$FAKE_DIR/drill-db" ;;
  "drop database "*) rm -f "$FAKE_DIR/drill-db" ;;
  "select current_database()") echo "$PGDATABASE" ;;
  "create extension "*) ;;
  *pg_available_extensions*|*pg_extension*) echo 1 ;;
  *pg_tables*) echo 0 ;;
  *) echo "fake psql: unexpected: $sql" >&2; exit 1 ;;
esac
`;

const FAKE_PG_DUMP = String.raw`#!/usr/bin/env bash
[[ ${"$"}{1:-} == --version ]] && { echo "pg_dump (PostgreSQL) 18.1"; exit 0; }
printf 'pg_dump %s\n' "$*" >> "$FAKE_DIR/pg.log"
for a; do case $a in --file=*) echo "fake dump $RANDOM" > "${"$"}{a#--file=}" ;; esac; done
`;

const FAKE_PG_RESTORE = String.raw`#!/usr/bin/env bash
[[ ${"$"}{1:-} == --version ]] && { echo "pg_restore (PostgreSQL) 18.1"; exit 0; }
printf 'pg_restore %s\n' "$*" >> "$FAKE_DIR/pg.log"
if [[ $1 == --list ]]; then
  for t in library_sources library_passages library_documents library_pictures library_refresh_runs; do echo "1; 0 0 TABLE DATA public $t owner"; done
  for s in library_passages_id_seq library_refresh_runs_id_seq; do echo "2; 0 0 SEQUENCE SET public $s owner"; done
  echo "3; 0 0 INDEX public library_passages_bm25 owner"
  exit 0
fi
[[ -z ${"$"}{FAKE_RESTORE_FAIL:-} ]] || { echo "pg_restore: error: could not execute query" >&2; exit 1; }
`;

const made: string[] = [];

/** A fresh fake world: a bin folder with the fakes, a folder for their logs, and an empty dump folder. */
function world() {
  const root = mkdtempSync(join(tmpdir(), "fa-backup-drill-"));
  made.push(root);
  const bin = join(root, "bin");
  const fake = join(root, "fake");
  const dumps = join(root, "dumps");
  mkdirSync(bin);
  mkdirSync(fake);
  for (const [name, text] of Object.entries({ neon: FAKE_NEON, psql: FAKE_PSQL, pg_dump: FAKE_PG_DUMP, pg_restore: FAKE_PG_RESTORE })) {
    writeFileSync(join(bin, name), text);
    chmodSync(join(bin, name), 0o755);
  }
  const log = (name: string) => (existsSync(join(fake, name)) ? readFileSync(join(fake, name), "utf8") : "");
  const run = (args: string[], env: Record<string, string> = {}) => {
    const r = spawnSync("bash", [SCRIPT, "--project-id", "proj-test", "--dump-dir", dumps, ...args], {
      encoding: "utf8",
      input: "",
      env: { NODE_ENV: "test", PATH: `${bin}:${process.env.PATH}`, HOME: root, NO_COLOR: "1", FAKE_DIR: fake, ...env },
    });
    return { status: r.status, out: r.stdout, err: r.stderr };
  };
  return { dumps, run, log };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A `NAME="value"` setting from the script. */
function setting(name: string): string {
  const m = new RegExp(`^${name}="([^"]*)"$`, "m").exec(readFileSync(SCRIPT, "utf8"));
  if (!m) throw new Error(`${name} not found in ${SCRIPT}`);
  return m[1];
}

describe("scripts/backup-drill.sh against the real migrations", () => {
  // A migration that adds a Library table or a library_passages column must also update the drill's
  // fingerprint, or the drill would pass without checking it; then re-dump (docs/backup-and-restore.md).
  it("knows every library_* table and every library_passages column", async () => {
    const db = await testDb();
    type Rows<T> = { rows: T[] };
    const tables = (await db.execute(
      sql`select table_name from information_schema.tables where table_schema = 'public' and starts_with(table_name, 'library_') order by 1`,
    )) as unknown as Rows<{ table_name: string }>;
    expect(tables.rows.map((r) => r.table_name).sort()).toEqual(setting("LIBRARY_TABLES").split(" ").sort());

    const columns = (await db.execute(
      sql`select string_agg(column_name, ',' order by column_name collate "C") as s from information_schema.columns where table_schema = 'public' and table_name = 'library_passages'`,
    )) as unknown as Rows<{ s: string }>;
    expect(columns.rows[0].s).toBe(setting("PASSAGE_COLUMNS"));
    expect(setting("PASSAGE_COLUMNS")).toBe(PASSAGE_COLUMNS);
  });
});

describe("scripts/backup-drill.sh", () => {
  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("a full run dumps, restores into a throwaway branch, passes the compare and prints a PASS line", () => {
    const w = world();
    const r = w.run(["--from", "5", "--yes"]);
    expect(r.err).toBe("");
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/Drill \d{4}-\d{2}-\d{2}: dumped .* PASS on counts and hashes/);
    expect(w.log("neon.log")).toMatch(/branches delete br-drill-1/);
  });

  it("after a re-dump, a drill that stops before the compare gives no PASS line for the new dump", async () => {
    const w = world();
    expect(w.run(["--from", "5", "--yes"]).status).toBe(0);
    await sleep(1100); // a dump's name holds its UTC second
    expect(w.run(["--redump", "--yes"]).status).toBe(0);
    expect(w.run(["--from", "8", "--yes"], { FAKE_RESTORE_FAIL: "1" }).status).toBe(1);

    const r = w.run(["--from", "12", "--yes"]);
    expect(r.status).toBe(0);
    expect(r.out).not.toMatch(/PASS/);
    expect(r.out).toMatch(/No drill result for this dump yet/);
  });

  it("a second drill on the same dump that stops before the compare gives no PASS line", () => {
    const w = world();
    expect(w.run(["--from", "5", "--yes"]).status).toBe(0);
    expect(w.run(["--from", "8", "--yes"], { FAKE_RESTORE_FAIL: "1" }).status).toBe(1);

    const r = w.run(["--from", "12", "--yes"]);
    expect(r.status).toBe(0);
    expect(r.out).not.toMatch(/PASS/);
  });

  it("when Neon refuses a schema-only branch, it stops instead of copying main's rows, even with --yes", () => {
    const w = world();
    const r = w.run(["--only", "5,8", "--yes"], { FAKE_SCHEMA_ONLY_FAIL: "1" });
    expect(r.status).toBe(1);
    expect(r.err).toMatch(/--allow-full-copy/);
    const creates = w.log("neon.log").split("\n").filter((l) => l.includes("branches create"));
    expect(creates).toHaveLength(1);
    expect(creates[0]).toContain("--schema-only");
  });

  it("makes a full-copy drill branch only with --allow-full-copy", () => {
    const w = world();
    const r = w.run(["--only", "5,8", "--yes", "--allow-full-copy"], { FAKE_SCHEMA_ONLY_FAIL: "1" });
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/full copy/);
    const creates = w.log("neon.log").split("\n").filter((l) => l.includes("branches create"));
    expect(creates).toHaveLength(2);
    expect(creates[1]).not.toContain("--schema-only");
    expect(creates[1]).toContain("--expires-at");
  });

  it("stops before the dump when library_passages has a column the yardstick does not hash", () => {
    const w = world();
    const r = w.run(["--only", "5,6", "--yes"], { FAKE_PASSAGE_COLUMNS: PASSAGE_COLUMNS.replace("heading,", "heading,footnote,") });
    expect(r.status).toBe(1);
    expect(r.err).toMatch(/footnote/);
    expect(w.log("pg.log")).not.toMatch(/^pg_dump /m);
  });

  it("a resume hint keeps the flags the run was given, without the stage choice", () => {
    const w = world();
    const r = w.run(["--copy-dir", "skip", "--only", "12"]);
    expect(r.status).toBe(1);
    const hint = r.err.split("\n").find((l) => l.includes("--from 6"));
    expect(hint).toBeDefined();
    expect(hint).toContain("--project-id proj-test");
    expect(hint).toContain(`--dump-dir ${w.dumps}`);
    expect(hint).toContain("--copy-dir skip");
    expect(hint).not.toContain("--only");
  });

  it("the hint after Neon refuses a change keeps the flags too", () => {
    const w = world();
    const r = w.run(["--only", "5,8", "--yes"], { FAKE_SCHEMA_ONLY_FAIL: "1" });
    expect(r.err).toContain(`--project-id proj-test --dump-dir ${w.dumps} --yes --from 8`);
  });
});
