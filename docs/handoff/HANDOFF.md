# Handoff: Value It Signal, Fedora → VPS (2026-11-15)

This branch (`handoff-vps`) is main plus this file and `tools/wayfinder/`. **Do not merge it.** Work continues on the lane branches in section 4.

The repo is **public**. Nothing here holds secrets. Vercel, Neon and Clerk ids are in `.handoff/HANDOFF.md` on branch `feat-33-clerk-cutover`.

This file replaces the Mac → Fedora handoff (branch `handoff-fedora`). Both earlier sessions now run as one: the lane session (map #2) and the Clerk session (#33). On 2026-11-15 the owner told the agent to orchestrate both.

## 0. First prompt on the VPS

Start Claude Code in the clone, on this branch, inside `tmux`. Paste:

```
ultracode /mattpocock-skills:wayfinder 2
Read docs/handoff/HANDOFF.md first (branch handoff-vps). You are the orchestrator for every lane, Clerk included.
Fan out with workflows and subagents as much as helps; keep the main context for decisions.
Start with section 4 "Next", in merge order: run tools/wayfinder/workflows/fix-hardening-36.js and
tools/wayfinder/workflows/lanes.js in parallel (args.repo = this clone). Then report, and ask me for
push / PR / merge yeses in one AskUserQuestion batch.
```

## 1. VPS setup (one time)

1. Packages: `git`, `tmux`, Node **24** (CI uses 24), `gh`, `jq`, `python3`, and the Postgres client (for the backup drill). Example for Debian/Ubuntu: `apt install git tmux jq python3 postgresql-client`, Node 24 from NodeSource or `nvm`.
2. Get the code:
   ```bash
   git clone git@github.com:SiddharthMuramkar/finance-agent.git && cd finance-agent
   git fetch --all && git switch handoff-vps
   npm ci            # if npm refuses the xlsx tarball: npm ci --allow-remote=root
   ```
3. **Git email (needed for push).** GitHub refuses pushes that show a private email (error GH007). In the clone:
   `git config user.name "Siddharth Muramkar"` and `git config user.email "334065514+SiddharthMuramkar@users.noreply.github.com"`.
4. CLIs, each logged in by the owner: `gh auth login`, `npm i -g vercel clerk neonctl`, then `vercel login`, `neon auth`, `clerk auth login`. On a headless VPS, pick the device-code or "paste the URL" login flow.
5. Claude Code: install it, then the plugins `mattpocock-skills` and `vercel`. Copy your private `~/.claude/CLAUDE.md` from the Fedora laptop (`scp`). It holds your global rules: concise replies, CLI first, no secrets, and conventional commits.
   - Project `.claude/settings.local.json`: allow `Bash(vercel *)`, `Bash(clerk *)`, `Bash(neon *)`, `Bash(gh *)`.
   - Deny the risky Vercel commands. `node .handoff/narrow-vercel-deny.mjs` on `feat-33-clerk-cutover` shows the list.
6. Playwright: `npx playwright install --with-deps chromium`.
7. `.env.local` is not in git. Unit tests need none (PGlite). If a lane needs dev env vars:
   - `vercel link`, then `vercel env pull .env.local` (scope and project are in `.handoff/HANDOFF.md`).
   - For Clerk dev keys: `clerk link`, then `clerk env pull --file .env.local`.
   - Production secrets are Sensitive and cannot be pulled.
   - It is a server, so run `chmod 600 .env.local`.
8. Keep work alive: run Claude Code inside `tmux`, so a dropped SSH session does not kill the agents.
9. RAM gate: `tools/wayfinder/heavy.sh` works on Linux.
   - Defaults: 2 slots, and a job starts only when ≥40% of RAM is free. Each job gets a 4 GB Node heap.
   - On a VPS with more than 16 GB, raise the slots with `HEAVY_SLOTS=3` or more.
   - Background alarm: `tools/wayfinder/ram-watch.sh 25 &`.
10. Worktrees: one per lane, next to the clone: `git worktree add ../finance-agent-wt-<name> <branch>`. The workflows do this for you.

## 2. Owner and how to work (memory does not travel; this is it)

- **Owner:** does not code. Wants to learn architecture, the Matt Pocock flow, ADRs and GitHub flow. Pronouns: they/them.
- **Priority (owner, 2026-11-15):** "developer phase". Make the Tutor's output and how the product works really good. Users, pricing and offer questions are out of scope for now.
- **Replies:** extremely concise. Teach new ideas in ASD-STE100 (about 80%).
- **Claude orchestrates:** the owner opted in to workflows and subagents ("ultracode"). Fan out freely. Keep the main context for decisions and reports.
- **Decisions:** the owner batch-decides with AskUserQuestion (max 4 questions, recommended option first).
  - Record a decision: `node tools/wayfinder/record.mjs <decisions.json>`. It posts the resolution comment, closes the ticket and adds a map line. Format: an array of `{num, date, decision, details, learned, gist}`.
  - Closing tickets and editing the map need the owner's yes, given in that turn.
- **New map tickets:** `node tools/wayfinder/grad.mjs <file.txt>`. Blocks look like `@@@ KEY | wayfinder:<type> | #n,KEY2`, then a title line, then the body. They become sub-issues of map #2, with native blocked-by links.
- **RAM rule:** every heavy command goes through `tools/wayfinder/heavy.sh <cmd>`.
  - Vitest: `--maxWorkers=2`, on touched files. Playwright: `--workers=1`.
  - The full suite and `next build` run only in a PR's integrate step, in folder chunks under 10 minutes.
- **Branch names use dashes.** A `/` in the name used to get a Vercel preview. The fix (`"**": false`) is in PR #36, which is not merged yet.
- **Ask first, every time:** push, open a PR, merge, close, or delete anything. Ask before changing Vercel, Neon, Clerk, DNS, env or the firewall. Agents commit locally; the orchestrator pushes after the yes.
- **Never:** push to main; print or commit secrets; read Neon rows (aggregate counts only, with approval); run `clerk deploy` or destructive Neon SQL without a snapshot and a yes.
- **Secrets the agent sets:** pipe them straight from one CLI into the other. Never echo them. Example: the Neon key was created with `neon api-keys create … -o json | jq -r .key` and piped into `vercel env add … --sensitive`.
- **CI** is normal and full (the repo is public, so minutes are free). Each PR gets one adversarial review comment before merge. Close issues only through a PR with `Closes #n`.

## 3. Destination and map

- **Goal:** invite-only Signal beta (about 20 Learners) by **end of Nov 2026**.
- **Spec:** `docs/specs/value-it-signal-spec.md`.
- **Map:** issue #2 holds the decisions so far and the fog. Closed tickets hold each decision's detail.
- **2026-11-15:** "What shape is the offer after early access?" (#29) was ruled **out of scope**. Early access stays free. Every Learner has a hard cap (#13: 120 turns and $5 per Learner per day, $30 per day in total). Later, free Learners get a lower cap than paid ones.
- **Frontier:**
  - #8 backup drill: owner task.
  - #19 legacy deletion: blocked by #8.
  - #37 reranker re-test: blocked by site #32. It fits the "output quality" priority, so do it right after the site lands.
  - The quality-related fog (RAG citation check, evals) should be the next tickets that graduate.

## 4. Lanes: where each one stopped (all pushed 2026-11-15)

The Fedora agents were stopped mid-work. `wip(handoff): pause for the move to the VPS` commits hold their unfinished files: hooks skipped, not type-checked. Review those first.

| Lane | Branch / PR | State at stop | Next |
|---|---|---|---|
| **Hardening #23** | `feat-hardening`, **PR #36** | CI green. Adversarial review posted: **Merge after 2 should-fix items**. The owner chose to fix both in this PR first. Fix not started. `NEON_API_KEY` and `NEON_PROJECT_ID` now set in Vercel Production. Vercel Pro confirmed. | Run `tools/wayfinder/workflows/fix-hardening-36.js` (fix test-first, verify through 2 lenses, then repair). Push, CI, then the owner's yes to merge. **Merge first.** |
| **Clerk prep #33** | `feat-33-clerk-prep`, **PR #35** | CI green, mergeable. | After #36 merges: rename `drizzle/0038_clerk_user_id` to **0039 and regenerate it** with `db:generate` (its snapshot lacks `turns.runs` from 0038). Rebase on main, CI, review comment, then the owner's yes to merge. |
| **Clerk cutover #33** (PR B) | `feat-33-clerk-cutover` (stacked on prep), no PR | +1 commit: `fix(auth)`, which reads the `first_name` claim. +1 WIP commit (24 files): sign-out, the fresh-session fetch (token refresh), and account, settings, study and admin pages. The core seam is still not type-checked. | Read `.handoff/HANDOFF.md` and `.handoff/plan.md` on that branch (Phase 3b). Then: tsc and the touched vitest files, finish the core, then slices pages+UI, admin, and removal + test bed. Then integrate, a 3-lens review (security, correctness, tests) and PR B. **Do not merge** until Phase 4: `clerk deploy`, DNS, live keys in Vercel, each with the owner's yes. Rebase last, on everything else. Delete `.handoff/` before merge. |
| **Docs #31** | `docs-4-fresh-adrs`, **PR #34** | +5 commits. Citations now point by rule. ADRs 0014 and 0017 agree with the Clerk plan. 0006 is widened. 0016 says what is not built yet. Review nits fixed. | Run the docs verify script and self-re-review each point of the PR #34 review. Push, post the re-review comment, merge after #35. |
| **Site #32** | `feat-7-signal-site`, no PR | +1 commit: the last Dark theme code and wording removed. +1 WIP commit: `e2e/support/app.ts`, probably the start of the About-flake fix. | Leftovers: the NY Fed notice in the Rates widget, and real widget props on the pages. Fix the About-test flake (`e2e/about.spec.ts:24`, D1) so it is deterministic. Don't add `/join` or `/pending` (Clerk owns sign-up). Integrate with full checks through the gate. Walk the spec §13 QA rows. Then PR "Closes #32" and review. |
| **Library sources #38** | `wip-src-{openstax,fomc,sec,investorgov}` | openstax: done. fomc: +1 commit (FOMC historical records, 1979–2001). sec: WIP, 1 line in `scripts/library/sources.py`. investorgov: not started. | Finish the slices per #38. Integrate on a new `feat-library-sources` from `feat-7-signal-site`. Eval only on a **Neon branch copy, never main**, and only after the owner's yes: load, restamp, embed, score vs the baseline (hits@5 92%, MRR 0.82). Then PR and review. |
| **Architecture doc** | `docs/architecture`, **PR #20** | CI green. | Merge in order. |

**Merge order:** #36 hardening → #35 clerk-prep (0039) → #34 docs → site → #20 → sources (retarget to main after site) → PR B cutover (after Phase 4).

## 5. How the lanes collide (read before rebasing)

- **Migration 0038:** both hardening (`0038_turn_runs`) and clerk-prep (`0038_clerk_user_id`) use 0038. Hardening wins. Prep becomes 0039, **regenerated**, not just renamed.
- **The cutover touches the same files as:**
  - hardening: `src/proxy.ts`, `src/app/api/turn/route.ts` (+ test), the admin page (+ test), `src/app/api/admin/routes.test.ts`, `src/db/schema.ts`, `drizzle/meta`
  - site: `next.config.ts`, `src/proxy.ts`, the login page (+ test), `src/auth/sign-in.test.ts`, `src/next-config.test.ts`, the admin page
  - docs: `src/db/schema.ts`, `src/auth/session.test.ts`, `src/auth/google-learner.ts`, the login and admin page tests

  So the cutover rebases **last**.
- Sources stack on site. Rebase sources after the site's final commits.
- Docs ADR 0017 already says "Clerk replaces Better Auth", so both earlier sessions agree.

## 6. Open owner actions

**Done 2026-11-15:**
- Vercel Pro (confirmed).
- `NEON_API_KEY` set as a project-scoped Neon key named `vercel-snapshot-gate`. Revoke it with `neon api-keys revoke <id>`.
- `NEON_PROJECT_ID` set in Production.
- Firewall published in **log** mode.

**Still to do:**
1. Backup drill (#8): `tools/wayfinder/backup-drill.sh`. It needs `NEON_PROJECT_ID` and `psql`/`pg_dump`. It was written for macOS, so expect small fixes.
2. **On or after 2026-11-17:** read the firewall logs, then enforce:
   - bot traffic → challenge
   - rate limits → 429

   Only the owner can publish: `vercel firewall publish … --confirm-name finance-agent --effects-digest <digest>`. Rule bodies are in `.handoff/platform/` on `feat-33-clerk-cutover`.
3. A Better Stack account and `BETTERSTACK_HEARTBEAT_URL`. Until then, the health cron runs but nobody gets an alert.
4. Send the OpenStax reuse request and the Damodaran email. The draft is on branch `research-library-licences`.
5. A lawyer check on CC BY before any paid launch.
6. Say yes to deleting:
   - Neon branch `rag-baseline-2026-11-14`
   - the preview Neon branches `preview/docs/architecture`, `preview/feat/21-signal-models` and `preview/chore/tracker-setup`, and their 6 stale preview `DATABASE_URL*` env vars
7. After PR B is live: remove `PASSCODE`, `PASSCODES` and `SESSION_SECRET` from Production. Decide about the Preview copy of `ANTHROPIC_API_KEY`.
8. Check the OpenAI hard spend limit, and check that the old key is revoked.
9. Clerk Phase 4: a Google OAuth client for Clerk prod. The agent gives you the redirect URI from `clerk deploy`.

## 7. Gotchas

- **GH007:** with the wrong `user.email`, every push is refused (section 1 step 3). If commits are already made with the wrong email and not pushed, re-author them: `git rebase origin/<branch> --exec 'git commit --amend --no-edit --reset-author --no-verify'`.
- `next dev` writes an untracked `AGENTS.md`. It was never committed. Decide once whether to commit it.
- The Library scorer reads `DATABASE_URL_UNPOOLED` before `DATABASE_URL`. A later `--env-file`, or the shell, overrides `.env`.
- The Neon foreign keys from passages are `ON DELETE no action`, so drop a source with `drop-source.mjs` (dry-run by default).
- Flaky e2e: re-run only the failed jobs.
- Vercel MCP returns 403 on firewall writes, so use the `vercel firewall` CLI. Destructive Vercel CLI commands need `--confirm-name`; `--yes` is refused for agents.
- Workflow scripts cannot read files or the clock. Pass paths in `args`.

## 8. Ready-made workflows (`tools/wayfinder/workflows/`)

- `fix-hardening-36.js`: the 2 should-fix items on PR #36. Flow: fix test-first → 2 verifiers (cap bypass; snapshot gate + regressions) → repair if a gap is found. Run: `Workflow({scriptPath: "tools/wayfinder/workflows/fix-hardening-36.js", args: {repo: "<abs clone path>"}})`. The review is in [this PR #36 comment](https://github.com/SiddharthMuramkar/finance-agent/pull/36#issuecomment-6890802712).
- `lanes.js`: one agent per lane, each in its own worktree, commit only. The lane keys are `docs-34`, `site-32`, `sources-38` and `clerk-cutover`. Run a subset with `args: {repo: "<abs clone path>", lanes: ["site-32"]}`. The agents read section 4 of this file, so keep it current.
- After each run: read the results, push with the owner's yes, then start the next phase (integrate, review, PR) as its own workflow.

## 9. Suggested skills

- `mattpocock-skills:wayfinder` (args `2`): resume the map, pick the frontier.
- `workflow-authoring`: read it before writing or changing a workflow.
- `mattpocock-skills:tdd`: fixes and the Clerk core seam.
- `mattpocock-skills:code-review`: the adversarial review on each PR.
- `mattpocock-skills:pr`: PR bodies.
- `mattpocock-skills:grilling` + `mattpocock-skills:domain-modeling`: decision rounds, ADR and glossary edits.
- `mattpocock-skills:wizard`: steps only the owner can do (Phase 4, firewall publish).
- `mattpocock-skills:research`: research tickets.
- `vercel:vercel-firewall`, `vercel:vercel-cli`, `vercel:env-vars`, `vercel:auth`: the Clerk and platform work.
