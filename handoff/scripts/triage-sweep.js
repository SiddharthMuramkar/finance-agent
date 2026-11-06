export const meta = {
  name: 'triage-sweep',
  description: 'Clear the needs-triage pile: classify each issue on origin/main, verify every close, fix what touches no locked file (test-first PR, review, merge), defer the rest to the end-of-build sweep',
  phases: [
    { title: 'Classify', detail: 'one agent per issue, evidence from origin/main' },
    { title: 'Verify', detail: 'a refuter per close or covered verdict' },
    { title: 'Fix', detail: 'one lane per file group: test-first PR, review, land' },
    { title: 'Close', detail: 'close with evidence, or comment why it waits' },
  ],
}

const A = args || {}
const ISSUES = A.issues || []
const PASS = A.pass || 1
const PORTS = A.ports || [3121, 3122]
const RUN = '/Users/siddharth/Downloads/finance-agent-story-run'
const REPO = 'SiddharthMuramkar/finance-agent'
const MAIN = '/Users/siddharth/Desktop/finance-agent'
const SPEC = 'docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md'
const LOCKED = `${RUN}/tmp/triage-locked.txt`

// Same usage-limit breaker as the build: a run of null results means the account is out.
let nullStreak = 0, limitHit = false
async function ag(prompt, opts) {
  if (limitHit) return null
  const r = await agent(prompt, opts)
  if (r == null) { if (++nullStreak >= 4 && !limitHit) { limitHit = true; log('BREAKER: 4 agents in a row returned nothing (usage limit suspected)') } }
  else nullStreak = 0
  return r
}

const CONTEXT = [
  `Repo ${REPO}. The owner said: clear every needs-triage issue, take the best option on any open decision, open a PR and merge it to main. Work alone; never ask.`,
  `SAFETY: ${MAIN} (the main checkout) holds a PRODUCTION .env. Never run npm, node scripts, tests or the app there. Read code only with git: git -C ${MAIN} fetch origin, then git -C ${MAIN} show origin/main:<path>, git -C ${MAIN} grep -n <pattern> origin/main, git -C ${MAIN} log origin/main. Never touch production (no db:migrate, no vercel, no production DB).`,
  `Context: a story-first build is running (spec ${SPEC} on origin/main; state in ${RUN}/RUN-STATE.md, section "Merged"; tickets map in ${RUN}/issues.tsv). The app now has two themes, Light and Dark royal blue (ADR 0012, ticket A4 merged); Paper, Midnight and Forest are gone. Merged tickets: ${(A.merged || []).join(', ')}. Pending tickets (still to build, each has a "### <ID> · …" section in the spec): ${(A.pending || []).join(', ')}.`,
  `Files locked by pending tickets or open story/* PRs (do not edit them now): ${LOCKED} (one path per line, with the reason).`,
].join('\n\n')

const CLASSIFY_SCHEMA = { type: 'object', required: ['issue', 'verdict', 'evidence'], properties: {
  issue: { type: 'integer' },
  verdict: { type: 'string', enum: ['close_superseded', 'close_fixed', 'covered_by_pending', 'fix_now', 'owner_only'] },
  evidence: { type: 'string', description: 'file:line on origin/main, merged PR, ADR or spec line; quote it' },
  decision: { type: 'string', description: 'for a "decision for the owner" issue: the option you chose and why' },
  ticket: { type: 'string', description: 'covered_by_pending only: the pending ticket id' },
  files: { type: 'array', items: { type: 'string' }, description: 'fix_now: repo paths the fix changes, tests included' },
  lockedFiles: { type: 'array', items: { type: 'string' }, description: 'fix_now: which of files are in the locked list' },
  waitsFor: { type: 'array', items: { type: 'string' }, description: 'pending tickets that hold those locked files' },
  plan: { type: 'string', description: 'fix_now: the change in 2-4 sentences, and the test that shows it' },
} }
const VERDICT_SCHEMA = { type: 'object', required: ['refuted', 'evidence'], properties: {
  refuted: { type: 'boolean' }, evidence: { type: 'string' },
  files: { type: 'array', items: { type: 'string' } }, plan: { type: 'string' } } }
const FIX_SCHEMA = { type: 'object', required: ['status', 'summary'], properties: {
  status: { type: 'string', enum: ['pr_open', 'not_reproducible', 'blocked_locked', 'blocked_permission', 'failed'] },
  pr: { type: 'integer' }, branch: { type: 'string' }, files: { type: 'array', items: { type: 'string' } },
  needsPermission: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } } }
const REVIEW_SCHEMA = { type: 'object', required: ['pass', 'findings'], properties: {
  pass: { type: 'boolean' }, findings: { type: 'array', items: { type: 'object', properties: {
    severity: { type: 'string', enum: ['low', 'med', 'high', 'critical'] }, where: { type: 'string' }, problem: { type: 'string' } } } } } }
const LAND_SCHEMA = { type: 'object', required: ['status'], properties: {
  status: { type: 'string', enum: ['merged', 'ci_red', 'conflict', 'blocked'] }, failing: { type: 'array', items: { type: 'string' } },
  logTail: { type: 'string' }, mainRed: { type: 'boolean' }, issueClosed: { type: 'boolean' } } }
const DONE_SCHEMA = { type: 'object', required: ['done'], properties: { done: { type: 'array', items: { type: 'integer' } }, notes: { type: 'string' } } }

// ---- Classify, then verify each close or covered verdict (pipeline: no barrier between the two) ----
phase('Classify')
const classified = await pipeline(ISSUES,
  (n) => ag([
    `You classify GitHub issue #${n} (gh issue view ${n} -R ${REPO} --comments). Never edit files, never comment, never close.`,
    CONTEXT,
    `Check the issue against origin/main as it is now, in the two-theme app. Also grep the spec for "#${n}" (git -C ${MAIN} show origin/main:${SPEC} | grep -n "#${n}") and read the pending tickets' spec sections that touch the same files.`,
    'Verdicts:',
    '- close_superseded: what the issue describes no longer exists on origin/main, or a merged decision replaced it. If the underlying problem would still show in the two-theme app (a clipped label, a wrapped box, a glaring bar, a print palette), it is NOT superseded.',
    '- close_fixed: already fixed on origin/main; cite the file:line, test or merged PR.',
    '- covered_by_pending: a pending ticket\'s spec section explicitly delivers this fix (quote the line); name the ticket.',
    '- fix_now: still real and an agent can fix it without production access. List every file the fix changes (tests included), which of them are in the locked list, and the pending tickets holding those.',
    '- owner_only: only if it truly needs production data, a secret or a paid account. An issue that asks the owner to decide is NOT owner_only: the owner told us to take the best option, so choose it (say which in decision) and classify by what that option needs.',
    'Return JSON per the schema; evidence must quote file:line or a spec/ADR line.',
  ].join('\n'), { label: `classify:#${n}`, phase: 'Classify', schema: CLASSIFY_SCHEMA, model: 'sonnet', effort: 'medium' }),
  async (c, n) => {
    if (!c) return null
    if (!['close_superseded', 'close_fixed', 'covered_by_pending'].includes(c.verdict)) return c
    const v = await ag([
      `Refuter for issue #${n} (gh issue view ${n} -R ${REPO} --comments). Never edit files, never comment, never close.`,
      CONTEXT,
      `A classifier says: ${c.verdict}. Evidence: ${c.evidence}${c.ticket ? `. Ticket: ${c.ticket}` : ''}.`,
      c.verdict === 'covered_by_pending'
        ? `Try to show that ticket ${c.ticket}'s spec section does NOT deliver this fix (quote its Change list and Done when). If you refute it, list the files the fix needs and a plan.`
        : 'Try to show the problem is still real on origin/main in the two-theme app: find the code path, the value or the screen where it still happens. If you refute it, list the files the fix needs and a plan.',
      'refuted = true only with concrete evidence (file:line, a value, a spec line).',
    ].join('\n'), { label: `verify:#${n}`, phase: 'Verify', schema: VERDICT_SCHEMA, model: 'sonnet', effort: 'medium' })
    if (v && v.refuted) return { ...c, verdict: 'fix_now', evidence: `refuted ${c.verdict}: ${v.evidence}`, files: v.files || [], plan: v.plan || '', lockedFiles: [], refutedFrom: c.verdict }
    return { ...c, verified: !!v }
  })
const results = classified.filter(Boolean)
const missing = ISSUES.filter((n) => !results.some((r) => r.issue === n))
if (missing.length) log(`no classification for: ${missing.map((n) => '#' + n).join(' ')}`)

// ---- Group fix_now issues by shared files; a group with a locked file waits for the end-of-build sweep ----
const lockedText = A.lockedPaths || []
const isLocked = (f) => lockedText.some((p) => p.endsWith('/*') || p.endsWith('/') ? f.startsWith(p.replace(/\*$/, '')) : f === p)
const fixes = results.filter((r) => r.verdict === 'fix_now')
const groups = []
for (const r of fixes) {
  const files = new Set(r.files || [])
  const hit = groups.find((g) => [...files].some((f) => g.files.has(f)))
  if (hit) { hit.issues.push(r); files.forEach((f) => hit.files.add(f)) }
  else groups.push({ issues: [r], files })
}
const deferred = [], ready = []
for (const g of groups) {
  const lockedHere = [...g.files].filter(isLocked).concat(...g.issues.map((r) => r.lockedFiles || []))
  if (lockedHere.length) deferred.push({ issues: g.issues.map((r) => r.issue), reason: `needs locked files: ${[...new Set(lockedHere)].join(', ')}`, waitsFor: [...new Set(g.issues.flatMap((r) => r.waitsFor || []))] })
  else ready.push(g)
}
log(`classified ${results.length}: ${results.filter((r) => r.verdict.startsWith('close')).length} to close, ${results.filter((r) => r.verdict === 'covered_by_pending').length} covered by pending tickets, ${ready.length} fix groups now, ${deferred.length} fix groups wait for locked files, ${results.filter((r) => r.verdict === 'owner_only').length} owner-only`)

// ---- Fix lanes: at most PORTS.length at once ----
async function fixLane(g, port) {
  const nums = g.issues.map((r) => r.issue)
  const tag = nums.join('-')
  const branch = `triage/${tag}`
  const brief = g.issues.map((r) => `#${r.issue}: ${r.plan || ''}${r.decision ? ` Decision taken: ${r.decision}` : ''} (evidence: ${r.evidence})`).join('\n')
  let impl = await ag([
    `You fix ${nums.map((n) => '#' + n).join(', ')} in one PR to main. Read each issue (gh issue view <n> -R ${REPO} --comments).`,
    CONTEXT,
    `Read ${RUN}/lane-brief.md and follow its Hard rules, the Implementer procedure steps 1-5 and 7-8 (branch, read, tdd skill, gates, evidence, merge main, PR), the Screenshot upload section and the permission rules. Ignore the ticket-specific parts (critic inputs, Resolved gaps for other tickets).`,
    `In your own worktree: git fetch origin && git switch -C ${branch} origin/main, then npm ci --allow-remote=all --no-audit --no-fund. Your E2E_PORT is ${port}. Never edit a file in ${LOCKED}; if the fix needs one, stop and return blocked_locked.`,
    `What the classifier found:\n${brief}\nFiles expected: ${[...g.files].join(', ') || 'find them'}.`,
    'Test-first where a seam shows it (a failing test that reproduces the issue, then the fix). For a visual issue, take before/after screenshots at the issue\'s viewport in Light and Dark and upload them.',
    `If on a fresh look the issue is not reproducible on origin/main, return not_reproducible with evidence in summary and open no PR.`,
    `PR: title "Fix ${nums.map((n) => '#' + n).join(', ')}: <short what>", body with Summary, Tests red -> green, Screenshots (if UI), and one "Closes #N" line per issue, each alone on its own line. No auto-merge.`,
    'Return JSON: status, pr, branch, files, needsPermission, summary (3 sentences).',
  ].join('\n\n'), { label: `fix:${tag}`, phase: 'Fix', schema: FIX_SCHEMA, model: 'sonnet', effort: 'medium', isolation: 'worktree' })
  if ((!impl || impl.status === 'failed') && !limitHit) impl = await ag(`An earlier attempt to fix ${nums.map((n) => '#' + n).join(', ')} did not finish: ${impl ? impl.summary : 'it stopped without a result'}. If origin/${branch} exists, continue from it.\n\n` + CONTEXT + `\n\nFollow ${RUN}/lane-brief.md as the first attempt did (Hard rules, Implementer procedure 1-5 and 7-8, Screenshot upload). Worktree: git fetch origin && git switch -C ${branch} origin/${branch} 2>/dev/null || git switch -C ${branch} origin/main; npm ci --allow-remote=all --no-audit --no-fund; E2E_PORT=${port}. Findings:\n${brief}\nPR title "Fix ${nums.map((n) => '#' + n).join(', ')}: <short what>", one "Closes #N" line per issue, no auto-merge. Return JSON: status, pr, branch, files, needsPermission, summary.`,
    { label: `fix:${tag}:retry`, phase: 'Fix', schema: FIX_SCHEMA, model: 'opus', effort: 'medium', isolation: 'worktree' })
  if (!impl) return { nums, outcome: limitHit ? 'paused' : 'failed', reason: 'the fixer stopped twice' }
  if (impl.status === 'not_reproducible') return { nums, outcome: 'not_reproducible', reason: impl.summary }
  if (impl.status !== 'pr_open' || !impl.pr) return { nums, outcome: impl.status === 'blocked_locked' ? 'deferred' : 'failed', reason: impl.summary, needsPermission: impl.needsPermission }
  const pr = impl.pr

  const rv = await ag([
    `Review PR #${pr} (gh pr view ${pr} -R ${REPO}; gh pr diff ${pr} -R ${REPO}) against the issues it closes: ${nums.map((n) => '#' + n).join(', ')}. Never edit files.`,
    CONTEXT,
    'Check: does the diff fix what each issue describes (not just a symptom), do the tests fail without the fix, does it break anything nearby, does it follow the repo\'s CLAUDE.md and docs/agents rules. Severity high or med only for a real defect; style nits are low.',
    'Return JSON: pass, findings[] with severity, where, problem.',
  ].join('\n\n'), { label: `review:#${pr}`, phase: 'Fix', schema: REVIEW_SCHEMA, model: 'sonnet', effort: 'medium' })
  const serious = rv ? (rv.findings || []).filter((f) => f.severity !== 'low') : []
  if (serious.length) await ag([
    `Fix the review findings on PR #${pr} (branch ${branch}): ${JSON.stringify(serious)}`,
    CONTEXT,
    `Follow ${RUN}/lane-brief.md "Fix procedure". In your own worktree: git fetch origin && git switch -C ${branch} origin/${branch}; npm ci --allow-remote=all --no-audit --no-fund; E2E_PORT=${port}. Gates again, push once.`,
    'Return JSON: status (pr_open when pushed), pr, summary.',
  ].join('\n\n'), { label: `fix-review:#${pr}`, phase: 'Fix', schema: FIX_SCHEMA, model: 'sonnet', effort: 'medium', isolation: 'worktree' })

  for (let attempt = 0; attempt < 3; attempt++) {
    const l = await ag([
      `Land PR #${pr} (it closes ${nums.map((n) => '#' + n).join(', ')}). Read ${RUN}/lane-brief.md, section "Lander procedure", and follow it exactly. Never edit code. After the merge, confirm each of ${nums.map((n) => '#' + n).join(', ')} is closed; close any that is still open with "Fixed by #${pr}, merged into main."`,
      'Return JSON: status, failing, logTail, mainRed, issueClosed.',
    ].join('\n\n'), { label: `land:#${pr}`, phase: 'Fix', schema: LAND_SCHEMA, model: 'haiku' })
    if (l && l.status === 'merged') return { nums, outcome: 'merged', pr }
    if (attempt === 2 || limitHit) break
    await ag([
      `PR #${pr} (branch ${branch}) did not land: ${l ? l.status : 'no result'}. Failing: ${l && l.failing ? l.failing.join(', ') : 'n/a'}.\nLog tail:\n${l ? (l.logTail || '').slice(-3000) : ''}`,
      CONTEXT,
      `Follow ${RUN}/lane-brief.md "CI fixer and merger". In your own worktree: git fetch origin && git switch -C ${branch} origin/${branch}; npm ci --allow-remote=all --no-audit --no-fund; E2E_PORT=${port}.`,
      'Return JSON: status (pr_open when pushed), pr, summary.',
    ].join('\n\n'), { label: `repair:#${pr}`, phase: 'Fix', schema: FIX_SCHEMA, model: attempt === 0 ? 'sonnet' : 'opus', effort: 'medium', isolation: 'worktree' })
  }
  return { nums, outcome: limitHit ? 'paused' : 'failed', reason: 'did not land after two repairs', pr }
}

phase('Fix')
const fixResults = []
const queue = [...ready]
await parallel(PORTS.map((port) => async () => {
  while (queue.length && !limitHit) fixResults.push(await fixLane(queue.shift(), port))
}))
for (const g of queue) deferred.push({ issues: g.issues.map((r) => r.issue), reason: 'not started (breaker)' })

// ---- Close what is verified closed; comment on everything that waits ----
phase('Close')
const closeActions = results.filter((r) => (r.verdict === 'close_superseded' || r.verdict === 'close_fixed') && r.verified)
const waitNotes = [
  ...results.filter((r) => r.verdict === 'covered_by_pending').map((r) => ({ issue: r.issue, note: `Covered by pending ticket ${r.ticket} (${r.evidence}). The end-of-build triage sweep checks it after ${r.ticket} merges and fixes anything left.` })),
  ...deferred.flatMap((d) => d.issues.map((n) => ({ issue: n, note: `Fix planned; it waits because ${d.reason}${d.waitsFor && d.waitsFor.length ? ` (held by ${d.waitsFor.join(', ')})` : ''}. The end-of-build triage sweep fixes it once those merge.` }))),
  ...fixResults.filter((f) => f.outcome !== 'merged' && f.outcome !== 'not_reproducible').flatMap((f) => f.nums.map((n) => ({ issue: n, note: `A fix attempt did not finish (${f.outcome}: ${f.reason}${f.pr ? `, PR #${f.pr}` : ''}). The end-of-build triage sweep retries it.` }))),
  ...results.filter((r) => r.verdict === 'owner_only').map((r) => ({ issue: r.issue, note: `Needs the owner: ${r.evidence}` })),
]
const notRepro = fixResults.filter((f) => f.outcome === 'not_reproducible').flatMap((f) => f.nums.map((n) => ({ issue: n, evidence: f.reason })))
let closed = { done: [] }
if (!limitHit && (closeActions.length || waitNotes.length || notRepro.length)) {
  closed = await ag([
    `You update GitHub issues in ${REPO}. Never edit code. Write each comment to a file under ${RUN}/tmp/ first and pass it with --body-file (or --comment for gh issue close via a file read).`,
    `Close each of these with a comment that gives the reason and the evidence (start the comment with "Triage sweep:"):\n${JSON.stringify(closeActions.map((r) => ({ issue: r.issue, reason: r.verdict === 'close_fixed' ? 'Already fixed on main.' : (r.issue === 271 || (r.issue >= 312 && r.issue <= 320) ? 'Superseded by the two-theme decision (ADR 0012, spec 2026-11-05).' : 'Superseded.'), evidence: r.evidence, decision: r.decision || '' })))}`,
    `Close each of these as not reproducible on main, with the evidence:\n${JSON.stringify(notRepro)}`,
    `Leave these OPEN and add one comment each (start with "Triage sweep:"):\n${JSON.stringify(waitNotes)}`,
    'Use gh issue close <n> -R ' + REPO + ' --comment "$(cat <file>)" and gh issue comment <n> -R ' + REPO + ' --body-file <file>. Return JSON: done (issue numbers you closed or commented on), notes.',
  ].join('\n\n'), { label: 'close-and-annotate', phase: 'Close', schema: DONE_SCHEMA, model: 'haiku' }) || { done: [] }
}

return {
  pass: PASS,
  classified: results.map((r) => ({ issue: r.issue, verdict: r.verdict, verified: !!r.verified, refutedFrom: r.refutedFrom || null, ticket: r.ticket || null, decision: r.decision || null })),
  fixes: fixResults,
  deferred,
  closedOrCommented: closed.done,
  missing,
  limitHit,
}
