# Database migrations

Production migrates during the Vercel build, before `next build` (`scripts/migrate-on-build.mjs`), and takes a Neon snapshot first. The old deployment keeps serving until the new one is promoted, so for a while **the old code runs on the new schema**. drizzle has no down migrations.

## Rule: expand, then contract

Every migration must work with the code that is live now **and** the code it ships with.

1. **Expand** (one PR): only add. New tables, new nullable columns or columns with a default, new indexes. Old code ignores them.
2. Ship the code that writes and reads the new shape. Backfill in the migration or a script.
3. **Contract** (a later PR, after step 2 is live in production): drop, rename, `SET NOT NULL`, drop a default.

Never in one PR: drop or rename a column or table that live code still reads, make a column `NOT NULL` that live code does not fill, or change a column's type in place. Do a rename as add-new, copy, switch the code, then drop the old one later.

Precedent: `0026_learners_expand.sql` → `0027_learners_keys.sql` → `0028_learners_contract.sql`.

## Do not

- `drizzle-kit push`: it changes the database with no migration file. Make files with `npm run db:generate`.
- Run `npm run vercel-build`, `node scripts/migrate-on-build.mjs` or `npm run db:migrate` against production by hand. Production migrates only through a merge to `main`. `.claude/settings.json` denies these commands.

## Undo a bad migration

Restore the `pre-migrate-<sha>-<time>` snapshot in the Neon console (kept 30 days), then roll back the deployment in Vercel.
