export const meta = {
  name: 'fix-hardening-36',
  description: 'Fix 2 should-fix items on PR #36 (snapshot gate fail-open, cut-short steps priced $0) test-first, then adversarially verify',
  phases: [
    { title: 'Fix', detail: 'TDD fix on feat-hardening, commit locally' },
    { title: 'Verify', detail: '2 lenses: cap bypass, gate + regressions' },
    { title: 'Repair', detail: 'only if a verifier finds a real gap' },
  ],
}

// Usage (Claude Code): Workflow({scriptPath: "tools/wayfinder/workflows/fix-hardening-36.js", args: {repo: "/abs/path/to/finance-agent"}})
// args.repo = the clone on branch handoff-vps (has tools/wayfinder/heavy.sh and docs/handoff/HANDOFF.md).

if (!args || !args.repo) throw new Error('pass args.repo = absolute path of the clone on handoff-vps')
const REPO = args.repo
const WT = REPO + '-wt-hardening'
const GATE = REPO + '/tools/wayfinder/heavy.sh'

const RULES = `
Rules: work only in the worktree ${WT} (create it if missing: \`git -C ${REPO} fetch origin && git -C ${REPO} worktree add ${WT} feat-hardening\`; install with \`${GATE} npm ci\`, retry with \`--allow-remote=root\` if npm refuses xlsx). Every heavy command (npm ci, tsc, eslint, vitest) goes through \`${GATE} <cmd>\`; vitest \`--maxWorkers=2\` on touched files only. Other agents share this machine. No .env needed (PGlite); never read .env*. Do NOT push, comment on GitHub, or touch Vercel/Neon env. Commits: conventional, imperative, reference #23, end with \`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\`.`

const FINDINGS = `
Finding 1 — Neon snapshot gate fails open in production. scripts/migrate-on-build.mjs:66 returns "skip" when NEON_API_KEY is unset and :119-124 then migrates without a snapshot. migrationPlan (:16) already returns early unless VERCEL_ENV=production, so in production a missing key silently skips the restore point. Wanted: in production with a pending migration, a missing NEON_API_KEY or NEON_PROJECT_ID fails the build with a clear message, unless an explicit opt-out env (NEON_SNAPSHOT=off) is set, which logs a loud warning. Local/CI/test behaviour unchanged. Also add a fetch timeout (e.g. AbortSignal.timeout 30 s per call) so a hung Neon call fails fast.

Finding 2 — Steps cut short never reach the Step ledger or the dollar caps. Usage is saved only after stream.final() (src/tutor/turn.ts:812). Not saved: Stop (:843-852), guard stop (:825-835), cut-off/failure mid-stream (:837-841); a compose call that hits its 12 s limit saves usage undefined which is priced $0 (tools.ts:823-829 -> usage.ts:55-70). So a Learner pressing Stop each step pays $0 against usd_per_learner_day / usd_global_day (worst case ~$79/Learner/day vs the $5 cap), and "10 steps" is really 10 + up to 3 unrecorded. Wanted: every step that started a model call is recorded in the Step ledger and in usage, with costUsd null when the real usage is unknown (dailyUse then counts it at UNPRICED_STEP_USD), and it uses up a step. If partial usage is available, use it. Same for the compose timeout path.
(Line numbers are from the review at origin/feat-hardening; confirm in code.)`

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    commits: { type: 'array', items: { type: 'string' } },
    testsAdded: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { cmd: { type: 'string' }, result: { type: 'string' } }, required: ['cmd', 'result'] } },
    summary: { type: 'string' },
    openQuestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['commits', 'testsAdded', 'checks', 'summary', 'openQuestions'],
}
const VERDICT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    gaps: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, line: { type: 'integer' }, problem: { type: 'string' }, scenario: { type: 'string' } }, required: ['file', 'problem', 'scenario'] } },
    checks: { type: 'array', items: { type: 'string' } },
  },
  required: ['ok', 'gaps', 'checks'],
}

phase('Fix')
const fix = await agent(`Fix two review findings on PR #36 (branch feat-hardening, issue #23) test-first (use the mattpocock-skills:tdd skill: write a failing test for each scenario, then the fix).
${FINDINGS}
${RULES}
After both fixes: through the gate run \`npx tsc --noEmit\`, eslint on touched files, and vitest on touched + related test files (turn, tools, usage, step-ledger, turn-admission, migrate-on-build). One commit per finding. Return commits, tests added, checks, summary, open questions.`, { phase: 'Fix', schema: FIX_SCHEMA, label: 'fix' })

const LENSES = [
  { key: 'cap-bypass', p: 'Lens: CAP BYPASS. Try to find any remaining path where a Tutor model call (main step, guard, compose_widget, resume, Stop, cut-off, error, timeout, client disconnect) costs money but is not counted in the Step ledger and in the daily dollar caps (usd_per_learner_day, usd_global_day), or where a step is double-counted. Read src/tutor/turn.ts, tools.ts, usage.ts, step-ledger.ts, turn-admission.ts and the new tests.' },
  { key: 'gate-regress', p: 'Lens: SNAPSHOT GATE + REGRESSIONS. Check scripts/migrate-on-build.mjs: in production with a pending migration, can the build still migrate with no snapshot (missing key, missing project id, opt-out misspelt, empty string env, timeout)? Is local/CI/test behaviour unchanged? Then check the cap fix did not break normal turns: run the touched vitest files and tsc through the gate.' },
]

phase('Verify')
const verdicts = await parallel(LENSES.map(l => () => agent(`Adversarially verify a fix on branch feat-hardening in worktree ${WT} (read-only: do not edit or commit). The fixer's report: ${JSON.stringify(fix)}.
Original findings: ${FINDINGS}
${l.p}
Default to skepticism, but only report gaps you confirmed in code with a concrete failure scenario. Heavy commands through \`${GATE}\`, vitest --maxWorkers=2.`, { phase: 'Verify', schema: VERDICT, label: `verify:${l.key}` })))

const gaps = verdicts.filter(Boolean).flatMap(v => v.gaps)
let repair = null
if (gaps.length) {
  phase('Repair')
  log(`${gaps.length} gap(s) found; repairing`)
  repair = await agent(`Verifiers found gaps in your fix on feat-hardening. Confirm each in code; fix the real ones test-first; explain any you reject. Gaps: ${JSON.stringify(gaps)}
Original findings: ${FINDINGS}
${RULES}
Re-run tsc + touched vitest through the gate.`, { phase: 'Repair', schema: FIX_SCHEMA, label: 'repair' })
}
return { fix, verdicts, repair }
