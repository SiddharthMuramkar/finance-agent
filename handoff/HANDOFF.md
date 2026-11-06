# Handoff: story-first build, paused 6 Nov 2026 ~09:00 IST

The build was paused on the owner's order, because the second account was about to hit its usage limit.
**GitHub is the source of truth**: a closed spec issue (#324–#368) means its ticket is merged. This branch is `origin/main` at pause time plus this `handoff/` folder.
The folder holds the run state, the scripts, the plans and the resume steps. No code changes are in it.

## State at pause
- **Merged, 18 of 40:** T-00 T-01 A1 A3a A3b A4 B1 B3a C1a D1a D1b D1c D2a D2b D3a E1 E2a E2b.
- **Merge style:** every PR landed as a real merge commit with two parents, never squash or rebase.
  Check with `git log origin/main --first-parent --format='%h %P %s'`.
- **Main CI:** was running on the #391 merge at pause. Previous red was a one-test flake (`no-typing.spec` rate-move, mbp14 only), and its failed job was re-run.
- **Workflows:** stopped (P2d run `wf_a507a13d-f83`). The watchdog cron is deleted.
- **Open ticket work, all pushed to `story/<ID>`:**

| Ticket | Issue | PR | Where it stopped |
|---|---|---|---|
| D2c | #346 | #388 (ready) | Passed math-police and historian; was landing (ui re-run). Persona follow-up #414 |
| B2a | #336 | #413 | Critics done; fix round 1 pushed 592a499 (Notebook columns, Older session cards) |
| A2 | #333 | none yet | Implementer and fix round pushed (2307926) |
| D3b | #354 | none yet | 4 commits + WIP commit pushed (new branch). Paid tutor-eval run 1 results in `run/evals/d3b-run1/` |
| D2d | #347 | #385 (draft) | Fix round in progress; WIP commit pushed |
| D2e–D2j | #348–#353 | #392 #397 #399 #401 #402 #398 | Older fix-round-2 trees; need a fresh critic round under the new gate |
| A5 B2b B3b C1b E3 E4a E4b E5 E6a–c | | | Not started (dependencies) |
| F1 F2 | #365 #366 | | Story-proof phase (P4), after the build |
| C2 C3 H1 | #367 #357 #368 | | Owner-only, not part of the run |

- **needs-triage open:** #313 #315 #317 #318 #383 #386 #389 #390 #394 #396 #400 #409 #411 #414 #416 #417.
  Triage sweep pass 1 already closed or fixed 9. These wait for pass 2, after the build (plan P4.5).

## Decisions made on the owner's order ("do whats best")
- **beginner-persona is advisory for content batches (D2*, E6*).**
  - The gate is math-police plus historian.
  - Persona gets one fix round. Whatever it still flags goes to a needs-triage follow-up issue.
  - Reason: its verdict flipped between runs on the same text, and persona-only fix rounds made D2a and D2b worse.
  - The code is in `run/story-build-p2d.js` (`hardFails`, `followUp`, `LAND_ONLY`).
- **Triage sweep:** fix what touches no locked file and merge it; defer the rest to pass 2.

## Resume (from either account)
1. **The run folder.** It lives at `~/Downloads/finance-agent-story-run/`, and the scripts use that absolute path.
   - If it's missing, copy `handoff/run/` back there.
   - Also recreate the 3 secret files (`anthropic.env`, `prod-db-host.txt`, `spec-worktree.env.bak`), which are deliberately not in git.
2. **Session directory.** Start the session in `~/Desktop/finance-agent`, the git checkout. Never run a bare `cd` into a non-git folder while a workflow runs: new worktree agents then fail with "not in a git repository".
3. **Edit the launch state** at the top of `story-build-p2d.js`.
   - MERGED = the closed issues.
   - SCOPE = everything else except C2, C3, H1, F1 and F2.
   - LAND_ONLY = {} unless a content PR already passed math-police and historian on its current head (D2c #388 if it hasn't merged).
   - Implementers continue from `origin/story/<ID>`.
4. **Launch** with `Workflow({scriptPath: '<run>/story-build-p2d.js'})`.
   - Write the new journal path to `run/journal-path.txt`.
   - Recreate the watchdog cron (`7,22,37,52 * * * *`; the tick prompt is in the original plan's Watchdog section). Crons are session-only.
5. **After the build:**
   - P3 G2 (needs E4a, E4b and E6a; a Neon test branch, never production).
   - P4 story-proof (F1, F2).
   - P4.5 triage sweep pass 2 (`scripts/triage-sweep.js`, empty `lockedPaths`).
   - P5 handback (see `plans/original-plan.md` and `plans/takeover-plan.md`).
6. **Permissions.** The 3 allow rules `Bash(gh pr merge|ready|comment *)` in `~/.claude/settings.json` let landers merge. Keep them until P5, then remove them.

## Safety rules (unchanged)
- No production DB, migrations, invites or `vercel` commands.
- No npm or tests in `~/Desktop/finance-agent` or the spec worktree (production `.env`).
- No force push, `reset --hard` or push to main.
- Paid spend ≤ $55 (ledger at $0 so far, plus the D3b eval run).

## Files
- `run/RUN-STATE.md`: full tick-by-tick log, the most detailed record.
- `run/story-build-p2d.js`, `run/lane-brief.md`, `run/land.sh`, `run/status.sh`, `run/issues.tsv`, `run/critics-prompts/`, `run/tmp/gen-persona-input.mjs`: the build machinery.
- `scripts/triage-sweep.js`: the needs-triage sweep workflow.
- `plans/`: the approved plan and the takeover plan.
- Not pushed (stale and superseded): local worktrees from the 01:00–02:10 runs under `~/Desktop/finance-agent/.claude/worktrees/` (wf_3d08d3d4-208-914, wf_3ee72a9e-e57-80/81, wf_6696a07d-fd3-266..272). Their tickets either merged since or carry newer pushed work.
