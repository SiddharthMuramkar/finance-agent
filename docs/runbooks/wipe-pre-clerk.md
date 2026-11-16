# Runbook: wipe the pre-Clerk Learners (issue #33, Phase 6)

The Clerk fresh start: delete every Learner with no Clerk user (`learners.clerk_user_id is null`: the passcode Learners
and any Better Auth ones), every row of theirs, and the Sign-up switch (`settings.signup_open`). Clerk-linked Learners
keep everything. It runs once, by hand, with `scripts/ops/wipe-pre-clerk-learners.mjs`. It is not a migration: a
migration would also run on every test database, where the seeded Learner 1 has no Clerk user.

The script:

- Reads `DATABASE_URL_UNPOOLED` only and never prints it. It prints the database host and row counts, never a row.
- Does a dry run by default, in a read-only transaction: for each table, the rows now, the rows to delete and the
  rows after.
- With `--execute`, needs `--i-took-a-snapshot <name>` and `--database-host <host>` (the host the dry run printed).
  It refuses when no Learner has a Clerk user (pass `--allow-empty` only for a rehearsal before Clerk is live). It also
  refuses when a table points at `learners` that it has no step for (schema drift), or when a kept row points at a
  row it would delete.
- Deletes in one transaction (repeatable read, `lock_timeout` 10 s), in an order the foreign keys allow. Before it
  commits, it checks that each table lost exactly the counted rows. Any mismatch or error rolls back everything.

What it deletes, for the gone Learners: `learners`, `sessions`, `turns`, and every row in `topic_restarts`,
`learner_state`, `topic_progress`, `check_results`, `misconceptions`, `insight_attempts`, `quiz_attempts`,
`review_cards`, `review_log`, `pasted_texts`, `learner_profile`, `note_items`, `session_items`, `widget_state`,
`skill_state`, `practice_answers`, `tutor_incidents` and `skip_ahead_attempts` (by `learner_id`). It also deletes
`messages`, `usage` and `reply_checks` (by their Sessions), `tool_calls` (by `turn_id`, which has no foreign key) and
`settings.signup_open`. It keeps `tool_calls` rows tied to no turn: nothing links them to a Learner, and the dry run
prints how many there are. The Better Auth tables are not touched; the PR C contract migration drops them afterwards.

Neon ids (from the issue #33 plan): project `cool-queen-75259301`, production branch `main` (`br-shy-river-b3czlpmv`).
Below, `P=cool-queen-75259301`.

## 0. Before you start

- Clerk production is live, PR B is merged and deployed, and the owner has signed in through Clerk at least once. A
  Clerk-linked Learner must exist, or the script refuses.
- Ask the owner for an explicit "yes" right before step 3 and step 4. This deletes production data.
- Connection strings go only into gitignored `.env.*` files (`.gitignore` has `.env.*`). Never echo them.

```bash
cd /root/projects/finance-agent   # or any clone of the branch that has scripts/ops/
P=cool-queen-75259301
```

## 1. Dry run on `main` (read-only)

```bash
printf 'DATABASE_URL_UNPOOLED=%s\n' "$(neon connection-string main --project-id "$P")" > .env.wipe-main
node --env-file=.env.wipe-main scripts/ops/wipe-pre-clerk-learners.mjs
```

Record the printed host and the table of counts. Check:

- `Learners: ... N with a Clerk user (kept)`: N is at least 1 (the owner), and is the number of people who have
  signed in through Clerk.
- `Tables pointing at learners with no step here: none` and `Kept rows pointing at deleted rows: none`. If either
  is not `none`, stop: the script will refuse. Add the table to `WIPE_STEPS` (and the test), or find out why a kept
  row points at an old Learner's row.

## 2. Rehearse on a Neon branch made from `main`

```bash
EXP=$(date -u -d '+2 days' +%Y-%m-%dT%H:%M:%SZ)   # the branch deletes itself then
neon branches create --project-id "$P" --name wipe-rehearsal --parent main --expires-at "$EXP" --no-secrets
printf 'DATABASE_URL_UNPOOLED=%s\n' "$(neon connection-string wipe-rehearsal --project-id "$P")" > .env.wipe-rehearsal
node --env-file=.env.wipe-rehearsal scripts/ops/wipe-pre-clerk-learners.mjs                  # counts before
node --env-file=.env.wipe-rehearsal scripts/ops/wipe-pre-clerk-learners.mjs --execute \
  --i-took-a-snapshot rehearsal-branch --database-host <the host this branch's dry run printed>
node --env-file=.env.wipe-rehearsal scripts/ops/wipe-pre-clerk-learners.mjs                  # counts after
```

Pass when:

- The execute run ends with `Committed.`, and its `deleted` column equals the first dry run's `to delete` column.
- The last dry run shows `0 without` Learners and `0` in every `to delete` cell. Its `rows now` column equals the
  first dry run's `after` column, and `settings (signup_open)` is 0.
- The verification queries in step 5 pass against the branch.

To rehearse before Clerk is live (no Clerk-linked Learner yet), add `--allow-empty`. Everything is deleted then, which
proves only the order and the transaction, not what is kept.

The branch expires by itself after two days, so there is nothing to delete. To rehearse PR C's migration too, use the
order in "With PR C" below instead.

## 3. Snapshot `main`, right before the real run

Take it after the rehearsal, so it holds everything up to the wipe:

```bash
SNAP=pre-clerk-wipe-$(date -u +%Y%m%dT%H%MZ)
neon snapshots create --project-id "$P" --branch main --name "$SNAP"
neon snapshots list --project-id "$P"          # the new snapshot is listed
```

The Neon MCP `create_snapshot` does the same if the CLI is not logged in.

## 4. The real run on `main` (owner "yes" first)

```bash
node --env-file=.env.wipe-main scripts/ops/wipe-pre-clerk-learners.mjs                       # counts, once more
node --env-file=.env.wipe-main scripts/ops/wipe-pre-clerk-learners.mjs --execute \
  --i-took-a-snapshot "$SNAP" --database-host <the host step 1 printed>
```

Keep the printed output (counts only) for the issue #33 comment. If it prints `Refusing` or `Rolled back`, nothing
was deleted. Read the reason, and do not retry with `--allow-empty` on `main`.

## 5. Verify (aggregate counts only)

Run the dry run again (`node --env-file=.env.wipe-main scripts/ops/wipe-pre-clerk-learners.mjs`). Every `to delete`
cell must be 0. Then run these through the Neon MCP `run_sql` (project `P`, branch `main`):

```sql
-- Only Clerk-linked Learners are left.
select count(*) filter (where clerk_user_id is null) as without_clerk,
       count(*) filter (where clerk_user_id is not null) as with_clerk
from learners;                                              -- without_clerk = 0, with_clerk = N from step 1

-- The Sign-up switch is gone.
select count(*) as n from settings where key = 'signup_open';   -- 0

-- tool_calls has no foreign key, so check it by hand: the rows tied to no turn are only the ones kept on purpose.
select count(*) as n from tool_calls where turn_id is null or turn_id not in (select id from turns);
                                                            -- equals step 1's "tool_calls tied to no turn"
```

Every other table that points at a Learner, Session or turn has a foreign key, so Postgres itself guarantees no row
was left behind for a deleted Learner.

Then check the app: the owner signs in at https://www.value-it.xyz/sign-in, `/study` loads their own progress, one
Tutor turn works, and `/admin` loads.

Finally, delete the local env files: `rm .env.wipe-main .env.wipe-rehearsal`.

## Rollback: restore the snapshot

This puts `main` back as it was at the snapshot. Anything written after it is lost, including Clerk Learners' turns
since then. Owner "yes" first.

```bash
neon snapshots restore "$SNAP" --project-id "$P" --target-branch main --name main-restored   # not finalized yet
# Inspect main-restored (a dry run against its connection string shows the old counts), then swap it in.
# The argument is the restored branch's id, which the restore command prints, not main:
neon snapshots finalize <restored branch id> --project-id "$P" --name main-before-restore
```

Finalizing moves `main`'s computes to the restored branch, so the app's connection strings keep working. Keep
`main-before-restore` until it is clear nothing in it is needed.

To bring back one Learner without losing newer writes, restore into a new branch only (`neon snapshots restore
"$SNAP" --project-id "$P" --name wipe-recovery`) and copy that Learner's rows back by hand.

## After the wipe

- PR C (the contract migration) can merge. See "With PR C" below for the whole order.
- Neon preview branches made from `main` before the wipe still hold the old Learners. Delete them with the stale
  preview branches (Phase 5 clean-up; owner "yes").

## With PR C (the contract migration)

PR C adds migration `0040_clerk_contract`. It drops `user`, `session`, `account`, `verification`, `rate_limit`,
`email_link_sends`, `invites`, `access_denials`, `model_comparison_runs`, `model_comparison_answers` and
`learners.auth_user_id` (with its foreign key and index). It keeps `login_failures` (the test door).

The wipe and the drop touch different tables. So the wipe's counts do not change when 0040 runs.

Do the steps in this order. Each step needs the one before it.

### C1. Snapshot `main`

PR B and #44 are merged and live. Take a snapshot. It is the restore point for everything below.

```bash
neon snapshots create --project-id "$P" --branch main --name "pre-prc-$(date -u +%Y%m%dT%H%MZ)"
```

### C2. Rehearse on a branch that expires

Make a branch of `main` that deletes itself in two days. Then nothing has to be deleted by hand.
Run this from a clone of PR C's branch, so that `drizzle/` holds 0040.

```bash
EXP=$(date -u -d '+2 days' +%Y-%m-%dT%H:%M:%SZ)
neon branches create --project-id "$P" --name prc-rehearsal --parent main --expires-at "$EXP" --no-secrets --output json
printf 'DATABASE_URL_UNPOOLED=%s\n' "$(neon connection-string prc-rehearsal --project-id "$P")" > .env.prc-rehearsal
```

Note the new branch id (`br-…`). The counts below run through the Neon MCP `run_sql` on that branch:

```sql
-- Rows in every table. Counts only, never a row.
select table_name,
       (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from %I', table_name), false, true, '')))[1]::text::int as n
from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by 1;
select count(*) as applied from drizzle.__drizzle_migrations;   -- 40 before 0040, 41 after
```

1. Counts before. Save them.
2. The wipe: the step 2 commands, with `.env.prc-rehearsal` in place of `.env.wipe-rehearsal`. Add `--allow-empty`
   only if the owner has not signed in through Clerk yet.
3. Counts after the wipe. Save them.
4. The 0040 migration, run the way the Vercel build runs it. The owner runs this line. The agent may not:
   `.claude/settings.json` denies it.

   ```bash
   VERCEL_ENV=production NEON_SNAPSHOT=off node --env-file=.env.prc-rehearsal scripts/migrate-on-build.mjs
   ```

   It prints `41 migrations in the repo, 40 applied in the database, 1 pending`. Then it prints `now at 41 of 41`.
5. Counts after 0040. Then run `neon branches schema-diff main prc-rehearsal --project-id "$P"`.

Pass when:

- `applied` goes from 40 to 41.
- The ten tables are gone. `learners` has no `auth_user_id`.
- Every other table has the same count after 0040 as after the wipe. `login_failures` keeps its rows.
- The schema diff shows only those drops.

Then delete the env file: `rm .env.prc-rehearsal`. The branch expires by itself.

If 0040 fails, nothing changed: the migration runs in one transaction, and it has no `CASCADE`. Read the error and
fix PR C before you go on.

### C3. The owner signs in through Clerk

The owner signs in at https://www.value-it.xyz/sign-in. The step 1 dry run on `main` then shows at least 1 Learner
with a Clerk user.

### C4. The owner decides on the data the drop loses

`invites` has 1 row (an email). `model_comparison_runs` and `model_comparison_answers` have 4 runs and 116 answers.
The owner exports them outside the repo, or accepts the loss. After the drop, only a snapshot (kept 30 days) has them.

### C5. The wipe on `main`

Do steps 1, 3, 4 and 5 above. Ask the owner for a "yes" first.

### C6. Merge PR C

Ask the owner for a "yes" first. The merge deploys `main`. The build takes a `pre-migrate-<sha>-<time>` snapshot and
then applies 0040, before `next build`. Check the build log for `now at 41 of 41`. Then check the app as in step 5.

If the build fails before it migrates, or 0040 itself fails, nothing changed. If `next build` fails after 0040, the
live PR B code still works: it names none of the dropped tables or the column. Fix PR C and deploy again. Restore the
`pre-migrate-…` snapshot only to get the dropped data back (see `docs/agents/migrations.md`).

### C7. Remove the passcode variables from Vercel Production

Only after PR C is live, and with the owner's "yes". The passcode door is shut on Vercel, so Production reads none of
them. Run from a folder linked to the project, or add `$S` (see `docs/agents/platform.md`).

```bash
vercel env rm PASSCODE --environment production --confirm-name PASSCODE
vercel env rm PASSCODES --environment production --confirm-name PASSCODES
vercel env rm SESSION_SECRET --environment production --confirm-name SESSION_SECRET
vercel env ls production   # the three names are gone
```

The live deployment keeps its old values until the next deploy. Nothing needs them, so no redeploy is needed.
