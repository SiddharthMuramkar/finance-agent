> Throwaway research branch for wayfinder ticket #11. Never merged.

# Research #11: Gate production deploys, migrations and previews

Date: 2026-11-14. Method: the `research` skill, using primary sources only (Vercel, Neon and GitHub docs, drizzle source code), plus read-only checks of the repo, the Vercel project, the Neon project and the GitHub ruleset. I changed nothing.

**Verified 2026-11-14 by an adversarial pass.** The changes are listed under "Verification changes" at the end. Items marked **(uncertain)** need owner confirmation.

## Question

1. **Production gates.** How do we gate a deploy to production? The options in the ticket:
   - Vercel Deployment Checks, or deploy from CI.
   - A Neon snapshot before `migrate-on-build` runs.
   - Migrations after a successful build, or an expand-then-contract rule.
   - A block on `vercel --prod` from the laptop.
2. **Previews.** Do we set previews up properly (env vars, their own key, a Neon branch per PR)? Or do we turn them off with a correct `git.deploymentEnabled` pattern?

Words used here:
- **Production** is the live site (www.value-it.xyz) and its env vars.
- **Preview** is a deploy of any other branch. It gets its own URL and the "Preview" env vars.
- **Development** is your laptop (`vercel dev`, `.env`).
- **Promote** means Vercel points the live domain at a deployment.
- A **gate** is a check that must pass before the next step can start.
- **Expand-then-contract**: first add new columns or tables (expand). Then change the code. Delete the old parts (contract) only in a later deploy.

## Short answer

1. Turn on **Deployment Checks** (free on Hobby): Vercel then waits for GitHub `check`, `build` and `ui` before it promotes. Deployment Checks hold only the promote. The build, and so the migration, still runs first.
2. Move the migration to **after `next build`**, and make **expand-then-contract** a written rule. Together these make "DB ahead of live code" safe.
3. Take a **Neon snapshot in `migrate-on-build`** before you migrate. It costs about $0.025 a month for each snapshot you keep. The 7-day point-in-time restore is already on.
4. **Block `vercel --prod`**. On Hobby, Vercel has no switch for this, so add Claude Code deny rules. On Pro, a Deployment Policy can allow production deploys from Git only.
5. **Turn previews off now** with `{"main": true, "**": false}`. `*` does not match `/`, but `**` does.

## Options table

| Option | What it gives | Cost on Hobby | Cost on Pro | Code / setup effort | Risk |
|---|---|---|---|---|---|
| A. Deployment Checks (require GitHub `check`, `build`, `ui`) | Vercel holds each production deploy until CI on `main` passes, then promotes it | $0 | $0 | Owner: one dashboard setting. No code. | The build and its migration still run before the checks. Production goes live about 20 to 30 min after a merge. "Force Promote" can bypass the checks. |
| B. Migrate after `next build` (`next build && node scripts/migrate-on-build.mjs`) | A failed build can no longer leave the DB migrated | $0 | $0 | One line in `package.json`, plus a test update (`src/dev/migrate-on-build.test.ts`) | Small. CI already builds with no env, and every page is `force-dynamic`, so `next build` probably does not read the DB. Check this once in a production build log. |
| C. Expand-then-contract rule + a migration lint in CI | Old code always works on the new schema: during the build, while checks wait, after a failed CI run and after a rollback | $0 | $0 | A short ADR/doc and a small script that flags `DROP`, `RENAME`, `SET NOT NULL` and `TYPE` changes | You need discipline. A contract step needs a second deploy. |
| D. Neon snapshot in `migrate-on-build` (only when migrations are pending) | A named restore point before each migration | About $0.025/month per snapshot (0.275 GB × $0.09/GB-month; manual snapshots are billed at full size). Paid plans allow 100 manual snapshots. | Same (this is a Neon cost) | Small. Needs `NEON_API_KEY` (project-scoped) as a Vercel Production secret. | A leaked key gives Editor access to the project (it cannot delete the project). A restore removes the Learner writes made after the snapshot from the live branch. |
| D0. Use only the 7-day point-in-time restore (already on) | Restore to any second in the last 7 days | $0 extra (history is billed at $0.20/GB-month) | Same | None | No named point. You must find the time yourself. |
| E. Deploy from CI (`vercel build` + `deploy --prebuilt --prod` in Actions) | Production builds only after CI passes | Vercel $0. Actions: about 5 more min on top of about 78 billed min per run. | Same. Conflicts with a "Git only" Deployment Policy. | Medium to high | Needs `VERCEL_TOKEN` (and maybe DB secrets) in GitHub. **(uncertain)** If the account is on GitHub Pro (likely, see below), these can be environment secrets limited to `main`. On GitHub Free they must be repo-wide. Secret (sensitive) Vercel vars are write-only, so the CI build may not get them. |
| F. Migration as its own CI job, required as a Deployment Check | The migration runs only after CI passes and before the promote | Actions minutes | Same | Medium | Puts the production DB URL in GitHub. On GitHub Free it must be a repo-wide secret, which any same-repo PR workflow can read. On GitHub Pro it can be an environment secret with a `main`-only deployment branch rule. |
| G1. Block CLI on Hobby: Claude Code deny rules in a checked-in `.claude/settings.json` | Agents cannot run `vercel --prod`, `vercel deploy --prod`, `promote`, `rollback`, or Vercel MCP `create_deployment` / `request_promote` | $0 | $0 | Small | Does not stop a person who types `vercel --prod` in a plain terminal |
| G2. Block CLI on Pro: Deployment Policy, Production = Git only | Vercel refuses production deploys from the Vercel CLI, REST API, v0, Deploy Hooks and Marketplace Integrations. MCP deploys probably count as REST API (the docs do not name MCP). | n/a (Pro only) | Included in Pro ($20/month platform fee). Needs the Owner role. | Owner: dashboard | Also blocks option E |
| P1. Previews off: `{"main": true, "**": false}` | No preview builds, no Neon preview branches, no preview data copies | $0 | $0 | One line in `vercel.json` | You lose clickable previews. CI still tests the UI with a scripted Tutor. |
| P2. Opt-in previews: `{"main": true, "preview-*": true, "**": false}` + P3 for those | A preview only when you ask for one | As P3, but less | As P3 | P1 + P3 | Few. The branch name must start with `preview-` (`preview/x` does not match `preview-*`). |
| P3. Previews set up properly | Working preview links | OpenAI preview spend. Neon: $1.50/branch-month above 10 branches. A running preview build holds Hobby's single build slot. | Same, but concurrent builds (on-demand, billed per build CPU minute) | Medium: OpenAI key, `PASSCODES`, preview migrations, Neon cleanup | Each preview holds a copy of Learner data. Vercel Authentication protects the URL (already on). The Neon integration stores each preview's DB URL as a readable (not Secret) Vercel var, which Vercel flags as `readable-secret`. |

## Facts with sources

All web sources were read on 2026-11-14 unless a different date is shown.

**Vercel**
- Deployment Checks "hold each production deployment until all required checks pass before assigning it to your custom production domains." "Production deployments will still be created." You can bypass them with **Force Promote**. They need automatic production aliasing on. GitHub job names identify the checks. https://vercel.com/docs/deployment-checks (last updated 2026-08-11)
- "Deployment Checks are available for all projects connected to GitHub repositories." https://vercel.com/changelog/block-vercel-deployment-promotions-with-github-actions (2025-10-09). Native Deployment Checks (the `lint` and `typecheck` scripts) "are available to every team." https://vercel.com/changelog/native-deployment-checks (2026-04-28). The docs page shows no plan badge. The Deployment Policies page does show one.
- **Deployment Policies** "are available on Enterprise and Pro plans", and only the Owner role can use them. The Deployment Sources rule can allow or block Git, Vercel CLI, v0, REST API, Deploy Hooks and Marketplace Integrations for each environment. https://vercel.com/docs/deployments/deployment-policy (last updated 2026-07-14)
- I found **no Hobby setting** that blocks CLI production deploys. I searched the Vercel docs (MCP search plus Firecrawl) on 2026-11-14.
- `git.deploymentEnabled` uses **minimatch**. When several rules match a branch, "if at least one rule is `true`, a deployment will occur." https://vercel.com/docs/project-configuration/git-configuration (last updated 2026-08-25)
- In minimatch, `**` matches across folder names when it is the only thing in a path part. `*` matches within one part. https://github.com/isaacs/minimatch (README, plus Context7 `/isaacs/minimatch`). A local test with minimatch 10.0.3 gave this result: `chore/tracker-setup` matches `**` but not `*`, and `main` matches both. I also saw this in this project: previews were built for `chore/add-spec`, `chore/tracker-setup` and `docs/architecture` (Vercel deployment list, 2026-11-14).
- Instant Rollback: "Hobby users can roll back to the immediately previous deployment." "There are no change in Environment Variables." The page also reminds you that databases and external APIs can behave differently after a rollback. After a rollback, Vercel turns off auto-assignment of production domains, so new pushes to `main` do not go live until you undo the rollback. https://vercel.com/docs/instant-rollback and https://vercel.com/docs/cli/rollback
- Limits: **Concurrent Deployments: Hobby 1, Pro up to 500**. Deployments per day: Hobby 100, Pro 6000. https://vercel.com/docs/limits. Confirmed by https://vercel.com/docs/builds/managing-builds (last updated 2026-09-17): "Hobby: 1 concurrent deployment. Builds beyond this run sequentially." On Pro, on-demand concurrency is billed: "You are billed for the CPU minutes you use."
- **Prioritize Production Builds is on all plans.** It puts production builds ahead of queued preview builds (the default order is first in, first out). https://vercel.com/docs/builds/managing-builds (2026-09-17)
- Rolling Releases: none on Hobby, 1 project on Pro. Pro costs **$20/month**, which includes 1 deploying seat and $20 of usage credit. Extra deploying seats cost $20/month each. https://vercel.com/pricing and https://vercel.com/docs/plans/pro-plan (2026-09-15)
- Hobby terms: "Hobby teams are restricted to non-commercial personal use only." Commercial use "is defined as any Deployment that is used for the purpose of financial gain of anyone involved in any part of the production of the project". Examples include payment processing, advertising a product or service, and ads. https://vercel.com/docs/limits/fair-use-guidelines (last updated 2026-11-12) and https://vercel.com/docs/plans/hobby (2026-11-12)
- Secret (sensitive) env values are write-only after you save them. https://vercel.com/docs/environment-variables/sensitive-environment-variables

**Neon**
- Paid plans allow 100 manual snapshots, and snapshot storage costs **$0.09/GB-month**. Manual snapshots are billed as full snapshots. Automatic backup schedules are on paid plans. Point-in-time restore works on root branches only. https://neon.com/docs/guides/backup-restore (last updated 2026-09-11). The pricing page confirms "100 snapshots $0.09/GB-month": https://neon.com/pricing
- Launch includes **10 branches per project**. Extra branches cost **$1.50/branch-month** (about $0.002/hour, prorated hourly). History is up to **7 days**, at $0.20/GB-month. Launch adds protected branches. https://neon.com/docs/introduction/plans (modified 2026-11-12) and https://neon.com/pricing
- The Neon-managed Vercel integration creates a `preview/<git-branch>` branch, copied from the default branch, for each preview deployment. It deletes old branches only if "Automatically delete obsolete Neon branches" is on, after the Git branch is merged or deleted. The cleanup runs only when the next preview deployment is created. https://neon.com/docs/guides/neon-managed-vercel-integration (last updated 2026-10-23) and https://neon.com/docs/guides/vercel-branch-cleanup (2026-09-25)
- Project-scoped organization API keys have Editor access to one project only. They "cannot delete the project or manage who can access it." https://neon.com/docs/manage/api-keys (last updated 2026-10-09)

**GitHub**
- GitHub Free includes **$12/month** of Actions compute for private repos. GitHub Pro includes **$18/month**. A standard Linux runner costs **$0.006/min**, and GitHub rounds each job up to the next whole minute. So $12 is about 2,000 minutes, and $18 is about 3,000. https://docs.github.com/en/get-started/learning-about-github/githubs-plans, https://docs.github.com/en/billing/reference/actions-runner-pricing and https://docs.github.com/en/billing/concepts/product-billing/github-actions (all read 2026-11-14). runs-on.com/github-actions/pricing (Nov 2026) gives the same figures.
- On GitHub Free, environment secrets are "only available in public repositories." GitHub Pro, Team and Enterprise get them in private repos. GitHub Pro also gets deployment branch rules and environment variables in private repos. Required reviewers and wait timers stay public-only on Free, Pro and Team. https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments
- Rulesets are "available in public repositories with GitHub Free … and in public and private repositories with GitHub Pro, GitHub Team, and GitHub Enterprise Cloud." https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/about-rulesets

**drizzle**
- `PgDialect.migrate` applies all pending migrations inside one `session.transaction`. It skips any migration whose `folderMillis` is not newer than the last applied `created_at`. drizzle has no "down" migrations: the drizzle-kit commands are generate, migrate, push, pull, check, up, studio and export, and `up` upgrades snapshots, not the database. https://github.com/drizzle-team/drizzle-orm/blob/3bcb6a27ec1f4f1602aeeb0af2f5aec61010d72d/drizzle-orm/src/pg-core/dialect.ts#L63-L102 and the drizzle docs (Context7 `/drizzle-team/drizzle-orm-docs`)
- Upstream issue #5769 (open, 2026-05-16): "drizzle-kit migrate silently skips pending migrations when MAX(created_at) in __drizzle_migrations exceeds the journal `when` of pending entries." https://github.com/drizzle-team/drizzle-orm/issues/5769

**Inference, not verified**
- Release notes for `@vercel/client` 17.3.0 (2026-04-10, read on a mirror at newreleases.io) say `deploy --prod` waits for Deployment Checks. A GitHub check is keyed to the commit SHA. So a CLI deploy of uncommitted local changes on a green commit can still pass.
- Each preview started twice (see below). The Neon integration set the branch's `DATABASE_URL` about 3 s after the first deployment started, and the second deployment started about 2.5 s after that. So the integration probably cancels the first build and redeploys with the new env vars.

## How it fits this repo

What I saw on 2026-11-14:

- **`vercel.json`**: `buildCommand` is `npm run vercel-build`. `deploymentEnabled` is `{"main": true, "*": false}`, so it matches only branch names that have no slash.
- **`package.json`**: `vercel-build` is `node scripts/migrate-on-build.mjs && next build`. The migration runs first, so a failed `next build` leaves the DB migrated.
- **`scripts/migrate-on-build.mjs`**:
  - It runs only when `VERCEL_ENV=production`, so previews never migrate their Neon branch.
  - It runs all pending migrations in one transaction (through `drizzle-kit migrate`).
  - It already compares the applied count with the repo count and fails the deploy if they differ. This catches the drizzle #5769 skip.
  - This file is where the snapshot call (D) goes. Option B is a one-line change in `package.json`.
- **App pages**: every page in `src/app` is `export const dynamic = "force-dynamic"`, so pages read the DB at request time, not at build time. This supports option B.
- **`drizzle/0026_learners_expand.sql` → `0027_learners_keys.sql` → `0028_learners_contract.sql`**: you have already done expand-then-contract once, with a Neon snapshot before each step. Option C writes this down as the rule.
- **`.github/workflows/ci.yml`**:
  - Jobs `check`, `build` and `ui` run on `pull_request` and on `push` to `main`, and use no secrets.
  - Runs on `main` are never cancelled, so each merge gets its own result. This is the run that Deployment Checks would read.
  - One run on `main` (43561204951) used about **78 billed minutes** (73.8 raw; GitHub rounds each job up to a whole minute): `check` 18.7 min, `build` 1.9 min, 6 UI shards at 7.6 to 9.9 min each. It waited 8.6 min in the queue, so it took 27 min from push to green. A merged PR therefore costs about 156 minutes or more (one PR run plus one `main` run). At $12/month (Free) that is about 12 merges a month. At $18/month (Pro) it is about 19.
- **GitHub plan (uncertain)**: the token has no `user` scope, so I could not read the plan. But the repo is private and user-owned, and it has an active ruleset. Rulesets on private repos need GitHub Pro or higher. Also, the branch-protection API answered 404 "Branch not protected", not an "upgrade" error. So the account is **probably GitHub Pro**. The owner should confirm this at github.com/settings/billing.
- **GitHub ruleset "main: CI must pass"**: it requires `check`, `build` and `ui`, with `strict=false`. So the merge commit on `main` is not tested before Vercel builds it. Deployment Checks close this gap.
- **Vercel project `finance-agent`**:
  - Vercel Authentication covers all URLs except the custom domains (`all_except_custom_domains`).
  - **Preview env has no `OPENAI_API_KEY`, no `PASSCODES` and no `CRON_SECRET`.** It has the legacy `PASSCODE`, which signs in as the owner while `PASSCODES` is empty (`src/auth/passcode.ts`). It also has `SESSION_SECRET`, `VOYAGE_API_KEY` and an `ANTHROPIC_API_KEY` that no code in `src/` or `scripts/` reads.
  - The Neon integration (Neon-managed, Connectable Account) adds a `DATABASE_URL` and a `DATABASE_URL_UNPOOLED` for each preview branch. These are readable vars, not Secrets.
  - Each preview started twice: the first build was cancelled about 6 s later, then a new build ran.
- **Neon project `cool-queen-75259301`**:
  - Launch plan (`launch_v3`), 7-day history (`history_retention_seconds` 604800), 6 of 10 branches used.
  - `preview/chore/tracker-setup` and `preview/docs/architecture` were created by Vercel today. Both copy production data (about 275 MB each).
  - `main` is not protected. There are 5 manual snapshots, and 3 of them expire on 2026-11-17.
- **No checked-in `.claude/settings.json`**, and the worktree has no `.vercel/` link. I could not check the local user settings for a Vercel deny rule, because a read-jail hook blocks reads outside `~/value-it`.

## Recommendation (Hobby, now, before the beta)

**Production:** A + B + C + D. On Hobby, add G1. On Pro, use G2 instead.

The order becomes:
1. Merge.
2. Vercel builds, then migrates. Before it migrates, it takes a snapshot.
3. CI on `main` passes.
4. Vercel promotes.

If CI fails, the DB is ahead of the live code. Because each migration is expand-only, this is safe. A rollback moves the code and never the database. So never ship a contract migration in the same deploy as the code change.

**Previews:** P1, with `{"main": true, "**": false}`. Reasons:
- Hobby has 1 build slot. A running preview build delays a production build. "Prioritize Production Builds" (all plans) only moves production ahead of queued previews. Turn it on anyway.
- Each preview creates a Neon branch with Learner data, and its DB URL is a readable Vercel var. After 10 branches, each extra one costs $1.50/branch-month.
- Previews have no OpenAI key, so the Tutor fails there.
- Previews do not migrate their DB branch.
- CI already runs the full UI suite.

After this change, delete the 2 preview Neon branches by hand. The integration's automatic cleanup runs only when a new preview is created, and with P1 no new preview comes. If you want clickable previews later, use P2.

**Trade-off:** you lose preview links. Production goes live about 20 to 30 minutes after a merge. On Hobby, a person can still type `vercel --prod`. Only Pro's Deployment Policy closes this gap. Pro also gives rollback to any deployment and concurrent builds (billed per build CPU minute). **Terms:** Vercel says Hobby is for "non-commercial personal use only". It defines commercial use broadly, as any deployment used for "financial gain of anyone involved", so this is not only about charging Learners. If Value It is meant to become a business, even the free beta may count. Decide on Pro before the beta, or ask Vercel Support.

## Decision needed from the owner

1. **Production gate:** (a, recommended) Deployment Checks + migrate after `next build` + expand-then-contract rule + snapshot in `migrate-on-build`; (b) the same, but no snapshot code (use the 7-day restore); (c) deploy from CI.
2. **Previews:** (a, recommended) off now with `{"main": true, "**": false}`; (b) opt-in `preview-*` previews, set up properly; (c) all previews set up properly.
3. **CLI block and plan:** (a, recommended) Claude Code deny rules now, Deployment Policy when you move to Pro; (b) move to Pro now ($20/month) for the Deployment Policy, rollback to any deployment, concurrent builds, and a clear answer on Vercel's commercial-use rule.
4. **Confirm the GitHub plan** (Free or Pro) at github.com/settings/billing. It changes the Actions allowance ($12 or $18/month) and whether options E and F can use environment secrets limited to `main`.

## Verification changes (2026-11-14)

- GitHub: the account is probably on **Pro**, not Free (active ruleset on a private repo, and the branch-protection API answers 404). So: $18/month of Actions compute (about 3,000 minutes, about 19 merges). Environment secrets and deployment branch rules work in private repos. The E and F risks were updated.
- Vercel concurrency: "Prioritize Production Builds" is on all plans. Only a running preview build blocks production. Pro's concurrent builds are billed.
- Time to live: 20 to 30 min (observed 27 min), not about 20.
- Hobby terms: Vercel's commercial-use definition is broader than "charging".
- Snapshot cost: about $0.025/month, not $0.03.
- G2: the Deployment Sources list does not name MCP. Setting a policy needs the Owner role.
- CI minutes: 78 is billed minutes (73.8 raw).
- Added: preview DB URLs are readable Vercel vars. Neon's auto-cleanup does not run when previews are off. Every page is `force-dynamic`, which supports option B.
- Confirmed unchanged: Deployment Checks behaviour, Force Promote and Hobby availability; Deployment Policies Pro/Enterprise only; minimatch `*` and `**`; Hobby 1 concurrent build and Pro up to 500; Hobby rollback to the previous deployment only, env vars unchanged, auto-assign off; Neon 100 snapshots at $0.09/GB-month, 10 branches, $1.50/branch-month, 7 days at $0.20/GB-month; Neon preview branches; drizzle runs one transaction and has no down migrations; Pro is $20/month with 1 seat and $20 credit.
