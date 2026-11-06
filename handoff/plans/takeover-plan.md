# Take over the story-first build on this account (lean relaunch)

## Context
Session `build-story-first-spec` (`75188d81…`, worktree `~/Desktop/finance-agent-wt-spec`) was running the approved plan `~/.claude/plans/i-want-to-execute-structured-puzzle.md` unattended. The main account hit its weekly limit at about 02:30 IST on 6 Nov (it resets 9 Nov, 12:30). Workflow P2c (`wf_3ee72a9e-e57`) then failed 58 agents in a cascade at 02:39, including Opus retries, 3 set-aside agents and G1 measure. None of them reached GitHub. The watchdog cron belonged to that session, so it is gone too.

**State now (checked):**
- 13 of 40 tickets merged; `main` is green (last run is #404 E2a).
- 27 left in SCOPE: A2 A5 B1 B2a B2b B3b C1b D2a–j D3a D3b E2b E3 E4a E4b E5 E6a–c.
- No spec ticket wrongly carries `needs-triage`. Ledger is $0 of $55.
- 10 D2 PRs are open (#385–#402). #401 D2h and #402 D2i are ready and green, but their critic verdicts came from the stale-tree bug, so they need fresh critics.
- Unpushed work in the P2c worktrees (`~/Desktop/finance-agent/.claude/worktrees/`):
  - `wf_3ee72a9e-e57-2`: D3a, 5 commits, on the critical path;
  - `-1`: B1, 2 commits plus 2 modified test files;
  - `-3`: E2b, 2 commits.
  - D2b's last fix is already on origin. D2a and D2c have half-done fix trees with nothing committed; I drop them.
- The latest script is `…/75188d81…/workflows/scripts/story-build-wf_bff0b4d4-dcf.js`. It reads its state from GitHub, so a relaunch resumes the work. The brief's line 51 makes implementers continue from `origin/story/<ID>`.
- The run used about 1,400 agents for 13 merges, against the plan's estimate of about 330 for everything. Refuters were most of that.

**Your choice: a lean relaunch.**

Rejected: `resumeFromRunId`. It works only within the same session, and every agent in that run had already failed.

## Steps

1. **Housekeeping**
   - Start `caffeinate -ims -t 172800` in the background. The original caffeinate is gone; status.sh only sees another project's caffeinate.
   - Append a takeover line to `RUN-STATE.md`: "second account, lean settings, the limit cascade had no GitHub effects".

2. **Salvage the unpushed work** so the relaunched implementers continue from it:
   - B1: commit the 2 modified tests as `B1: WIP (salvaged after session stop)`, then `git push origin HEAD:story/B1`.
   - D3a: `git push origin HEAD:story/D3a`.
   - E2b: `git push origin HEAD:story/E2b`.
   - Use fast-forward pushes only, and check the branches don't exist on origin first. No PRs: D3a and E2b are paid-CI tickets, and opening a PR is the lane's job.

3. **Patch a copy** of the script to `~/Downloads/finance-agent-story-run/story-build-p2d.js`, leaving the old session's folder untouched:
   - **Launch state:** SCOPE and MERGED as above. Re-check them against closed issues just before launch. `CONTENT_MAX = 2`.
   - **Lean refuting, in `verify()`:**
     - 3 votes only for a `security` finding above low severity, or any `critical` finding;
     - 1 vote for everything else, math-police and historian included;
     - refute at most 5 findings per critic, in both `criticRound` and G1 (it was 8).
   - **Usage-limit breaker:**
     - wrap `agent()` in `ag()`, which counts null results in a row; a non-null result resets the count;
     - at 4 or more, set `stopReason = 'usage limit suspected'`, and set `limitHit = true`.
     - When `stopReason` is set: skip the Opus retry, `giveUp()` and G1.
     - In `finish()`, a lane that ends while `limitHit` is true goes to a `paused` list instead of `dropped`.
     - The return lists `paused` with the label "relaunch me".
   - **Verify:**
     - `node --check`;
     - a stub dry run (fake `agent`, `parallel` and `log`) showing that all 27 merge on the happy path;
     - and that a burst of nulls trips the breaker with no `giveUp` calls and every ticket paused, none dropped.

4. **Launch the Workflow** with `scriptPath` set to the patched file.
   - Write the task id, run id and new journal path to `RUN-STATE.md` and `journal-path.txt` (status.sh reads it).

5. **Watchdog:** `CronCreate` on `7,22,37,52 * * * *`, with the same tick prompt as before. It adds one rule: if the breaker tripped, stop. That means record it, write a short FINAL-REPORT.md "paused" section, and send one push notification. The relaunch then happens from the main account after 9 Nov 12:30.

6. **Continue the original plan unchanged after that,** with the lean settings and the breaker in every later script:
   - the P2 checkpoint;
   - P3 G2 once E4a, E4b and E6a merge: a Neon test branch, with the host checked against `prod-db-host.txt`, and ≤ $55;
   - P4 `story-proof` (F1, F2);
   - P5 handback: FINAL-REPORT.md and one notification.
   - **Cleanup:**
     - restore `.env` from `spec-worktree.env.bak`;
     - remove this run's 80+ lane worktrees and local branches;
     - `CronDelete`, then stop caffeinate.
   - The owner decisions still apply: deploys stay paused until H1, and the stop conditions are unchanged.

## Critical files
- `~/Downloads/finance-agent-story-run/`:
  - `RUN-STATE.md`, `status.sh`, `land.sh` and `lane-brief.md`, which are read and reused;
  - `story-build-p2d.js`, which is new.
- `~/.claude/plans/i-want-to-execute-structured-puzzle.md`: the phases, the Watchdog and the stop rules, followed as written.

## Verification
- The dry run passes both paths before launch.
- The first tick after launch has `started` events in the new journal, and B1, D3a and E2b resume from their pushed branches rather than starting over.
- `bash status.sh` on every tick.
- The end state is the original plan's Verification section: every ticket except C2, C3 and H1 closed by a merged PR, `main` green on check, build and ui, the §6.2 metrics, G2 and G3.

## Addendum (6 Nov ~08:00): owner order, clear every needs-triage issue
- The owner wants no needs-triage issues left at the end. Take the best option on any "decision for the owner" issue, open a PR and merge it.
- **Pass 1** runs now, beside the build: the triage-sweep workflow (script path in RUN-STATE). It fixes only what touches no file locked by pending tickets or open `story/*` PRs, and comments on the rest.
- **P4.5, pass 2:** after `story-proof`, re-run the triage-sweep script over every open needs-triage issue, including those the build, G1 and F1 created. Use an empty `lockedPaths`, since everything is merged by then. Repeat until none are open (at most 3 rounds), then P5.
