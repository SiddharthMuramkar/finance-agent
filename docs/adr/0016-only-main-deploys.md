# Only main deploys to production, behind checks, a snapshot and expand-then-contract migrations

Status: accepted, 2026-11-14. Tickets: [#9](https://github.com/SiddharthMuramkar/finance-agent/issues/9) (Vercel Hobby or Pro for the beta?, Pro now) and [#11](https://github.com/SiddharthMuramkar/finance-agent/issues/11) (Gate production deploys, migrations and previews). Amended on 2026-11-15 by [#33](https://github.com/SiddharthMuramkar/finance-agent/issues/33): the agent now runs Vercel setup, and production stays Git-only. Built on `main` by [#23](https://github.com/SiddharthMuramkar/finance-agent/issues/23) (PR #36): `vercel.json` has `"**": false`, so no branch builds a preview, and `scripts/migrate-on-build.mjs` takes a Neon snapshot before it applies a pending migration (see `docs/agents/migrations.md`). Not built yet: it still migrates before `next build`, not after. Vercel has no setting that refuses a production deploy that is not from Git (found 2026-11-15), so Claude Code deny rules are the only guard, and they are set per machine. Not in place yet: on 2026-11-15 the full list exists only as an owner-run script for one machine's `~/.claude` (#33). The VPS where agents now run has no Vercel deny rule of its own. The repo rules in `.claude/settings.json` (PR #36) block `--prod`, `--target production`, `promote` and `rollback`, but not `redeploy` or `remove`.

## Context

A merge to `main` makes Vercel migrate the database, build and deploy. Before this decision, any branch with a `/` in its name built a preview. A preview is a full copy of the site: without its own keys and data it only costs money and can leak data. A migration that runs before the new code is live can break the old code that still serves Learners. Agents work in this repo, and an agent with the Vercel CLI could deploy to production by hand. Vercel's Hobby plan is for non-commercial use only, and a product that will be sold must run on Pro.

## Decision

- Previews are off (`{"main": true, "**": false}`), so only `main` builds. The stale preview Neon branches are deleted (the owner confirms).
- The Vercel team is on Pro. Production takes Git deploys only: a merge to `main`.
- No one deploys to production by hand. At first, Claude Code deny rules blocked the Vercel CLI for agents. Since #33, the agent runs Vercel setup with the Vercel CLI, logged in by the owner, and deny rules block only the risky commands (deploy, redeploy, promote, rollback and remove). Deny rules hold only on a machine that has them, so every machine an agent runs on needs the list. No Vercel token goes in GitHub.
- A production deploy passes Deployment Checks, takes a Neon snapshot and runs migrations after `next build`.
- Every migration is expand-then-contract: first add what the new code needs, deploy, and only later remove what the old code used.

## Consequences

- No preview URL to try a branch on. Changes are checked locally and in CI before the merge.
- Production goes live about 20 to 30 minutes after a merge.
- A failed build never migrates the database, and a snapshot makes a bad migration easy to undo.
- Each schema change that removes something takes two deploys.
- Pro costs $20 a month plus tax, with $20 of usage credit.

## Alternatives considered

- **No snapshot code, rely on Neon's 7-day point-in-time restore:** less code, but a slower and less exact way back.
- **Deploy from CI:** full control of the order, but more pipeline to own and secrets in CI.
- **Opt-in or full previews, set up properly:** a URL per branch, but each preview needs its own model key, sign-in, migrations and Neon clean-up.
- **Stay on Hobby:** $0, but against the terms for a product that will be sold, with no alerts or log drains.
