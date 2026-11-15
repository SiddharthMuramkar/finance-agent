# Handoff: Value It Signal, Mac → Fedora (2026-11-15, 06:25 UTC)

This branch (`handoff-fedora`) is main plus this file and `tools/wayfinder/`. Do not merge it. Work continues on the lane branches below.

The repo is **public**, so nothing here holds secrets or private IDs.

## 1. Start on Fedora

1. Get the code and tools:
   ```bash
   git clone git@github.com:SiddharthMuramkar/finance-agent.git
   cd finance-agent
   git fetch --all
   git switch handoff-fedora
   ```
2. Install. npm 12 refuses the `xlsx` tarball unless you allow it: `npm ci --allow-remote=root`.
3. `.env` is not in git. Unit tests need none (PGlite). For anything else, run `vercel login`, `vercel link` (team ACME, project finance-agent), then `vercel env pull .env.local`. Production secrets are Sensitive and cannot be pulled; they stay in Vercel.
4. Keep the laptop awake while agents run: `systemd-inhibit --what=sleep:idle --why=agents sleep 43200 &`.
5. Heavy jobs go through the RAM gate. Background RAM alarm: `tools/wayfinder/ram-watch.sh 25 &`.
6. Work each lane in its own worktree, next to the repo: `git worktree add ../finance-agent-wt-<name> <branch>`.
7. In Claude Code, start with `/mattpocock-skills:wayfinder 2`, then read this file.

## 2. Owner and how to work (memory does not travel; this is it)

- **Owner:** does not code. Wants to learn architecture, the Matt Pocock flow, ADRs and GitHub flow. Pronouns: they/them.
- **Replies:** extremely concise. Teach new ideas in ASD-STE100 (about 80%).
- **Claude orchestrates:** fan work out to workflows and subagents; keep the main context for decisions.
- **Decisions:** the owner batch-decides with AskUserQuestion (max 4 questions, recommended option first). Record them with:
  ```bash
  node tools/wayfinder/record.mjs <decisions.json>
  ```
  That posts the resolution comment, closes the ticket and adds a map line. Format: an array of `{num, date, decision, details, learned, gist}`.
- **New map tickets:**
  ```bash
  node tools/wayfinder/grad.mjs <file.txt>
  ```
  Blocks look like `@@@ KEY | wayfinder:<type> | #n,KEY2` then a title line, then the body. They become sub-issues of map #2, with native blocked-by links.
- **RAM rule:** parallel agents are fine. Every heavy command goes through `tools/wayfinder/heavy.sh <cmd>`: 2 slots, starts only at ≥40% free RAM, 4 GB Node heap cap.
  - Vitest `--maxWorkers=2` on touched files; Playwright `--workers=1`.
  - The full suite and `next build` run only in a PR's integrate step, in folder chunks under 10 minutes.
- **Branch names use dashes.** A branch with `/` gets a Vercel preview until the gates code (in the hardening PR) merges.
- **Never:** push to main; print or commit secrets; read Neon rows (aggregate counts only, with approval); change Vercel, Neon, DNS, env or firewall without asking.
- **CI is normal and full** (the repo is public, so minutes are free). Each PR gets one adversarial review comment before merge.
- **#33 Clerk** (sign-in moves to Clerk; PR #35 `feat-33-clerk-prep`, later `feat-33-clerk-cutover`) is run by the owner's **other** session. Don't touch it unless the owner says so.

## 3. Destination and map

- **Goal:** invite-only Signal beta (about 20 Learners) by **end of Nov 2026**.
- **Spec:** `docs/specs/value-it-signal-spec.md`.
- **Map:** issue #2 holds decisions so far and the fog. Closed tickets hold each decision's detail.

## 4. Lanes: where each one stopped

All branches are pushed. `wip(handoff)` commits hold uncommitted agent work from stop time, so review them first.

| Lane | Branch / PR | State at stop | Next |
|---|---|---|---|
| Hardening #23 (caps, gates, alerts; signin and botid moved to #33) | `feat-hardening`, **PR #36** | Integrated and pushed; CI ran. No review comment yet. | Check CI. Post the adversarial review (caps bypass via resumes or `compose_widget`, day boundary, snapshot gate failing open, heartbeat when the DB is down, previews for some branch name). Owner needs Vercel Pro before merge. |
| Site #32 (Light-only theme, all spec pages, 5 widgets, levers on the engine, Library credits, as-of fix) | `feat-7-signal-site`, no PR yet | All 4 slices merged (`wip-site-{theme,library,widgets,pages}`); leftovers being cleaned (+1 WIP commit). | Finish leftovers: NY Fed notice in the Rates widget, no Dark/readTheme left, pages use real widget props. Carry the #20 About-test flake fix. Don't add `/join` or `/pending` (Clerk owns sign-up). Full checks through the gate. Check spec §13 QA rows. PR "Closes #32", then review. |
| Docs #31 (fresh ADRs 0001–0018 + GLOSSARY) | `docs-4-fresh-adrs`, **PR #34** | Review said **Fix first**: citations remapped by number, not rule; ADR 0014 supersede note incomplete. Fix half done: ADR 0018 (flat controls) and widened 0010 committed, citation remap in the WIP commit. | Finish the remap by rule. 0014 Status: superseded by 0017 for sign-in, /admin approval, access states, reasons table, "You're in" email; /pending and /login dropped. Run the verify script, push, re-review. |
| Library sources #38 (OpenStax CC BY 1e swap, FOMC, SEC Amazon/Webvan/WeWork S-1, Investor.gov) | `wip-src-{openstax,fomc,sec,investorgov}` (based on `wip-site-library`) | openstax done (1e id, re-pointed scorer, `drop-source.mjs`). fomc and sec partly done (WIP only). investorgov not started. | Finish the slices per issue #38. Integrate on `feat-library-sources`, stacked on `feat-7-signal-site`. Eval on a **Neon branch copy, never main**: load, restamp, embed, score vs baseline hits@5 92% / MRR 0.82. PR, then review. Production load only after the owner says yes. |
| Architecture doc | `docs/architecture`, **PR #20** | One ui shard kept failing (About test D1, `e2e/about.spec.ts:24`); re-run started. | Merge when green, or after the site PR fixes the flake. |

**Merge order:** #36 hardening → #34 docs → site → #20 → sources (retarget to main after site merges).

**Other branches** (pushed, kept for reference, never merged):
- `research-*`, `prototype-reranker`;
- `wip2-hard-botid` and `wip2-hard-signin` (superseded by #33);
- `wip2-hard-caps`, `wip2-hard-alerts`, `wip-docs-{1,2,3}`, `wip-site-*` (already merged into their lane branch).

## 5. Open tickets and owner actions

- **Tickets:**
  - #8 backup posture: owner runs `tools/wayfinder/backup-drill.sh`. It needs `NEON_PROJECT_ID` set and `psql`/`pg_dump` (`sudo dnf install postgresql`); written for macOS, so expect small fixes.
  - #19 legacy deletion: blocked by #8.
  - #29 offer shape: unblocked, next decision.
  - #37 reranker re-test: blocked by site #32.
- **Owner actions:**
  1. Vercel Pro before the hardening merge (15-min cron).
  2. Run the backup drill.
  3. Better Stack account + `BETTERSTACK_HEARTBEAT_URL`.
  4. Add `NEON_API_KEY` and `NEON_PROJECT_ID` (Sensitive) for the snapshot gate.
  5. Send the OpenStax reuse request and the Damodaran email (draft on `research-library-licences`).
  6. Lawyer check on CC BY before a paid launch.
  7. Say when to delete Neon branch `rag-baseline-2026-11-14`.
  8. Check the OpenAI hard spend limit and that the old key is revoked.

## 6. Gotchas

- `next dev` writes an untracked `AGENTS.md`. It was never committed; decide once whether to commit it.
- The `wip-site-*` and `wip-src-*` worktrees were Claude workflow worktrees on the Mac. On Fedora, recreate worktrees from the pushed branches.
- The Library scorer reads `DATABASE_URL_UNPOOLED` before `DATABASE_URL`. A later `--env-file`, or the shell, overrides `.env`.
- The Neon foreign keys from passages are `ON DELETE no action`, so drop a source with `drop-source.mjs` (dry-run by default).
- Flaky e2e: re-run only the failed jobs.

## 7. Suggested skills

- `mattpocock-skills:wayfinder` (args `2`): resume the map, pick the frontier.
- `workflow-authoring`: before writing each lane's workflow (pipeline slices, worktree isolation, RAM gate in every prompt).
- `mattpocock-skills:pr`: PR bodies.
- `mattpocock-skills:code-review`: the adversarial review per PR.
- `mattpocock-skills:grilling` + `mattpocock-skills:domain-modeling`: decision rounds; ADR and glossary edits.
- `mattpocock-skills:wizard`: owner-only steps.
- `mattpocock-skills:research`: research tickets.
