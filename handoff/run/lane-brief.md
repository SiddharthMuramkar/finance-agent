# Lane brief: story-first build (spec 2026-11-05, parent issue #323)

You are one agent in an unattended overnight build. The owner is asleep. Nobody will answer a question or approve a prompt. Work alone and finish your step. Return the JSON your caller's schema asks for.

## Paths
- Repo: SiddharthMuramkar/finance-agent. Default branch `main`.
- Spec: `docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md` in your worktree, once `main` has it. If your worktree lacks it, `git fetch origin && git merge origin/main`.
- Run folder: `RUN=/Users/siddharth/Downloads/finance-agent-story-run`. It holds this brief, `issues.tsv` (ticket id → issue number), `critics/`, `evals/` and `tmp/`.
- Your ticket's issue number and your `E2E_PORT` are in your prompt.

## Hard rules (break none of them)
1. **Never touch production.**
   - Never read, copy or `source` any `.env` file, except `$RUN/anthropic.env` and only when your prompt grants a paid budget.
   - Never run the app, tests or scripts in `/Users/siddharth/Desktop/finance-agent` or `/Users/siddharth/Desktop/finance-agent-wt-spec`: their `.env` points at the production database.
   - Never run `npm run db:migrate`, `drizzle-kit push`, `npm run invites`, any `vercel` command, or any Neon tool.
   - Migrations are made with `npm run db:generate` and tested on PGlite only.
2. **Never weaken a guard.**
   - No `--admin` merges; no force pushes; no push to `main`; no edits to rulesets, secrets, repo settings or `.github/workflows/tutor-eval.yml`.
   - Never `git reset --hard` or `git clean`. Use `git switch -C` and `git restore`.
3. **Permissions.** When a tool call is denied or blocked by the permission system:
   - don't retry it and don't find a way around the guard;
   - add it to `needsPermission` (the command and why you needed it);
   - carry on with everything else;
   - if the ticket cannot finish without it, return `status: "blocked_permission"`.
4. **Spec §0 governs.**
   - TDD, at the seams S1–S7 only.
   - Expected values come from the spec.
   - Only the new dependencies §0 item 6 allows.
   - Colours through tokens.
   - Glossary words: Learner, Tutor, Topic, Session, Widget, Quick try, Check, Known mistake. Never "user", "lesson" or "chatbot" in UI copy.
   - Docs, GLOSSARY and the named ADR go in the same PR.
   - Code decides; prompts only set voice.
   - Keep `data-testid="topic-bar"` and `aria-label="Topic progress"`.
5. **Contradiction stop (§0 item 2).** If a **Find it** command shows the code contradicts the spec, and this brief's "Resolved gaps" doesn't cover it:
   - comment on the issue with the command, the output and the spec line;
   - return `status: "blocked_spec"`. Don't guess.
6. **The 25-file cap (§9.3) is about fitting one context.** If your ticket's own Change list, with its tests and docs, needs more than 25 files and you can still hold it in one context, finish it and open the PR. State the file count and a one-line reason at the top of the PR body. This is an orchestrator decision, made after T-00 finished green at 34 files. Return `needs_split` (with a split proposal on the issue) only if the work truly won't fit one context.
7. **Hot files.** Your prompt lists the files other running lanes hold (HELD). Don't edit a HELD file.
   - If you must, return `status: "needs_hot_file"` with the file, and keep your branch pushed so the lane can resume.
   - One-line copy or comment edits in files nobody holds are fine.
   - `docs/architecture.md`, `GLOSSARY.md`, `docs/adr/*`, `src/app/api/dev-e2e/route.ts` and `src/dev/e2e-tutor.ts` are shared and append-only. Add your section; never rewrite someone else's.
8. **RAM.** Six lanes share 24 GB.
   - Run the full vitest suite as `npx vitest run --maxWorkers=4`, never plain `npm test` or `npm run check` (no worker cap off CI).
   - Playwright runs with `E2E_PORT` from your prompt.
   - Never start `next dev` on port 3000 or 3101.
   - Kill any server you start.

## Implementer procedure
1. **Branch:**
   - `git fetch origin`.
   - If `origin/story/<ID>` exists, continue it: `git switch -C story/<ID> origin/story/<ID> && git merge origin/main`. Also look for an open PR: `gh pr list --head story/<ID>`.
   - Else `git switch -C story/<ID> origin/main`.
   - Then `npm ci --allow-remote=all --no-audit --no-fund`.
     - Why the flag: npm 12 refuses remote tarball URLs by default, and the lockfile pins `xlsx` to the SheetJS CDN with an integrity hash.
     - npm 12 also blocks install scripts. That is fine (esbuild and a telemetry hook; the build is verified to work without them), so don't approve any.
     - Use the same `--allow-remote=all` on any `npm install` a ticket needs (T-00, C1a, E4b).
   - From T-00 onward, run `npx playwright install chromium` only if `ls ~/Library/Caches/ms-playwright | grep -q chromium` fails.
2. **Read:**
   - the whole spec once (§0 item 1);
   - `GLOSSARY.md`, `docs/architecture.md`, and the ADRs your ticket names (plus 0001 and 0006);
   - then re-read your own ticket section (`### <ID> · …`), its family's shared rules, the §8 critics it names, and the appendices it cites.
   - Run every **Find it** command.
3. **Build test-first:** call the Skill tool with `tdd`.
   - For each **Tests first** item, in order: write it, see it fail for the right reason (save the failing line), write the least code, see it pass, commit.
   - Many small commits. End every commit message with the `Co-Authored-By` trailer your system reminder gives.
4. **Gates, before you push.** All must pass:
   - the focused tests;
   - `npx vitest run --maxWorkers=4`;
   - `npm run typecheck`, `npm run lint`, `npm run course:check`, `node scripts/check-theme-contrast.mjs`;
   - `npm run build`.
   - Once `playwright.config.ts` exists: `E2E_PORT=<port> npx playwright test <your e2e files> e2e/targets.spec.ts e2e/smoke.spec.ts`. Remove your ticket's `test.fail` lines in `e2e/targets.spec.ts`; they must pass.
   - Fix until green. A test you can't make pass after honest work → return `failed` with the reason.
5. **Evidence:**
   - Screenshots the ticket asks for, at 1512×982, Light and Dark: a small Playwright script, or `page.screenshot` in a throwaway spec you don't commit. Save them under `$RUN/critics/<ID>/`.
   - Upload them (below) and paste the metric numbers the ticket's **Done when** names.
6. **Critic inputs:** write to `$RUN/critics/<ID>/` whatever your ticket's Critic check needs:
   - screenshots;
   - `files.txt` (the paths the critic should read);
   - `diff.patch` (`git diff origin/main...HEAD`);
   - for content batches, `persona-input.md` with 5 rewritten questions per Topic.
7. **Merge `main` once more:** `git merge origin/main`, gates again if anything came in. Then push: `git push -u origin story/<ID>`.
   - **Tutor and Topic tickets** (B2b, D3a, D3b, E3, E4a, D2a–j, E6a–c): GitHub runs a paid eval on every push. Push once, after your gates pass; your caller runs critics before your PR opens.
8. **PR:** `gh pr create --base main --head story/<ID> --title "<ticket title>"` with this body:
   - **Summary:** two or three plain sentences.
   - **Tests, red → green:** each test name, the failing line you saw, the commit that made it green.
   - **Metrics:** the Done-when numbers.
   - **Screenshots:** embedded raw URLs.
   - **Docs updated:** architecture, GLOSSARY, ADR.
   - **Resolved gaps:** any item from the list below you relied on.
   - **Critics:** "pending"; the caller adds them.
   - `Closes #<issue>` alone on its own line.
   - The last line: `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
   - **Do not enable auto-merge.**

### Screenshot upload (no checkout needed; retry on 409)
```bash
up() { f="$1"; name="<ID>/$(git rev-parse --short HEAD)-$(basename "$f")"
  for i in 1 2 3 4 5; do
    base64 -i "$f" | tr -d '\n' | jq -Rs --arg m "screens: $name" '{message:$m,branch:"story-screens",content:.}' > "$RUN/tmp/<ID>-up.json"
    if gh api -X PUT "repos/SiddharthMuramkar/finance-agent/contents/$name" --input "$RUN/tmp/<ID>-up.json" >/dev/null 2>&1; then
      echo "https://raw.githubusercontent.com/SiddharthMuramkar/finance-agent/story-screens/$name"; return 0; fi
  done; return 1; }
```
Embed each as `![label](url)`. Prefer JPEG at quality 80 (`type: "jpeg"`) to keep files small.

## Resolved gaps (orchestrator decisions, approved by the owner with the plan; name them in your PR)
- **T-00:**
  - `playwright.config.ts` reads the port from `E2E_PORT` (default 3100) for the web-server command, `url`, `use.baseURL` and `BETTER_AUTH_URL`.
  - `workers: 1`, `fullyParallel: false`: one PGlite server and one tools Learner are shared.
  - Exclude `.next-e2e/`, `playwright-report/` and `test-results/` from ESLint (`eslint.config.mjs` ignores) and `tsconfig.json` `exclude`.
  - Run `npx playwright install chromium` once.
  - CI stays on the default port.
- **A4:** the Done-when grep `paper|forest|midnight` counts theme ids only. Prose like "newspaper" in `src/tutor/instructions.ts` or the notes copy is not a theme and stays untouched. Also fix `src/app/dev/widgets/harness.tsx:35` (`applyTheme("midnight")`), and the theme imports in `settings/settings-view.tsx`.
- **B2a:** like B1, leave `HEADER_LINKS` in `src/app/ui.tsx` to A5. The `Past Sessions` grep may still hit the header label A5 removes. Other hits are one-line copy edits.
- **B2b:** the "notes" strings in `settings-*`, `ui.tsx`, `thread.tsx` and `turn.ts` are one-line copy edits; HELD files still apply.
- **C1a:** "applies on a Neon branch with `npm run db:migrate`" moves to the orchestrator's G2 setup. Write "deferred to G2 setup" in the PR; do not run it.
- **C1a and C1b, when Google is off** (`BETTER_AUTH_SECRET` or `GOOGLE_CLIENT_ID` unset):
  - build the Better Auth instance lazily, only when both exist;
  - `currentLearner()`, the proxy and `/api/logout` skip Better Auth;
  - `/api/auth/*` answers 404;
  - every page works on the passcode path.
  - Add an S2 test for this. Without it, production breaks the moment deploys resume.
- **D3b:**
  - Paid. Budget ≤ $8 a run, at most 2 runs.
  - Start with `: > .env` (empty), then `set -a; . "$RUN/anthropic.env"; set +a; TUTOR_EVAL_BUDGET_USD=8 TUTOR_EVAL_OUT="$RUN/evals/d3b-run<k>" npm run tutor:eval`. Never print the key.
  - Report the spend from the eval's own summary.
- **E3:**
  - `e2e/dev-scenes.spec.ts` finds every Topic that has `scenes:` itself, so E6a–c never edit it.
  - If `scripts/check-course.mjs` can't import recipes under plain Node, build every Topic's scenes in a vitest test (`src/course/scenes.test.ts`) that `npm run check` runs. Say so in the PR.
- **E4a:**
  - `src/behaviour/delight/replay-fixtures.json`: take the 50 Tutor reply texts (text, Topic and step only) from D3b's transcripts in `$RUN/evals/` and from tutor-eval CI artifacts (`gh run list --workflow tutor-eval.yml`, then `gh run download <id> -n tutor-eval`). Never from production.
  - Write `reply_checks.widget_source` fail-soft: a missing column must not drop `reply_kind` or break the turn. Test it the way `go-live-reply-kind.test.ts` drops a column.
- **E4b:** build the runner and its S3 tests, with no live run. The PR says the live report comes from G2 round 1, under the $55 ledger.
- **Content batches (D2a–j, E6a–c), Case openers and arithmetic choice sets.** Orchestrator decision, 5 Nov 23:59, after D2a–e all failed the gate on this one point.
  - "Do not change Cases" means the Case's facts: names, dates, figures, sources, `asOf`, outcome. It does not freeze the wording of a question the Case story asks the Learner.
  - When a Case story or opener ends by asking for a figure ("roughly how much had the market value fallen", "how much does the fund have to lose…"), rewrite only that question sentence into a story or lingo ask ("What do traders say happened to that portfolio?", "Why could a small loss wipe the fund out?"). Every fact stays word for word. ADR 0009 (no sums) outranks the wording.
  - A choice set whose options differ only by arithmetic (7.4 / 0.74 / 74; "a small loss" vs "a big loss of about 6.5 %" from figures in the stem) must be rewritten so the idea separates the options.
  - Keep question ids even when they contain words like "calculate" (that is cosmetic; the critic may note it, and it is not a violation).
  - Say in the PR which Case questions you reworded.
- **Content batches:** past 70 % of your context, follow §7's rule: ship the finished Topics, delete only their allowlist ids, and file `<batch>-rest` as `needs-triage`. Nobody starts that issue tonight.

## Critic procedure (critic agents)
- Read `<lane worktree>/docs/critics/<name>.md` (T-01 wrote them) and the inputs your prompt lists.
- Judge only what the rubric asks. Return the critic's JSON as `raw`, plus a normalised list:
  - `pass`;
  - `findings[]`, each with `id`, `severity` (`low|med|high|critical`), `where`, `problem`, `evidence`, `highStakes` (true for security, a wrong historical fact, a sum asked of the Learner, or data loss).
- Never edit files.

## Refuter procedure
- Fresh eyes. Try to show the finding is **wrong** using the code, the screenshots and the spec.
- `refuted: true` only with concrete evidence (file:line, a measurement, a spec line). Otherwise `refuted: false`.

## Fix procedure (same worktree, same branch)
- Fix only the confirmed findings you're given, test-first when a seam can show it, then run the gates.
- Tutor and Topic tickets: one push, after all fixes.
- A finding you cannot fix: file it as a `needs-triage` issue and make it a sub-issue of #323:
  1. `gh issue create --label needs-triage --title ... --body ...` (include the evidence);
  2. `gh api repos/{owner}/{repo}/issues/323/sub_issues -F sub_issue_id=<db id>`;
  3. list it under the PR's Critics section.

## Lander procedure (cheap and mechanical)
1. Wait for the checks: `gh pr checks <n> --watch --interval 30` (Bash timeout 600000); repeat until nothing is pending.
   - Required: `check` and `build`, plus `ui` once `.github/workflows/ci.yml` on the PR has a `ui` job.
   - `tutor-eval` never blocks and is never waited on.
2. Any required check failed → return `ci_red` with the failing job names and `gh run view <run> --log-failed | tail -120`.
3. All required checks green → `gh pr merge <n> --auto --merge`. Then poll `gh pr view <n> --json state,mergeStateStatus` (every 20 s, up to 10 min).
   - `MERGED` → go to step 4.
   - `DIRTY` or `CONFLICTING` → return `conflict`.
4. `gh issue view <issue> --json state`. Still OPEN → `gh issue close <issue> --comment "Closed by #<n>, merged into main."`
5. Report `main` health: `gh run list --branch main --workflow CI --limit 3 --json conclusion,status,headSha`. `mainRed` is true if the newest *completed* run failed.

## Known issues (orchestrator notes, newest first)
- **5 Nov 21:30: `ui` smoke flake.** `e2e/smoke.spec.ts` fails on `main` (run after #372) with "expect(getByTestId('assistant-message')).toHaveCount(1), received 2".
  - Cause: `say()` in `e2e/support/app.ts` reads `before` after `settled()`, but the page's opener (seed `story` has a Session with no messages, so `/study` starts the Topic's first turn by itself) can start after that. So opener plus scripted reply = `before + 2`.
  - Fix belongs **only to the main-fix lane**: make `say()` deterministic. Either wait for the opener's reply to land before reading `before` when the open Session has no messages, or count at least `before + 1`, then `settled()`, then assert the scripted text arrived. Run `npx playwright test` 5 times in a row with no flake before the PR.
  - **Lane repairs:** if your PR's `ui` failure is only this smoke test, `gh run rerun <run> --failed` once. Do not edit `e2e/support/app.ts` or `e2e/smoke.spec.ts` in a ticket PR.

## CI fixer and merger
- **ci_red:**
  - a flake (timeout, port in use, network, a test passing locally and on retry) → `gh run rerun <run> --failed`, once;
  - else reproduce locally, fix test-first, run the gates, push.
- **conflict:** `git fetch origin && git merge origin/main`. Keep both sides' intent; never drop another ticket's work. Re-run `npm run db:generate` if `drizzle/` conflicted (it must write nothing new beyond your own migration, renumbered to the next free number). Then gates, push.
