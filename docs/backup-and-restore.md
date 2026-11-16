# Backup and restore

How Value It's data can be recovered, and how to prove it. Decision: issue #8, option B (2026-11-15).
This file holds no URLs, passwords or connection strings. The Neon project is `finance-agent`
(`neon projects list` shows its id; the commands below read it from `NEON_PROJECT_ID`).

## The three layers

Each layer protects against a different failure.

| Layer | What it is | It protects against | How far back | Where it lives |
|---|---|---|---|---|
| 1. Point-in-time restore (PITR) | Neon moves a branch back to any second in its history window. | A bad migration or a bad delete that you find quickly. | 7 days (Launch plan) | Inside the Neon project |
| 2. Daily snapshots | A saved copy of `main`, taken each day at 22:00 UTC and kept 14 days. Named manual snapshots stay until you delete them. | A mistake that you find late (after the PITR window). | 14 days; manual ones: until deleted | Inside the Neon project |
| 3. Off-Neon Library dump | A `pg_dump` of the 5 `library_*` tables, in a file outside Neon. | A lost Neon project or account. | The last dump | `/root/backups/` on the VPS and a second copy in `/root/backups/copy2/` (the same disk). The owner's laptop: **not yet**, see Rules |

Also: `main` is **protected**. Nobody can delete or reset `main`, and nobody can delete the project while
it has a protected branch.

Why 22:00 UTC: the weekly Library refresh runs on Monday at 21:30 UTC, and Neon's maintenance window is
Thursday 20:00 to 21:00 UTC. 22:00 is after the first and outside the second.

What layer 3 does not hold: the Learner tables. They stay in Neon only (layers 1 and 2), because a dump of
personal data must be guarded and must honour deletion requests (option D, not chosen). The Library is in
the dump because a rebuild from its sources gives new passage ids, and Learner messages cite passages by id
(`/passages/<id>`). A rebuild also costs model and Voyage calls.

## Rules

- **Before you merge a PR that adds a file in `drizzle/`**, make sure a snapshot comes first.
  `scripts/migrate-on-build.mjs` applies the migration to production on the next `main` deploy.
  - When `scripts/migrate-on-build.mjs` on `main` has `snapshotBeforeMigrating` (PR #36) and `NEON_API_KEY`
    and `NEON_PROJECT_ID` are set in Vercel Production (both set on 2026-11-15), the deploy takes a
    `pre-migrate-<sha>-<time>` snapshot itself (kept 30 days), and fails if it cannot. Nothing to do by hand.
  - Before that, or if `NEON_API_KEY` is removed (then it migrates with no snapshot), take a manual snapshot:
    ```bash
    neon snapshots create --project-id "$NEON_PROJECT_ID" --branch main --name before-<pr>-<yyyy-mm-dd>
    ```
    (or `scripts/backup-drill.sh --only 4 --snapshot-name before-<pr>-<yyyy-mm-dd> --yes`).
- **Re-dump the Library** (`--redump`, below):
  - after each `npm run library:load` (new or changed sources, for example #38),
  - once a month, because the weekly refresh adds Damodaran posts,
  - before any change that deletes Library data (for example #19),
  - after a migration that changes a `library_*` table, because the restore makes the tables as they were
    at the dump. If the migration adds a Library table or a `library_passages` column, first add it to
    `fingerprint()`, `LIBRARY_TABLES` or `PASSAGE_COLUMNS` in the script: until then
    `src/dev/backup-drill.test.ts` fails, and stage 6 stops.
- **Never put a dump in git.** The Damodaran blog text is stored for private search only. The script
  refuses a dump folder inside a git repository.
- **Keep a copy off the VPS.** One machine is one point of failure. Not done yet (2026-11-15): until the owner
  has a checked copy on the laptop, both copies are on one VPS disk. Copy `copy2` to the laptop and check it:
  ```bash
  scp -r vps:/root/backups/copy2 ./value-it-backups
  cd value-it-backups && shasum -a 256 -c library-<stamp>.dump.sha256     # Linux: sha256sum -c
  ```

## Run the script

`scripts/backup-drill.sh` does every step of option B. It runs on Linux and macOS.

You need:

- `pg_dump`, `pg_restore` and `psql`, **version 18 or newer** (the server runs Postgres 18, and `pg_dump`
  refuses a newer server). Debian/Ubuntu: `apt install postgresql-client-18` from the PGDG repo.
  macOS: `brew install libpq`. The script finds `/usr/lib/postgresql/18/bin` and Homebrew's libpq by itself;
  elsewhere, set `PG_BIN`.
- The `neon` CLI, logged in (`npm i -g neonctl`, then `neon auth`), and `jq`.

Commands:

```bash
export NEON_PROJECT_ID=<id from neon projects list>
scripts/backup-drill.sh --yes                     # everything: schedule, protect, dump, copy, drill, clean up
scripts/backup-drill.sh --redump                  # stages 5 to 7 only: a fresh dump and its second copy
scripts/backup-drill.sh --from 8 --yes            # the restore drill again, on the last dump
scripts/backup-drill.sh --help                    # every option
```

| Stage | What it does | Changes Neon? |
|---|---|---|
| 1 tools | Finds the Postgres 18+ tools, the neon CLI and jq. | No |
| 2 schedule | Sets a daily snapshot at `--hour` (22) UTC, kept `--retention-days` (14). Skips when already set. | Yes |
| 3 protect | Sets `main` as protected. Skips when already protected. `--no-protect` skips the stage. | Yes |
| 4 snapshot | A manual snapshot, only with `--snapshot-name`. | Yes |
| 5 connect | Read only: Postgres version, and that the database holds Library passages. | No |
| 6 dump | Checks that the script knows every `library_passages` column, measures `main` (row count + hash per table), dumps, checks the file, measures again. | No |
| 7 copy | Copies the dump to `--copy-dir` (default `<dump dir>/copy2`) and checks its checksum. | No |
| 8 drill-branch | A throwaway branch `drill-restore-<time>`: schema only, deletes itself after 1 day. If Neon refuses schema only, it stops. Only with `--allow-full-copy` does it make a full copy instead (every Learner row in it, same expiry). | Yes (throwaway) |
| 9 drill-db | An empty database `library_drill` on that branch, with `vector` and `lakebase_text`. | Throwaway only |
| 10 restore | `pg_restore` of the dump into `library_drill`, all or nothing. | Throwaway only |
| 11 compare | Measures `library_drill` and compares it with the measurement from stage 6. | No |
| 12 clean-up | Deletes the throwaway branch (`--keep-branch` keeps it). Prints a line for the ticket only when stage 11 compared the current dump on the current drill branch. | Yes (throwaway) |

How it behaves:

- **No prompts for values.** Every setting has a flag or an environment variable (`--help`).
- **Changes need a yes.** On a terminal it asks before each change. With `--yes` it does not ask. With no
  terminal and no `--yes`, it stops before the first change. Reads and the dump need no yes.
- **Secrets.** Connection strings come from `neon connection-string` into shell variables. They go to
  `psql`, `pg_dump` and `pg_restore` as `PG*` environment variables, never on a command line, the terminal,
  a log or a file. The state file `<dump dir>/.drill-state` holds only the stamp, branch names and ids,
  `main`'s host name and the result.
- **Files.** The dump folder is mode 700 and every file in it is mode 600. For each dump, with
  `<stamp>` = UTC time:
  `library-<stamp>.dump` (the dump), `.dump.sha256` (checksum), `.main.txt` (counts and hashes of `main`),
  `.toc.txt` (contents list), `.dump.log`, and after a drill `.restore.log`, `.drill.txt` and
  `.result.md` (the compare table).
- **Resume.** After a stop, the message gives the command to run next: the same flags, with `--from <stage>`.
- If `main` changes during the dump (the weekly refresh), stage 6 stops. Run it again later.

## Restore

Pick the layer by what went wrong. Restores of `main` change production: take a manual snapshot first
when you can, and ask the owner.

### A. A bad change in the last 7 days: point-in-time restore

Look first, without touching `main`: make a branch from `main` as it was at that time, and check it.

```bash
neon branches create --project-id "$NEON_PROJECT_ID" --name check-<yyyymmdd> --parent <RFC 3339 time, e.g. 2026-11-15T08:00:00Z>
```

Then restore `main` to that time. `main` is protected, so the restore must keep a backup of its current state:

```bash
neon branches restore main ^self@<RFC 3339 time> --project-id "$NEON_PROJECT_ID" \
  --preserve-under-name main_old_<yyyymmdd>
```

The backup branch is protected too, and the Launch plan allows 2 protected branches. When you no longer need
it, remove its protection (Console: Branches, the branch, Remove protection), then delete it. Delete the
`check-` branch too.

### B. A bad migration, or a mistake found later: restore a snapshot

After a bad migration, the snapshot to restore is the one taken just before it: `pre-migrate-<sha>-<time>`
(taken by each production deploy that migrates, since PR #36; kept 30 days) or your manual `before-<pr>-<date>`. For a mistake
found later, pick the last daily snapshot from before the mistake.

```bash
neon snapshots list --project-id "$NEON_PROJECT_ID"
neon snapshots restore <snapshot id or name> --project-id "$NEON_PROJECT_ID" --target-branch main
#   prints the restored branch's id; connect to it and check the data
neon snapshots finalize <restored branch id> --project-id "$NEON_PROJECT_ID"
```

`finalize` moves `main`'s computes to the restored branch, so the connection strings stay the same. The old
branch becomes `main (old)`. The protection and the snapshot schedule move to the restored branch. Without
`finalize`, nothing changes for the app.

### C. The Neon project is lost: rebuild from the Library dump

Only the Library comes back (with its passage ids). Learner records do not, by design (see layer 3).

1. Make a new Neon project with Postgres 18. Get its direct (not pooled) connection string into a shell
   variable with `neon connection-string`, as the script does. Never paste it into a file in the repo.
2. Make the app's tables on it: `npm run db:migrate` with that direct string as `DATABASE_URL_UNPOOLED`
   (`drizzle.config.ts` reads it). This makes every table, empty, and the `vector` and `lakebase_text`
   extensions.
3. Drop the 5 empty Library tables, so the dump can make them exactly as they were. No other table has a
   foreign key to them.
   ```sql
   DROP TABLE library_passages, library_documents, library_pictures, library_refresh_runs, library_sources;
   ```
4. Restore the dump. This is the same command the drill proves:
   ```bash
   pg_restore --dbname=<database> --no-owner --no-privileges --single-transaction --exit-on-error \
     library-<stamp>.dump
   ```
5. Check: the row counts must equal those in `library-<stamp>.main.txt`. The `fingerprint` query in the
   script gives the same lines for any database.

Steps 2 and 3 were not drilled end to end; step 4 was (see below). Outside Neon there is no `lakebase_text`:
write `pg_restore --list` to a file, delete the `library_passages_bm25` line, and pass the file with
`--use-list`. The app then ranks keywords with Postgres full-text search instead of BM25.

## Drill results

### 2026-11-15 (first drill)

- Neon changes: manual snapshot `before-backup-drill-2026-11-15` (kept until deleted), daily snapshot
  schedule on `main` at 22:00 UTC kept 14 days, `main` protected. All three done with the neon CLI.
- Two runs, both PASS, with the same counts and hashes on `main`. The second run used the final script.
  Dump (the current one until 2026-11-16): `library-20261115-092049.dump`, custom format, 118 MB (123,550,796 bytes),
  sha256 `3569e8a5c105377968fd319b16ae757c04554fa3da7010d8c528c9b400bd8ef9`.
  First run: `library-20261115-091455.dump`, sha256 `705d2a54570b09dac0fc7bce559d312a05323bddc336f94c3e63568c1cfd8988`
  (same rows; a custom-format dump stores its own time, so the checksums differ).
  Both are on the VPS in `/root/backups/` and `/root/backups/copy2/`. Laptop copy: not yet.
- Drill: a schema-only branch (expiry 1 day), a new database `library_drill` with `vector` and
  `lakebase_text`, a full restore in 34 to 36 seconds (the BM25 index included), then the branch was deleted.
- Result: **PASS**, 9 of 9 lines match.

| Table | Rows main | Rows restored | Hash match |
|---|---:|---:|---|
| library_documents | 691 | 691 | yes |
| library_passages (all but vectors) | 21993 | 21993 | yes |
| library_passages.embedding | 21993 | 21993 | yes |
| library_passages.search | 21993 | 21993 | yes |
| library_passages_id_seq | 36192 | 36192 | yes (sequence value) |
| library_pictures | 2882 | 2882 | yes |
| library_refresh_runs | 2 | 2 | yes |
| library_refresh_runs_id_seq | 2 | 2 | yes (sequence value) |
| library_sources | 9 | 9 | yes |

How to read it: each hash is an md5 over the rows in primary-key order, so a match means the same rows with
the same contents. Only counts and hashes leave the database. `library_passages.search` is a generated column,
so its match also shows that the restore rebuilt it the same way. For a sequence, the number is its
`last_value`, so new rows get new ids after the old ones.

After this drill, the PR review changed the script: stage 8 no longer falls back to a full copy without
`--allow-full-copy`, stage 12 prints a ticket line only for a compare of the current dump, stage 6 first
checks the `library_passages` columns, and the resume hints keep the flags. The dump, restore and compare
commands did not change. `src/dev/backup-drill.test.ts` runs the script against fakes of `neon` and the
Postgres tools; the next real drill runs the new script against Neon.

### 2026-11-16 (re-dump after the production Library load)

- `scripts/backup-drill.sh --redump`: `library-20261116-020254.dump`, custom format, 152 MB (159,339,199 bytes),
  sha256 `3e8c8804883bbaa13a9fd36dd1e362bd44365172227e1a369af5e99bca1c1588`. This is the current dump.
- Rows on `main`: 13 sources, 691 documents, 28,321 passages (all with embeddings), 2,882 pictures, 2 refresh runs.
- On the VPS in `/root/backups/` and `/root/backups/copy2/`. Laptop copy: not yet (`docs/owner-actions.md` step 10).
- A dump only, with no restore drill.

Add a new section here after each drill (the script prints the table in stage 11 and saves it as
`library-<stamp>.result.md`).
