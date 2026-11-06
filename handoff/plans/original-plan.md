# Build the story-first spec unattended: frontier Workflows, a 15-minute watchdog, nothing blocks on you

## Context

The spec `docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md` (3,778 lines, untracked in this worktree) turns your voice note into 45 tickets: full-screen layout, raised buttons, Light/Dark royal blue, Course Map + Notebook, Topic restart, Google sign-in, no-maths story teaching, a Widget and Choices with every reply, and 13 content batches. It also contains the orchestration contract (§9), the issue script (Appendix E) and the critics (§8).

You asked me to plan it, then build all of it while you're away. That means:
- run the work as a smart, dynamic Workflow;
- check it every 15 minutes;
- keep the Mac awake;
- route around anything that needs your permission, and leave you one list at the end.

"Everything is specified, just execute" is read as: skip `/to-spec` and `/to-tickets`, and create the issues with the spec's own Appendix E script (§0 item 3).

Facts checked during planning:
- `main` = `spec` = 9b8b6e4. No open PRs, no peer sessions.
- Machine: 18 cores, 24 GB RAM, AC power. `cwebp` and `ffmpeg` are installed (E1 needs them).
- PR CI takes about 10 min. The ruleset requires `check` and `build`. The repo is public.
- **This worktree's `.env` and the main checkout's both point at production**: `DATABASE_URL` and the API key. So nothing runs the app, the tests or any script in either folder. Every agent works in a fresh worktree.

## Your decisions (5 Nov)

1. **Pause production deploys until H1.**
   - Why: after C1a and B3a merge, `src/auth/learners.ts:58` (every signed-in request) and `src/tutor/turn.ts:461` (every Tutor turn) select columns production doesn't have until you run `db:migrate`.
   - What I do: one `vercel.json` PR now (`git.deploymentEnabled.main: false`) and a ready re-enable PR for after you migrate.
2. **Run to the end.** I stop only for:
   - a confirmed critical security finding;
   - a step that needs the production database;
   - `main` CI still red after 2 fix tries;
   - paid runs stop at $55.
3. **Ledger plus CI evals.**
   - The spec's own paid runs: $55 at most (D3b `tutor:eval`, the Delight eval on a Neon test branch).
   - GitHub's tutor-eval check stays on (about $2–5 per Tutor or Topic PR).
   - To limit re-runs, those PRs run their critics before their first push.

## Technical defaults (not asked)

- **Tiers** (§9.3):
  - Implementers: Sonnet, medium effort.
  - Opus, medium effort: T-00 (everything waits on it), C1a, C1b, D3a, D3b, E4a.
  - One Opus retry per failed lane.
  - Landers (wait for CI, then merge): Haiku.
  - Critics: Sonnet. Historian votes run on Opus for D2c, D2e, D2f, D2h and E6a–c.
  - **At most 2 Opus judges per Workflow (§8):**
    - per-ticket persona gates run on Sonnet;
    - the build's 2 Opus judges are D3b's T12–T16 transcripts and the E6a–c story Topics;
    - the proof's 2 are F1's persona and F2's review.
- **At most 6 lanes at once** (24 GB). Ports `E2E_PORT=3111+slot`; port 3101 is left for widget-eval in G2. Local vitest uses `--maxWorkers=4`, because `npm run check` has no worker cap off CI.
- **Hot-file locks are code.**
  - **Lock set:** a ticket's lock set is its Hot files plus its §9.2 rows. Order comes from §9.2, plus the red-team additions:
    - A3a first on `message-box`, `widget-pager` and `save-to-notes`;
    - `ui.tsx`: A3a → A1 → A3b → A2 → A5;
    - A3b → B2a on `past-sessions.tsx` and `notes/*`;
    - A5 → C1b → B3b on `settings-view` and `account-menu`;
    - D3a → E4a on `turn.ts` and `api/turn`.
  - **Unlocked, the later PR merges:** the docs, GLOSSARY, ADRs, the `dev-e2e` route and `e2e-tutor.ts` (append-only), and one-line copy edits in other lanes' files.
  - **A failed owner** (Opus retry spent) turns its PR into a draft and drops out of the file orders. Its dependants wait; nothing deadlocks.
  - **Longest chain:** T-00 → E1 → A4 → A3a → A1 → A3b → D3a → A2 → B2b → E5 → B3b → G1 → F1 → F2. **About 11–13 hours.**
- **Spec gaps resolved in the lane brief** (each PR says so):
  - **T-00:** port from `E2E_PORT` (default 3100); `workers: 1` and `fullyParallel: false`; exclude `.next-e2e/`, `playwright-report/` and `test-results/` from ESLint and tsconfig; install Chromium once.
  - **A4:** its "paper|forest|midnight" grep matches theme ids only (prose like "newspaper" stays). It also fixes `dev/widgets/harness.tsx:35`.
  - **B2a:** leaves `HEADER_LINKS` to A5, as B1 does.
  - **C1a:** its Neon-branch migration check moves to G2 setup, so `db:migrate` stays denied.
  - **C1a and C1b, when Google is off** (no `BETTER_AUTH_SECRET` or `GOOGLE_CLIENT_ID`): Better Auth is built lazily and every page works on the passcode path, with an S2 test. Otherwise the site breaks once deploys resume.
  - **D3b:** reads the key from `<RUN>/anthropic.env` into its environment, keeps `.env` empty, and sends transcripts to `TUTOR_EVAL_OUT=<RUN>/evals/d3b-<n>`. At most 2 runs at $8 each.
  - **E3:** `e2e/dev-scenes.spec.ts` finds the Topics that have `scenes:` itself, so E6a–c run in parallel. If recipes can't load under plain Node, the scene builds run in vitest.
  - **E4a:**
    - its 50 replay fixtures come from D3b's transcripts and the tutor-eval CI artifacts (text only);
    - the `widget_source` write fails soft without dropping `reply_kind`, tested like `go-live-reply-kind.test.ts`.
  - **E4b:** ships the runner without a live run. G2 round 1's report goes on its issue, which keeps the ledger at $55.
  - **No continuation lanes for `<batch>-rest`:** those are `needs-triage` and yours (§0 item 4).
- **The two old UI docs** deleted in this worktree stay uncommitted. The final report flags them.

## Phase 0 · Pre-flight (inline, about 20 min)

1. **Permissions:** use the `update-config` skill to write `.claude/settings.local.json`.
   - **Allow:**
     - Bash: npm, npx, node, git, gh, rg, jq, sed, awk, grep, find, cp, mv, mkdir, curl, cwebp, ffmpeg, base64, lsof, kill, pgrep, caffeinate, and targeted `rm -rf` of node_modules, .next*, test-results and playwright-report;
     - Edit and Write for this worktree and the run folder;
     - Context7 and Firecrawl;
     - Neon: `create_branch`, `get_connection_string`, `describe_branch`, `list_branches`.
   - **Deny:**
     - `npm run db:migrate*`, `*drizzle-kit push*` and `npm run invites*`;
     - all `vercel` commands;
     - force push, `reset --hard`, `git clean`, and any push to `main`;
     - `gh pr merge --admin`, `gh api *rulesets*`, `gh secret*` and `gh repo edit*`;
     - Neon `delete_*`, `reset_*`, `restore_*` and `run_sql*`.
   - Run folder in `additionalDirectories`.
   - **Approve the plan with auto-accept edits.**
2. **Keep awake:** `caffeinate -ims -t 172800` in the background. Keep the lid open and the charger in.
3. **Run folder:** `~/Downloads/finance-agent-story-run/`. It holds:
   - `RUN-STATE.md`: phase, workflow ids, merged, deferred, ledger;
   - `lane-brief.md`: setup, the TDD loop, gates, PR format, landing, the fix and merge steps, the critic and refuter steps, the permission and secret rules, the return JSON;
   - `status.sh`;
   - `issues.tsv`;
   - `anthropic.env`: the key only, chmod 600;
   - `critics/` and `evals/`;
   - `FINAL-REPORT.md`.
4. **Spec PR** from `spec`, with only the spec file, set to `--auto --merge`. Lanes wait for it, because F2 diffs from this commit.
5. **Deploy pause PR** (`vercel.json`), with "Refs" the parent issue. Auto-merge it; it lands well before C1a and B3a. Also prepare the re-enable PR, unmerged.
6. **Issues:** Appendix E as a script, then `bash -n`, `--dry-run`, then the real run. That makes the parent, 45 sub-issues and the blocked-by edges. The ticket → issue map goes in `issues.tsv`.
7. **Screenshots:** an orphan branch `story-screens`. Lanes upload with the gh contents API (a `jq -Rs` body, retried on 409) and embed the raw URLs.
8. **Watchdog:** `CronCreate` with `7,22,37,52 * * * *` (every 15 minutes, away from :00 and :30). The cron expires after 7 days.

## Phase 1 · Workflow `story-w0` (about 1.5 h)

- T-00 (Opus) and T-01 (Sonnet) as two lanes, then landing.
- **Checkpoint (me):** both merged and issues closed; `main` CI green on `check`, `build` and `ui`; `ui` under 8 min; Chromium cached.

## Phase 2 · Workflow `story-build` (about 9–11 h)

**The scheduler is code.** Its state comes from GitHub (closed issue = merged), so a relaunch resumes.
- A ticket starts when its §9.1 dependencies are merged and its locks are free. Ready tickets go critical path first, at most 6 lanes.
- 38 tickets are in scope: every agent ticket except T-00, T-01, C3, F1 and F2. C2 and H1 are yours, and C3 waits for C2.

**A lane is a pipeline:**
1. **Implementer** (worktree):
   - `git switch -C story/<id> origin/main` and `npm ci`. If its branch or PR exists, it continues from it.
   - It reads the whole spec once (§0 item 1), then re-reads its ticket. It runs **Find it**; a contradiction gets an issue comment and returns `blocked_spec`.
   - The `tdd` skill: red for the right reason, then green, then a commit. Docs, GLOSSARY and ADR go in the same PR; at most 25 files.
   - **Local gates:**
     - focused tests;
     - `npx vitest run --maxWorkers=4`;
     - typecheck, lint, `course:check`, contrast;
     - `npm run build`;
     - its own e2e specs plus `targets.spec.ts`.
   - Screenshots at 1512×982, Light and Dark.
   - The PR to `main` lists:
     - the tests, red to green, with commits;
     - the metrics and screenshots;
     - `Closes #N` on its own line.
     - **No auto-merge yet.**
2. **Critics:** the ticket's own Critic check, from `docs/critics/*.md` in the lane worktree.
   - Each finding gets a fresh refuter (Sonnet). High-stakes findings get 3 votes, 2 of 3 to keep: security, a wrong fact, a sum asked, data loss.
   - Confirmed findings → one fix round. Leftovers → `needs-triage` sub-issues.
   - Critics run while CI runs, except on Tutor and Topic PRs, where they run before the first push.
3. **Lander:**
   - wait until `check`, `build` **and `ui`** are green (§0 item 8), then `gh pr merge --auto --merge`;
   - confirm the merge, and that the issue closed (or close it with a link);
   - report `main` CI health.
   - Red CI → re-run one flaky job once, else fix (Sonnet, then Opus). A conflict → merge `main` and resolve. After 2 tries → `needs-triage`.
4. **Content batches (G3: D2a–j, E6a–c):**
   - Gates: Math police 0, Historian 0 wrong, Sonnet persona ≥ 4/5, `course:check`.
   - A failed gate gets a Sonnet fix, then an Opus fix, then `needs-triage`.

- **G1** runs inside this Workflow once A1–A5, B1–B3b and E5 are merged. At most 3 rounds, each:
  1. measure on a fresh `main` worktree at 1024, 1280, 1512 and 1920, Light and Dark;
  2. the Affordance, Space and Colour critics, verified;
  3. fix lanes through the same locks.
  - Leftovers → `needs-triage`.
- **`main` red:** stop starting lanes. Re-run once for a flake, else one main-fix lane (Opus). Still red after 2 tries → stop.

## Phase 3 · G2 Delight `story-g2` (paid, overlapping the build)

- **When:** once E4a, E4b and E6a are merged.
- **Setup (me, inline, in a fresh worktree):**
  1. Create one Neon test branch with the MCP.
  2. Migrate it with `drizzle-kit migrate`, after checking its host is not production. This also proves C1a's, B3a's and E4a's migrations.
  3. Set `widget_engine` to `on` on the branch.
  4. Write `eval.env`: this worktree's keys, the branch URL, `EVAL_DB_OK=branch`, `PROD_DB_HOST`.
- **Rounds:**
  - `npm run delight:eval -- --judge` at $13 at most a round, up to 3 rounds.
  - Fixes (Opus) change code first (picker, Choices, V8), prompts last.
  - The ledger lives in `RUN-STATE.md`.
- I leave the branch for you to delete.

## Phase 4 · Workflow `story-proof` (about 1.5–2 h)

- **F1:**
  - the preview matrix (72 cells plus 8 `not_invited` shots) on a fresh `main` worktree;
  - every §8 critic, each finding verified;
  - one `needs-triage` issue per gap;
  - the screenshots go on the parent issue.
- **F2:**
  - Opus `/code-review` on two axes, from the spec commit to `main`;
  - each finding refuted or confirmed;
  - one fix PR;
  - every ticket confirmed closed.

## Phase 5 · Handback and cleanup

- `FINAL-REPORT.md` and one push notification. The report covers:
  - the merged PRs and metric numbers;
  - `needs-triage` and deferred tickets, with the permissions they need;
  - paid spend against $55, plus the CI eval runs;
  - the Neon branch;
  - the two old UI docs.
- **Yours, in this order:**
  1. C2's Vercel variables (Appendix F.1 step 7);
  2. a snapshot, then `db:migrate`;
  3. merge the re-enable-deploys PR;
  4. finish C2;
  5. H1: `widget_engine` on (#248), `ui` in the ruleset, `signup_open` when you're ready, close #271 and #312–#320.
  - Then C3 can run.
- **Cleanup:**
  - remove only this run's lane worktrees and local branches;
  - `CronDelete` the watchdog; stop `caffeinate`;
  - update the memory.
  - This worktree stays until you say "remove the worktree".

## Watchdog (every 15 min) and building around permissions

The cron prompt:
1. Read `RUN-STATE.md`; run `status.sh`. It shows caffeinate, workflow progress and last event, open `story/*` PRs with their checks, the last 3 `main` runs, the merged count and the ledger.
2. Act:
   - caffeinate off → restart it;
   - a Workflow done → next phase;
   - E4a, E4b and E6a merged → G2 setup;
   - `main` red → the main-red rule;
   - a stop condition → stop, report, one notification.
3. **Never kill a lane for slowness (§9.3).**
   - Only an agent stuck on a permission for 60+ min, holding locks that ready tickets need, gets deferred. Stop the Workflow and relaunch it from GitHub state without that ticket; its PR waits for you.
4. Otherwise append one line to `RUN-STATE.md` and stay silent.

- Never SendMessage a running workflow agent.
- An agent that hits a denied tool doesn't retry or work around a guard. It returns `blocked_permission` with `needsPermission[]`; the scheduler defers it and its dependants and goes on.

## Verification

- Every ticket except C2, C3 and H1 is closed by a merged PR (the parent's sub-issue view).
- `main` CI is green on `check`, `build` and `ui`. F2's final `npm run check`, `npm run build` and `npm run ui:test` pass.
- The §6.2 metrics are pasted in PRs and re-measured in F1:
  - gutter ≤ 32 px;
  - panel ≥ 55 %;
  - header ≤ 56 px;
  - 0 affordance failures;
  - 0 typed-number inputs;
  - a Widget and 2–3 Choices on every scripted reply.
- G2: the D.3 bars, or the gaps listed with numbers. G3: `L10_NOT_YET_STORY` is empty, or what's left is listed as `needs-triage`.
- ADRs 0009–0012 exist, the ADR 0004 note is in, and the GLOSSARY and architecture sections are checked by F2.

## Scale

About 330 agents across 4 Workflows. That is far above the 10-agent guideline because 43 tickets unblock each other, so one dynamic Workflow per phase replaces dozens of small ones.

`flowx · frontier pipeline ×4 · ~330 agents · haiku ~45 / sonnet ~250 / opus ~35`
