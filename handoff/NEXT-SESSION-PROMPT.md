# Prompt: resume the story-first build (orchestrator, multi-lane, streamlined v2)

You are the ORCHESTRATOR of an unattended build on SiddharthMuramkar/finance-agent.
Owner away, nobody answers questions. You do NOT write ticket code: you plan, spawn
subagents, gate, merge (you run gh merge commands yourself), and log. Start 10:50-style
stop discipline: stop NEW lanes at start+2.5h, then handback.

## State at handoff (verified 2026-11-06 12:36 IST — re-verify live, GitHub wins)
- Merged 22/40: T-00 T-01 A1 A2 A3a A3b A4 B1 B2a B3a C1a D1a D1b D1c D2a D2b D2c D3a
  E1 E2a E2b E3. Main tip 8008ba6 (E3 merge #418). Latest main CI: SUCCESS (#418 run).
  (#413's main run failed 1 ui test — notebook.spec w1024 — then #418 run green: flake-suspect.)
- Open spec issues in scope (18): C1b #337, A5 #342, B2b #343, D2d #347, D2e-j #348-353,
  D3b #354, E5 #356, B3b #358, E4b #360, E4a #361, E6a-c #362-364.
  Excluded: C2 #367, C3 #357, H1 #368 (owner-only), F1 #365, F2 #366 (later phase). P3 G2: skip, log.
- Paid ledger: $1.96 / $55 (~/Downloads/finance-agent-story-run/ledger.txt). Secrets present.
- Run folder: ~/Downloads/finance-agent-story-run (lane-brief.md GOVERNS every subagent;
  critics/<ID>/ inputs; RUN-STATE.md full log — READ the "Muse run" section + Log first).

## In-flight work (exact stop points — do in this priority order)
1. C1b, PR #419, head 5874ff4 (pushed, MERGEABLE at stop, AUTO-MERGE DISABLED by prior
   orchestrator — do not re-enable until verified): critics PASSED on pre-merge head f4a4e76
   (security pass 3 lows; affordance pass). Repair merged origin/main (B2a) → 5874ff4 but was
   CANCELLED before reporting. FIRST JOB: diff f4a4e76..5874ff4 conflict files; if src/proxy.ts,
   src/auth/**, src/app/api/auth/**, src/app/api/logout/** or login UI changed semantically →
   re-run security critic; then one repair/verify subagent runs FULL brief gates locally;
   then land (CI check/build/ui green → gh pr merge 419 --merge). Security lows on record
   (don't block, note in handback): trustedProviders implicit linking (better-auth.ts:58),
   localhost in TRUSTED_ORIGINS (:19), fa_access HMAC no expiry (passcode.ts:80, pre-existing).
2. E5, PR #420, head 95cb2f1: critics done — space FAIL (high: no measureLayout JSON, only
   1512 shots; medium: RateMove end-labels clipped '.75%'/'%' at card edges, rate-move.tsx
   viewBox anchors; medium: StoryScene evidence is isolated dev card, not stage beside chat),
   colour-liveliness PASS 4.0/5 (2 medium scoring notes q1/q3 — refuters NEVER ran),
   affordance PASS lows. Next: 1 refuter-batch (all non-low findings), then fixer, re-critics
   (space + colour only), land.
3. A5, branch story/A5 pushed, head 4c5dee9 (last commit WIP e2e/a5-screens.spec.ts),
   NO PR. 8 substantive commits (slim header, account menu, Settings 5 cards, e2e, docs),
   implementer CANCELLED mid-run → gates UNVERIFIED. Resume: merge origin/main, full gates,
   critic inputs, PR "Closes #342", critics per spec ticket text (read it).
   Note: A5 owns header rename Notes/Past Sessions → Notebook (ui.tsx HEADER_LINKS).
4. D3b, branch story/D3b pushed 74b3a71, no PR. Offline gates were green. Paid eval run2:
   8/16 (results ~/Downloads/finance-agent-story-run/evals/d3b-run2/). All fails need
   src/tutor/instructions.ts (NOW FREE — E3 merged): T12 brevity/place, T15 replace 'Fair.'
   ack, T16 overrun/terms, T13 sums never imperative verbs, T1/T5 gloss 'bond trader' in asks,
   T11 length, T4 don't switch running-example numbers. Eval run3 PRE-GRANTED (cap $55,
   lane cap $15 more, record in ledger.txt). Then critics per spec, PR "Closes #354".
   D3b unblocks E4a + E4b — critical path, start early.
5. B2b, branch story/B2b pushed 978bc68, no PR, needs_hot_file. DONE except strings in:
   src/tutor/tools.ts:110,666 (free now), src/app/widget-panel.tsx:227,243 + globals.css:701
   comments (free after E5 #420 merges), src/app/ui.tsx:107 + settings 'Notes' copy (free
   after A5 merges). Exact steps: critics/B2b/RESUME.md. Park until E5+A5 merged.
6. Not started: B3b (needs A5), E4a (needs D3b), E4b (needs D3b), E6a-c (deps met;
   worktree ~/Desktop/finance-agent-wt-E6a exists at main, zero commits), D2d-j (branches
   + PRs #385 draft, #392/#397/#398/#399 draft, #401, #402 — old fix-round trees; each
   needs: merge main → assess → regen critic inputs → fresh critics under content gate).
7. Worktrees alive: finance-agent-wt-{A5,C1b,D3b,E5,B2b,E6a} on story/<ID>, all pushed,
   clean. Ports used before: A5 3202, B2b 3201, C1b 3201, D3b 3204, E5 3204/3214 —
   reassign unique ports 3201-3204 per running lane yourself. 4 stale .claude worktrees
   were already removed; other stale wf_* worktrees: ignore, never reuse (check branch
   not checked out before `worktree add`; remove only if clean + HEAD pushed).

## Step 0 (orchestrator, ≤10 min, no subagents)
1. From ~/Desktop/finance-agent-wt-handoff: `git fetch origin`. Verify live: issue states
   #324-368, open PRs, main CI (red non-flake → main-fix lane FIRST, branch fix/main-<short>).
2. Push pending handback: copy ~/Downloads/finance-agent-story-run/RUN-STATE.md over
   handoff/run/RUN-STATE.md, update handoff/HANDOFF.md state section to match this prompt,
   commit (trailer below) + push to `handoff` branch. Then append new run section to
   ~/Downloads/.../RUN-STATE.md and log every landing there (no cron, no separate watchdog).
3. PREFLIGHT OVERLAP MATRIX (new — prevents last run's biggest waste): extract every
   candidate ticket's Change list from docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md
   on origin/main; build file→tickets map. Only run lanes whose Change lists are disjoint
   (shared append-only exempt: docs/architecture.md, GLOSSARY.md, docs/adr/*,
   src/app/api/dev-e2e/route.ts, src/dev/e2e-tutor.ts). Write matrix into RUN-STATE.
4. Pre-warm: create all needed worktrees + `npm ci --allow-remote=all --no-audit --no-fund`
   in each, in ONE background batch, while you read lane-brief.md + critics-prompts/README.

## Lane pipeline (streamlined — target ≤6 subagents per ticket)
Max 4 heavy lanes at once (24GB RAM). Each lane: own worktree (already pre-warmed),
unique E2E_PORT 3201-3204, branch story/<ID> continuing if it exists.
1. IMPLEMENTER (1 subagent): prompt = "read $RUN/lane-brief.md in full, it governs" +
   ticket/issue/worktree/port + HELD file list (from YOUR matrix, exact paths) + the
   ticket's **Critic check** text verbatim + evidence checklist copied from each named
   critic prompt's inputs (this prevents evidence-gap fix rounds). Must: merge origin/main
   FIRST and AGAIN right before final push; open/update PR EARLY (first push, draft ok) so
   CI overlaps critics; full brief gates ONCE at final head; regenerate critic inputs from
   FINAL head; return compact JSON {status,pr,head,notes} (statuses per brief).
2. CRITICS: 1 subagent per critic the ticket names, ALL parallel, read-only, judge latest
   pushed head (verify SHA first). Return {pass,findings:[{severity,text}]}.
3. REFUTER-BATCH: ONE subagent per critic (not per finding) with that critic's non-low
   findings; returns verdict per finding. Exception: security or critical findings → 3
   independent refuters each. Before spawning any refuter for a scope-type finding,
   grep the spec yourself (cheap) — if another ticket owns it, mark refuted-for-this-ticket
   in your gate notes, no subagent.
4. GATE (your decision, mechanical): code tickets fail on any confirmed finding > low.
   Content D2*/E6*: math-police + historian only (pass + no confirmed > low);
   beginner-persona advisory: 1 fix round max, leftovers → ONE new needs-triage issue
   (gh issue create, body lists leftovers + PR link). Low never fails a gate.
5. FIXER (≤2 rounds): 1 subagent, same worktree, confirmed findings ONLY. Gates: focused
   tests + typecheck/lint/course:check + build; full vitest ONLY if shared/non-local
   files touched; Playwright only ticket's specs. Regen critic inputs, push. Re-run ONLY
   critics that failed + any critic whose inputs the fix changed. After 2 failed rounds:
   PR → draft, comment why on PR + issue, move on.
6. LANDING (YOU run gh directly — no lander subagent; merges are strictly SERIAL):
   a. `gh pr view <n>`: head == judged head, MERGEABLE. CONFLICTING → repair subagent
      (merge main, focused gates; full re-critic ONLY if critic-scoped files changed
      semantically — repair must report that explicitly).
   b. Wait CI check/build/ui green on that head. ui fail on no-typing.spec (or notebook
      w1024) single viewport only → `gh run rerun <id> --failed` ONCE. tutor-eval is
      NOT required — ignore (note result in log; it spends ~$0.75/run in CI).
   c. Draft → `gh pr ready <n>`; `gh pr merge <n> --auto --merge` (real merge commit,
      never squash/rebase/--admin). Verify issue CLOSED, remove worktree, log line,
      THEN start next landing. If permission denied: no retry/workaround — log under
      "Needs the owner", continue other lanes.
7. On each merge: next unblocked ticket (matrix-disjoint) takes the freed slot/port.

## Scheduling (dependency + priority)
Order: landing-ready first (C1b verify → E5 fix), then critical path (D3b → E4a/E4b,
A5 → B3b → B2b-unpark), then content (E6a-c, D2d-j). Never start before deps merged:
A5✓(running) B3b←A5,B2a✓ E4a←D3b E4b←D3b E6a-c←E3✓ D2*←D1b✓ B2b←B2a✓(+held files above).
Suggested first 4 lanes: C1b-verify, E5-refuter/fixer, D3b-resume, A5-resume.
Content lanes fill slots as code lanes clear. Stall rule: lane head unchanged 20 min →
check worktree/dirty files once; 30 min → message agent; still nothing → cancel, WIP-push,
respawn fresh with RESUME note. Watchdog = a few lines appended to RUN-STATE on EVERY
result you handle (time, merged x/40, lane states, main CI) — no timers, no cron.

## Hard safety (copy into every subagent prompt; lane-brief has full text)
- Never production: no reading/sourcing any .env (except $RUN/anthropic.env for granted
  paid evals), no npm run db:migrate / drizzle-kit push / npm run invites / vercel / Neon.
- Never run npm/tests/app in ~/Desktop/finance-agent or -wt-spec (production .env).
  Lane worktrees only. Never ports 3000/3101; kill servers you start.
- `npx vitest run --maxWorkers=4`, never plain npm test.
- No force-push, push-to-main, --admin, reset --hard, git clean, rebase of story branches
  (merge main in), no edits to .github/workflows/tutor-eval.yml, rulesets, secrets.
  Git lock → wait/retry once, never kill holder/delete lock.
- Denied command → don't retry/work around; log "Needs the owner", continue.
- Paid cap $55 TOTAL across runs (spent $1.96; check ledger.txt before any paid step).
- Commits end with: Co-Authored-By: Muse Code <noreply@muse.dev>  ·  PR bodies: Closes #<n>.

## Stop + handback
Stop new lanes at start+2.5h, or 4 consecutive failed lanes with 0 merged, or main red
with 2 failed main-fix attempts, or usage near limit. On stop: finish any landing already
in CI-wait if quick; else every running lane WIP-commits + pushes (never leave local-only
work; disable auto-merge on any PR whose head hasn't passed gates+critics).
Handback (own worktree finance-agent-wt-handoff, branch `handoff`, commit+push there,
never main): rewrite handoff/HANDOFF.md — merged x/40 live-verified, per-open-ticket
stop point (branch, head sha, PR, next exact step), new follow-up issues, Needs-the-owner
(incl. C1b security lows), ledger, resume steps; sync RUN-STATE.md into handoff/run/.
Print 10-line summary.
If build completes first: triage sweep pass 2 (handoff/scripts/triage-sweep.js logic):
classify needs-triage → close-if-fixed with evidence → fix small in a lane → else comment.
Owner-decision issues: take recommended option. P3 G2/F1/F2: skip, log for owner.
