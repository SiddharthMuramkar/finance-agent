export const meta = {
  name: 'finish-lanes',
  description: 'Resume the lanes: docs #34 fix, site #32 leftovers, sources #38 slices, Clerk cutover core (PR B)',
  phases: [
    { title: 'Lanes', detail: 'one agent per lane, own worktree, commit only (no push)' },
  ],
}

// Usage (Claude Code): Workflow({scriptPath: "tools/wayfinder/workflows/lanes.js", args: {repo: "/abs/path/to/finance-agent", lanes: ["docs-34","site-32","sources-38","clerk-cutover"]}})
// args.repo = the clone on branch handoff-vps (has tools/wayfinder/heavy.sh and docs/handoff/HANDOFF.md).

if (!args || !args.repo) throw new Error('pass args.repo = absolute path of the clone on handoff-vps')
const REPO = args.repo
const GATE = REPO + '/tools/wayfinder/heavy.sh'
const HANDOFF = REPO + '/docs/handoff/HANDOFF.md'

const COMMON = `
You are resuming one lane of work on the Value It repo (GitHub SiddharthMuramkar/finance-agent) that moved Mac -> Fedora -> this VPS. Main clone: ${REPO}. Overall handoff (read section 2 rules and your lane's row in section 4): ${HANDOFF}.

Setup rules:
- Make your own worktree: \`git -C ${REPO} fetch origin\` then \`git -C ${REPO} worktree add <dir> <branch>\` (local branch tracking origin). If the dir already exists, reuse it. Work only inside it.
- Install deps with \`${GATE} npm ci\` (if npm refuses the xlsx tarball, retry with \`--allow-remote=root\`).
- RAM: this machine's RAM is shared and other agents run in parallel. EVERY heavy command (npm ci, tsc, eslint, vitest, next build, playwright, library scripts) goes through \`${GATE} <cmd>\`. Vitest: \`--maxWorkers=2\`, touched files only. Playwright: \`--workers=1\`. Do not run the full vitest suite or \`next build\` unless your lane says so.
- No .env is needed for unit tests (PGlite). Do not read or print .env* files or secrets.
- Branch tops may hold a \`wip(handoff)\` commit = uncommitted agent work from stop time. Review it first; keep it and add normal commits on top (PRs are squash-merged). Never rewrite pushed history.
- Commits: conventional commits, imperative mood, reference the issue number, end each message with the line \`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\`.
- DO NOT push, open/merge/close PRs or issues, post GitHub comments, or change Vercel, Neon, Clerk, DNS, env or firewall. Commit locally only; the orchestrator will push after the owner says yes.
- Branch names you create use dashes, no slashes.
- If you hit something that needs an owner decision, stop that part and report it in blockers; don't guess.

Return: lane, branch, worktree path, the commits you made (sha + subject), each check you ran with pass/fail, whether the lane's goal is done, what remains, blockers/questions for the owner, and anything that touches another lane (conflicts, shared files, migrations).
`

const SCHEMA = {
  type: 'object',
  properties: {
    lane: { type: 'string' },
    branch: { type: 'string' },
    worktree: { type: 'string' },
    commits: { type: 'array', items: { type: 'string' } },
    checks: { type: 'array', items: { type: 'object', properties: { cmd: { type: 'string' }, result: { type: 'string' } }, required: ['cmd', 'result'] } },
    done: { type: 'boolean' },
    remaining: { type: 'array', items: { type: 'string' } },
    blockers: { type: 'array', items: { type: 'string' } },
    crossLane: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['lane', 'branch', 'commits', 'checks', 'done', 'remaining', 'blockers', 'crossLane'],
}

const LANES = [
  {
    key: 'docs-34',
    prompt: `${COMMON}
LANE: Docs #31 / PR #34, branch \`docs-4-fresh-adrs\`, worktree ${REPO}-wt-docs.
Read the adversarial review comment on PR #34 (\`gh pr view 34 --comments\`) and issue #31. Status: review said "Fix first". Already committed: ADR 0018 (flat controls) and widened ADR 0010. The citation remap is half done in the wip(handoff) commit.
Do:
1. Finish the citation remap BY RULE, not by number: every citation of an old ADR/ticket must point at the new ADR that actually holds that rule. Check each one against the ADR text.
2. ADR 0014 Status: superseded by ADR 0017 for sign-in, /admin approval, access states, the reasons table and the "You're in" email; /pending and /login dropped. Make 0014 and 0017 agree, and match the Clerk plan (issue #33).
3. Fix any other blocker listed in the review.
4. Run the repo's docs verify script (find it: look in scripts/, package.json, and the review comment) and \`npm run check\` if it is light (through the gate).
5. Do a self re-review against every review point; list each point as fixed / not fixed.
Note the Clerk cutover lane also edits src/db/schema.ts, src/auth/session.test.ts, login and admin page tests; if this docs branch changes code files, say which.`,
  },
  {
    key: 'site-32',
    prompt: `${COMMON}
LANE: Site #32, branch \`feat-7-signal-site\`, worktree ${REPO}-wt-site. Read issue #32 and the spec docs/specs/value-it-signal-spec.md (§13 QA rows).
State: all 4 slices merged in; leftovers being cleaned, plus one wip(handoff) commit.
Do:
1. Finish leftovers: the NY Fed notice in the Rates widget; no Dark theme / readTheme code or wording left anywhere; pages use the real widget props (no stubs).
2. Fix the About-test flake (\`e2e/about.spec.ts:24\`, test "D1") that also hit PR #20; make it deterministic, don't just add retries.
3. Do NOT add /join or /pending pages (Clerk owns sign-up, issue #33). Don't touch src/auth or sign-in flows beyond what the site needs.
4. Integrate step (this lane is ready for a PR, so full checks are allowed): through the gate run \`npm run check\`, the full vitest suite in folder chunks each under 10 minutes (--maxWorkers=2), \`next build\` with no env, and Playwright --workers=1 (install chromium first if missing: \`npx playwright install chromium\`). Report every failure honestly.
5. Walk spec §13 QA rows; report each as pass / fail / not checkable.
6. Draft the PR body (title + body with "Closes #32") into a file \`/tmp/pr-site-32.md\` using the mattpocock-skills:pr skill. Don't open the PR.
Cross-lane: Clerk cutover edits next.config.ts, proxy.ts, login pages and admin page; the sources lane (#38) will stack on this branch. Report every shared file you change.`,
  },
  {
    key: 'sources-38',
    prompt: `${COMMON}
LANE: Library sources #38. Read issue #38 (and #27 it references). Slice branches: \`wip-src-openstax\` (done: 1e id, re-pointed scorer, drop-source.mjs), \`wip-src-fomc\` and \`wip-src-sec\` (partly done, wip(handoff) commits), \`wip-src-investorgov\` (not started). All are based on \`wip-site-library\`.
Do:
1. Use one worktree per slice: ${REPO}-wt-src-<name>. Finish fomc, sec (Amazon, Webvan, WeWork S-1) and investorgov per issue #38, with unit tests for the code you add (vitest through the gate, touched files only). One npm ci per worktree is costly: you may share by doing slices sequentially in one worktree and switching branches.
2. Integrate: create branch \`feat-library-sources\` from \`origin/feat-7-signal-site\` (the site lane is also committing to that branch right now; use the pushed origin version) and merge the 4 slice branches into it. Resolve conflicts; run tsc and the touched vitest files.
3. Do NOT load anything into any database, do NOT create Neon branches, do NOT run evals that need a DB. The eval (Neon branch copy: load, restamp, embed, score vs baseline hits@5 92% / MRR 0.82) needs the owner's yes; write the exact eval commands you would run into a file /tmp/sources-eval-plan.md instead.
4. Licences: note any source whose licence or reuse terms are unclear (OpenStax CC BY, SEC public domain, Investor.gov, FOMC/NY Fed notices) as owner blockers.`,
  },
  {
    key: 'clerk-cutover',
    prompt: `${COMMON}
LANE: Clerk cutover, issue #33, PR B, branch \`feat-33-clerk-cutover\` (stacked on \`feat-33-clerk-prep\` = PR #35), worktree ${REPO}-wt-clerk-cutover.
First read on that branch: \`.handoff/HANDOFF.md\` and \`.handoff/plan.md\` (Phase 3b is your job), and issue #33. The top commit is a WIP snapshot: core seam part-written, untested, hooks skipped, not type-checked.
Do, in order, committing after each step that is green:
1. Through the gate: \`npx tsc --noEmit\` and the touched vitest files (src/auth/*, session, proxy, admin, login). Fix the core seam until green: gates.ts (passcodeDoorOpen, clerkOn), identity.ts (currentIdentity), clerk-learner.ts (learnerForClerkUser, never null), session.ts, owner.ts -> signedInAdmin, learners.ts, proxy.ts, destination.ts, api/login, dev/e2e-identity.ts, types/clerk.d.ts. Use TDD for missing behaviour (mattpocock-skills:tdd).
2. Slice "pages + UI" from plan Phase 3b.
3. Slice "admin" from plan Phase 3b.
4. Slice "removal + test bed" from plan Phase 3b.
Stop cleanly when your context gets tight; it is fine to finish only steps 1-2. Do NOT do the integrate step (full suite, next build, Playwright), PR, Phase 4 (clerk deploy, DNS, Vercel env) or any clerk/vercel CLI writes. Clerk docs: use Context7 (\`ctx7\`) or the clerk skills if available; Clerk is fully OFF in the test bed, so unit tests need no keys.
Known cross-lane facts (report how they affect you, don't fix them): PR #36 hardening (branch feat-hardening) also adds migration 0038 (0038_turn_runs) and will merge first, so PR #35's 0038_clerk_user_id will be renumbered to 0039 later; hardening also edits src/proxy.ts, src/app/api/turn/route.ts, admin page, src/db/schema.ts. The site lane edits next.config.ts, proxy.ts and login pages. List the conflicts you expect at rebase time.`,
  },
]

phase('Lanes')
const pick = args.lanes ? LANES.filter(l => args.lanes.includes(l.key)) : LANES
const results = await parallel(pick.map(l => () =>
  agent(l.prompt, { label: `lane:${l.key}`, phase: 'Lanes', schema: SCHEMA })
))
return results.map((r, i) => r ? r : { lane: pick[i].key, failed: true })
