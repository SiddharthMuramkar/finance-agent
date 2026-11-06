export const meta = {
  name: 'story-build',
  description: 'Story-first spec: one lane per ticket (implement test-first, critics with refuters, land into main) under hot-file locks, plus goal loop G1',
  phases: [
    { title: 'Implement', detail: 'one isolated worktree per ticket, test-first, PR to main' },
    { title: 'Critics', detail: 'the ticket critics, each finding adversarially refuted' },
    { title: 'Fix', detail: 'confirmed findings, CI repairs, merge conflicts' },
    { title: 'Land', detail: 'wait for check, build and ui; merge; close the issue' },
    { title: 'G1', detail: 'layout and affordance goal loop' },
  ],
}

// ---- Launch state: edited between launches. GitHub is the source of truth (closed issue = merged). ----
const SCOPE = ['A2', 'A5', 'B2a', 'B2b', 'B3b', 'C1b', 'D2b', 'D2c', 'D2d', 'D2e', 'D2f', 'D2g', 'D2h', 'D2i', 'D2j', 'D3b', 'E3', 'E4a', 'E4b', 'E5', 'E6a', 'E6b', 'E6c']
const MERGED = ['T-00', 'T-01', 'A1', 'A3a', 'A3b', 'A4', 'B3a', 'C1a', 'D1a', 'D1b', 'D1c', 'E1', 'E2a', 'D2a', 'B1', 'D3a', 'E2b']
const DROPPED = []
// Content batches whose current head already passed math-police and historian (persona advisory): land without new critic rounds.
const LAND_ONLY = { D2b: 391, D2c: 388 }
const RUN_G1 = true
const MAX_LANES = 6
const CONTENT_MAX = 2
const LEDGER_USD = 0
const SOFT_CAP = 800 // stop starting lanes; running lanes finish (hard workflow cap is 1000 agents)
const HARD_CAP = 980
// -----------------------------------------------------------------------------------------------------

const RUN = '/Users/siddharth/Downloads/finance-agent-story-run'
const SPEC = 'docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md'
const PARENT = 323
const PORT_BASE = 3111
const LEDGER_CAP = 55
const ISSUES = { 'T-00': 324, 'T-01': 325, A1: 326, A3a: 327, A4: 328, B3a: 329, C1a: 330, D1a: 331, E1: 332, A2: 333, A3b: 334, B1: 335, B2a: 336, C1b: 337, D1b: 338, D1c: 339, D3a: 340, E2a: 341, A5: 342, B2b: 343, D2a: 344, D2b: 345, D2c: 346, D2d: 347, D2e: 348, D2f: 349, D2g: 350, D2h: 351, D2i: 352, D2j: 353, D3b: 354, E2b: 355, E5: 356, C3: 357, B3b: 358, E3: 359, E4b: 360, E4a: 361, E6a: 362, E6b: 363, E6c: 364, F1: 365, F2: 366, C2: 367, H1: 368 }
const D2 = ['D2a', 'D2b', 'D2c', 'D2d', 'D2e', 'D2f', 'D2g', 'D2h', 'D2i', 'D2j']
const E6 = ['E6a', 'E6b', 'E6c']
const DEPS = { A1: [], A2: ['A1'], A3a: [], A3b: ['A3a'], A4: [], A5: ['A3b', 'A4', 'B2a'], B1: ['A1'], B2a: ['A1'], B2b: ['B2a'], B3a: [], B3b: ['B3a', 'A5', 'B2a'], C1a: [], C1b: ['C1a', 'A3a'], C3: ['C2'], D1a: [], D1b: ['D1a'], D1c: ['D1a'], D3a: ['D1a', 'E1'], D3b: ['D3a'], E1: [], E2a: ['E1', 'A4'], E2b: ['E2a'], E3: ['E2b'], E4a: ['E3', 'D3a', 'D3b'], E4b: ['D3b'], E5: ['A1', 'E2a'] }
for (const id of D2) DEPS[id] = ['D1b']
for (const id of E6) DEPS[id] = ['E3', 'D1b']
const W0 = ['T-00', 'T-01']
const depsOf = (id) => (id === 'T-00' || id === 'T-01' || id === 'C3') ? (DEPS[id] || []) : [...W0, ...(DEPS[id] || [])]

const ORDER = {
  pkg: ['T-00', 'C1a', 'E4b'],
  nextcfg: ['T-00', 'B1', 'B2a'],
  cipw: ['T-00', 'C1b'],
  schema: ['C1a', 'B3a', 'E4a'],
  globals: ['A4', 'A3a', 'A1', 'E2a', 'A2', 'E5'],
  ui: ['A3a', 'A1', 'A3b', 'A2', 'A5', 'C1b'],
  frame: ['A1', 'A2', 'E5', 'B3b'],
  leftcol: ['A1', 'D3a', 'A2'],
  thread: ['A3a', 'A1', 'A2'],
  widgetpanel: ['A1', 'A3b', 'A2', 'B2b', 'E5'],
  pager: ['A3a', 'A2', 'E5'],
  savenotes: ['A3a', 'B2b'],
  wsparts: ['A3b', 'D3a', 'B3b'],
  practiceui: ['D1a', 'A3b'],
  settingsview: ['E1', 'A4', 'A5', 'C1b', 'B3b'],
  themectl: ['A4', 'A3b', 'A5'],
  accountmenu: ['A5', 'C1b'],
  auth: ['C1a', 'C1b', 'C3'],
  instructions: ['D3a', 'D3b', 'E3', 'E4a'],
  replychecks: ['D3a', 'E4a'],
  tools: ['D3a', 'B2b', 'E3', 'E4a'],
  turn: ['D3a', 'E4a'],
  practice: ['D1a', 'E4a'],
  lint: ['E1', 'D1b', 'E3'],
  widgetlib: ['D1c', 'E2a', 'E2b', 'E3'],
  notesold: ['A3b', 'B2a'],
  coursemap: ['A3b', 'B1'],
  notebook: ['B2a', 'B3b'],
  oldsession: ['A1', 'B2a'],
  recipes: ['E3', 'E4a'],
}
const GROUP_FILES = {
  pkg: 'package.json, package-lock.json', nextcfg: 'next.config.ts', cipw: '.github/workflows/ci.yml, playwright.config.ts',
  schema: 'src/db/schema.ts, drizzle/', globals: 'src/app/globals.css', ui: 'src/app/ui.tsx',
  frame: 'src/app/workspace-frame.tsx, src/app/topic-header.tsx', leftcol: 'src/app/left-column.tsx',
  thread: 'src/app/thread.tsx, src/app/message-box.tsx', widgetpanel: 'src/app/widget-panel.tsx', pager: 'src/app/widget-pager.tsx',
  savenotes: 'src/app/save-to-notes.tsx', wsparts: 'src/app/workspace-parts.tsx',
  practiceui: 'src/app/quick-try-view.tsx, src/app/quiz-panel.tsx, src/app/review-panel.tsx',
  settingsview: 'src/app/settings/settings-view.tsx', themectl: 'src/app/settings/settings-controls.tsx, src/app/theme-menu.tsx, src/app/theme.ts',
  accountmenu: 'src/app/account-menu.tsx, src/app/primitives/menu.tsx', auth: 'src/proxy.ts, src/auth/learners.ts, src/auth/session.ts, src/app/login/page.tsx',
  instructions: 'src/tutor/instructions.ts', replychecks: 'src/tutor/reply-checks.ts', tools: 'src/tutor/tools.ts',
  turn: 'src/tutor/turn.ts, src/app/api/turn/route.ts', practice: 'src/tutor/practice.ts', lint: 'src/course/lesson-lint.ts, scripts/check-course.mjs',
  widgetlib: 'src/widgets/library.tsx, src/widgets/frozen.generated.json, src/widgets/primitives/wave2/*, src/widgets/recipes/set-tutor.ts',
  notesold: 'src/app/past-sessions.tsx, src/app/notes/*', coursemap: 'src/app/course/course-map-view.tsx',
  notebook: 'src/learner/notebook.ts, src/app/notebook/*', oldsession: 'src/app/old-session.tsx',
  recipes: 'src/widgets/recipes/index.ts, src/tutor/ready-made-widgets.ts, src/widgets/recipes/define.ts',
}
const GROUPS_OF = {}
for (const [g, order] of Object.entries(ORDER)) for (const id of order) (GROUPS_OF[id] = GROUPS_OF[id] || []).push(g)

const OPUS = new Set(['T-00', 'C1a', 'C1b', 'D3a', 'D3b', 'E4a'])
const PAID_CI = new Set(['B2b', 'D3a', 'D3b', 'E3', 'E4a', ...D2, ...E6])
const CONTENT = new Set([...D2, ...E6])
const OPUS_PERSONA = new Set(['D3b', 'E6a'])
const HISTORIAN_OPUS = new Set(['D2c', 'D2e', 'D2f', 'D2h', ...E6])
const CRITICS = {
  A4: ['colour-liveliness'], A3b: ['affordance'], A1: ['space'], A2: ['space', 'affordance'], A5: ['affordance', 'space'],
  B1: ['space', 'affordance'], B2a: ['space', 'affordance', 'beginner-persona'], B2b: ['beginner-persona'], B3a: ['security'], B3b: ['affordance'],
  C1a: ['security'], C1b: ['security', 'affordance'], C3: ['security', 'beginner-persona'],
  D1a: ['math-police', 'affordance'], D1b: ['math-police'], D1c: ['math-police', 'affordance'], D3a: ['affordance', 'math-police'], D3b: ['beginner-persona', 'math-police'],
  E1: ['colour-liveliness'], E2a: ['colour-liveliness', 'affordance', 'widget-fit'], E2b: ['colour-liveliness', 'affordance', 'widget-fit'],
  E3: ['historian', 'math-police'], E4a: ['widget-fit', 'math-police'], E5: ['space', 'affordance', 'colour-liveliness'],
}
for (const id of D2) CRITICS[id] = ['math-police', 'historian', 'beginner-persona']
for (const id of E6) CRITICS[id] = ['historian', 'math-police', 'beginner-persona']
const G1_SET = ['A1', 'A2', 'A3a', 'A3b', 'A4', 'A5', 'B1', 'B2a', 'B2b', 'B3a', 'B3b', 'E5', 'C1b']
const G1_GROUPS = ['ui', 'globals', 'frame', 'leftcol', 'thread', 'widgetpanel', 'pager', 'wsparts', 'practiceui', 'settingsview', 'themectl', 'accountmenu', 'coursemap', 'notebook', 'oldsession', 'savenotes']

const IMPL_SCHEMA = { type: 'object', required: ['status', 'summary'], properties: {
  status: { type: 'string', enum: ['pr_open', 'ready_to_push', 'blocked_spec', 'blocked_permission', 'needs_split', 'needs_hot_file', 'failed'] },
  pr: { type: 'integer' }, branch: { type: 'string' }, worktree: { type: 'string' }, headSha: { type: 'string' }, hotFile: { type: 'string' },
  needsPermission: { type: 'array', items: { type: 'string' } }, spendUsd: { type: 'number' }, summary: { type: 'string' } } }
const CRITIC_SCHEMA = { type: 'object', required: ['pass', 'findings'], properties: {
  pass: { type: 'boolean' }, scores: { type: 'object' }, raw: { type: 'object' },
  findings: { type: 'array', items: { type: 'object', required: ['id', 'severity', 'problem'], properties: {
    id: { type: 'string' }, severity: { type: 'string', enum: ['low', 'med', 'high', 'critical'] }, where: { type: 'string' },
    problem: { type: 'string' }, evidence: { type: 'string' }, highStakes: { type: 'boolean' } } } } } }
const VERDICT_SCHEMA = { type: 'object', required: ['refuted', 'evidence'], properties: { refuted: { type: 'boolean' }, evidence: { type: 'string' } } }
const FIX_SCHEMA = { type: 'object', required: ['pushed', 'summary'], properties: {
  pushed: { type: 'boolean' }, pr: { type: 'integer' }, worktree: { type: 'string' }, fixed: { type: 'array', items: { type: 'string' } },
  triaged: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } } }
const PR_SCHEMA = { type: 'object', required: ['pr'], properties: { pr: { type: 'integer' } } }
const LAND_SCHEMA = { type: 'object', required: ['status'], properties: {
  status: { type: 'string', enum: ['merged', 'ci_red', 'conflict', 'blocked'] }, failing: { type: 'array', items: { type: 'string' } },
  logTail: { type: 'string' }, mainRed: { type: 'boolean' }, issueClosed: { type: 'boolean' }, mergeSha: { type: 'string' } } }
const MEASURE_SCHEMA = { type: 'object', required: ['pass', 'dir'], properties: {
  pass: { type: 'boolean' }, dir: { type: 'string' }, failing: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } } }
const MAINFIX_SCHEMA = { type: 'object', required: ['fixed', 'summary'], properties: { fixed: { type: 'boolean' }, pr: { type: 'integer' }, summary: { type: 'string' } } }

const BRIEF = `Read ${RUN}/lane-brief.md first, all of it, and follow it.`

const merged = new Set(MERGED), dropped = new Set(DROPPED)
const reasons = {}, prs = {}, worktreeOf = {}, requeues = {}
const running = new Map(), held = new Map()
const slots = Array.from({ length: MAX_LANES }, (_, i) => i)
let ledger = LEDGER_USD, stopReason = null, mainRed = false, mainFixTries = 0, g1Started = !RUN_G1
const triage = [], needsPermission = [], g1Log = []

// Usage-limit breaker: agent() returns null when a subagent dies on a terminal API error,
// so a run of nulls means the account is out. Tickets caught by it are paused, not set aside.
let nullStreak = 0, agentCount = 0, limitHit = false, noNewLanes = false
const paused = []
async function ag(prompt, opts) {
  if (limitHit) return null
  agentCount++
  if (agentCount >= SOFT_CAP && !noNewLanes) { noNewLanes = true; log(`agent count ${agentCount}: no new lanes; relaunch to continue`) }
  if (agentCount >= HARD_CAP) { limitHit = true; stopReason = stopReason || `agent cap (${agentCount} of 1000)`; log(`BREAKER: ${stopReason}`); return null }
  const r = await agent(prompt, opts)
  if (r == null) {
    if (++nullStreak >= 4 && !limitHit) { limitHit = true; stopReason = stopReason || `usage limit suspected: ${nullStreak} agents in a row returned nothing`; log(`BREAKER: ${stopReason}`) }
  } else nullStreak = 0
  return r
}

const SUCC = {}
const addEdge = (a, b) => { (SUCC[a] = SUCC[a] || new Set()).add(b) }
for (const id of Object.keys(ISSUES)) for (const d of depsOf(id)) addEdge(d, id)
for (const order of Object.values(ORDER)) for (let i = 1; i < order.length; i++) addEdge(order[i - 1], order[i])
const LP = {}
function lp(id) {
  if (LP[id] != null) return LP[id]
  LP[id] = 0
  let m = 0
  for (const s of (SUCC[id] || [])) m = Math.max(m, lp(s))
  LP[id] = 1 + m
  return LP[id]
}

function dead(id, seen) {
  if (merged.has(id)) return false
  if (dropped.has(id) || !SCOPE.includes(id)) return true
  seen = seen || new Set()
  if (seen.has(id)) return false
  seen.add(id)
  return depsOf(id).some((d) => dead(d, seen))
}
function lockFree(id) {
  for (const g of (GROUPS_OF[id] || [])) {
    if (held.has(g)) return false
    const order = ORDER[g]
    for (const p of order.slice(0, order.indexOf(id))) if (!merged.has(p) && !dead(p)) return false
  }
  return true
}
function isReady(id) {
  if (!SCOPE.includes(id) || merged.has(id) || dropped.has(id) || running.has(id)) return false
  if (!depsOf(id).every((d) => merged.has(d))) return false
  return lockFree(id)
}
function heldList(me) {
  const out = []
  for (const [g, owner] of held) if (owner !== me) out.push(`${GROUP_FILES[g]} (held by ${owner})`)
  return out.length ? out.join('; ') : 'none'
}

async function implement(id, port, model, previous) {
  const paid = PAID_CI.has(id)
  const crit = CRITICS[id] || []
  const own = (GROUPS_OF[id] || []).map((g) => GROUP_FILES[g]).join('; ')
  const prompt = [
    `You are the implementer for ticket ${id} (GitHub issue #${ISSUES[id]}) of the story-first spec (parent issue #${PARENT}). The owner is asleep: work alone, decide within the spec and the brief.`,
    BRIEF,
    `Your ticket is the section "### ${id} · …" of ${SPEC}. Your E2E_PORT is ${port}. Your branch is story/${id}.`,
    `HELD files (other running lanes own them; do not edit): ${heldList(id)}.`,
    `Hot files you own now: ${own || "only your ticket's own new files"}.`,
    crit.length ? `Your critics (your caller runs them after you return): ${crit.join(', ')}. Write their inputs to ${RUN}/critics/${id}/ as the brief says.` : 'Your ticket has no critics.',
    paid
      ? `This is a Tutor/Topic ticket: GitHub runs a paid eval on every push to an open PR. Push your branch as you go (a branch without a PR runs no CI), write the full PR body to ${RUN}/critics/${id}/pr-body.md, and do NOT open the PR. Return status "ready_to_push".`
      : 'Push your branch after each green commit (a branch without a PR runs no CI). When the gates pass, open the PR as the brief says (no auto-merge) and return status "pr_open" with the PR number.',
    id === 'D3b' && ledger < LEDGER_CAP - 16
      ? 'Paid budget granted: at most 2 tutor:eval runs at $8 each (brief: Resolved gaps, D3b). Put the total spend in spendUsd.'
      : 'You have no paid budget: never run a paid eval and never use an API key.',
    `If an open PR already exists for story/${id} (gh pr list --head story/${id} --state open), this is a resumed lane: continue from the branch, apply the brief's newest Resolved gaps and Known issues, regenerate the critic inputs from the current branch, push, and return status "pr_open" with that PR's number (even for a Tutor/Topic ticket, and even if it is a draft).`,
    previous ? `An earlier attempt at this ticket did not finish: ${previous}. If origin/story/${id} exists, continue from it; do not start over.` : '',
    'Return JSON: status, pr (if open), branch, worktree (absolute path from pwd), headSha, needsPermission, hotFile (only for needs_hot_file), spendUsd, summary (3 sentences: what you built, the key numbers, anything left).',
  ].filter(Boolean).join('\n\n')
  return ag(prompt, { label: `implement:${id}${previous ? ':retry' : ''}`, phase: 'Implement', schema: IMPL_SCHEMA, model, effort: 'medium', isolation: 'worktree' })
}

function criticPrompt(id, name, round) {
  return [
    `You are the ${name} critic (spec §8) for ticket ${id} (issue #${ISSUES[id]}), round ${round}. Never edit files.`,
    `${BRIEF} Use its "Critic procedure".`,
    `Your rubric, output shape and pass bar: ${RUN}/critics-prompts/${name}.md. The ticket's own "Critic check" line in ${SPEC} (section "### ${id} · …") names the pages, inputs and bar for this ticket. Read the spec from ${worktreeOf[id] || 'the branch origin/story/' + id}.`,
    `Inputs: ${RUN}/critics/${id}/ (screenshots, files.txt, diff.patch, persona-input.md, transcripts) and the lane's working tree ${worktreeOf[id] || '(read the branch origin/story/' + id + ' with git show)'}. Read images with the Read tool.`,
    `Judge the LATEST push only: run git fetch origin, and if the working tree's HEAD differs from origin/story/${id}, read files with git show origin/story/${id}:<path> instead of from disk.`,
    'Return JSON: pass (the ticket\'s bar is met), scores, raw (your critic\'s own JSON), findings[] with id, severity, where, problem, evidence, highStakes.',
  ].join('\n\n')
}

async function verify(id, critic, f) {
  const high = (critic === 'security' && f.severity !== 'low') || f.severity === 'critical' // lean: 3 votes only here
  const n = high ? 3 : 1
  const model = (critic === 'historian' && HISTORIAN_OPUS.has(id)) || (critic === 'security' && f.severity === 'critical') ? 'opus' : 'sonnet'
  const votes = await parallel(Array.from({ length: n }, (_, k) => () => ag([
    `You are refuter ${k + 1} of ${n} for a ${critic} finding on ticket ${id} (issue #${ISSUES[id]}). Fresh eyes: try to show the finding is WRONG. Never edit files.`,
    `${BRIEF} Use its "Refuter procedure".`,
    `Finding: ${JSON.stringify(f)}`,
    `Evidence: ${RUN}/critics/${id}/, the lane's working tree ${worktreeOf[id] || '(branch origin/story/' + id + ')'}, the spec ${SPEC}, and the critic rubric ${RUN}/critics-prompts/${critic}.md. Judge the latest push: git fetch origin, then read from origin/story/${id} (git show origin/story/${id}:<path>) when the working tree is behind it.`,
    'Return refuted (true only with concrete evidence: file:line, a measurement or a spec line) and evidence.',
  ].join('\n\n'), { label: `refute:${critic}:${id}`, phase: 'Critics', schema: VERDICT_SCHEMA, model, effort: 'medium' })))
  const notRefuted = votes.filter(Boolean).filter((v) => !v.refuted).length
  return n === 1 ? notRefuted === 1 : notRefuted >= 2
}

async function criticRound(id, round) {
  const names = CRITICS[id] || []
  const results = await parallel(names.map((name) => async () => {
    const judge = name === 'beginner-persona' && OPUS_PERSONA.has(id)
    const c = await ag(criticPrompt(id, name, round), { label: `critic:${name}:${id}`, phase: 'Critics', schema: CRITIC_SCHEMA, model: judge ? 'opus' : 'sonnet', effort: 'medium' })
    if (!c) return { name, pass: true, skipped: true, confirmed: [], scores: {} }
    const all = c.findings || []
    const checked = all.slice(0, 5)
    if (all.length > 5) log(`${id} ${name}: refuting 5 of ${all.length} findings; ${all.length - 5} listed unverified in the PR`)
    const verdicts = await parallel(checked.map((f) => () => verify(id, name, f)))
    const confirmed = checked.filter((f, i) => verdicts[i])
    if (name === 'security' && confirmed.some((f) => f.severity === 'critical')) stopReason = `critical security finding confirmed on ${id}`
    return { name, pass: !!c.pass, scores: c.scores || {}, confirmed, unverified: all.slice(5) }
  }))
  return results.filter(Boolean)
}

function criticSummary(results) {
  if (!results || !results.length) return 'Critics: none for this ticket.'
  return 'Critics (spec §8, each finding adversarially refuted):\n' + results.map((c) =>
    `- ${c.name}: ${c.skipped ? 'did not run' : (c.pass ? 'pass' : 'below bar')}; ${c.confirmed.length} confirmed finding(s)${c.unverified && c.unverified.length ? `, ${c.unverified.length} unverified` : ''}; scores ${JSON.stringify(c.scores)}`).join('\n')
}

async function fixFindings(id, slot, model, results, round, publish) {
  const items = results.filter((c) => !c.pass || c.confirmed.length).map((c) => ({ critic: c.name, pass: c.pass, scores: c.scores, confirmed: c.confirmed }))
  const prompt = [
    `You fix the critics' confirmed findings for ticket ${id} (issue #${ISSUES[id]}), fix round ${round}.`,
    `${BRIEF} Use its "Fix procedure".`,
    `In your own worktree: git fetch origin && git switch -C story/${id} origin/story/${id}, then npm ci --allow-remote=all --no-audit --no-fund. Your E2E_PORT is ${PORT_BASE + slot}. HELD files: ${heldList(id)}.`,
    `What to fix (critic results; scores below bar count too): ${JSON.stringify(items)}`,
    round >= 2 || !CONTENT.has(id) ? 'This is the last fix round: anything you cannot fix becomes a needs-triage sub-issue of #323 (brief: Fix procedure).' : 'If something cannot be fixed, say why in summary; your caller decides.',
    publish
      ? `The PR is not open yet (a Tutor/Topic ticket). After the fixes and gates, push once, then open the PR with ${RUN}/critics/${id}/pr-body.md as the body plus this section:\n${criticSummary(results)}\nNo auto-merge. Return its number as pr.`
      : `The PR #${prs[id]} is open: push your fixes once (for a Tutor/Topic ticket this triggers one paid eval) and return pr ${prs[id]}.`,
    `After the fixes, regenerate every critic input in ${RUN}/critics/${id}/ from your fixed tree (diff.patch against origin/main, files.txt, persona-input.md, screenshots whose page you changed), so the next critic round judges the fixed work.`,
    'Return JSON: pushed, pr, worktree (absolute path from pwd), fixed (finding ids), triaged (issue numbers), summary.',
  ].join('\n\n')
  return ag(prompt, { label: `fix:${id}:r${round}`, phase: 'Fix', schema: FIX_SCHEMA, model, effort: 'medium', isolation: 'worktree' })
}

async function publish(id, results) {
  return ag([
    `Open the PR for ticket ${id} (issue #${ISSUES[id]}). Branch story/${id} is already pushed. Never edit code.`,
    `Title: the issue's title (gh issue view ${ISSUES[id]} --json title -q .title). Body: ${RUN}/critics/${id}/pr-body.md, plus this section appended (write the combined body to ${RUN}/tmp/${id}-body.md):\n${criticSummary(results)}`,
    `Make sure "Closes #${ISSUES[id]}" is alone on its own line. gh pr create --base main --head story/${id} --title ... --body-file ${RUN}/tmp/${id}-body.md. Do NOT enable auto-merge. Return the PR number.`,
  ].join('\n\n'), { label: `publish:${id}`, phase: 'Land', schema: PR_SCHEMA, model: 'haiku' })
}

async function land(id, pr, results, first) {
  return ag([
    `Land PR #${pr} for ticket ${id} (issue #${ISSUES[id]}). Read ${RUN}/lane-brief.md, section "Lander procedure", and follow it exactly. Never edit code. If the PR is a draft, run gh pr ready ${pr} first; if issue #${ISSUES[id]} carries the needs-triage label from an earlier set-aside, remove it (gh issue edit ${ISSUES[id]} --remove-label needs-triage).`,
    first && results && results.length ? `Before waiting, post this as one PR comment (write it to ${RUN}/tmp/${id}-critics.md, then gh pr comment ${pr} --body-file that file):\n${criticSummary(results)}` : '',
    'Return JSON: status, failing, logTail, mainRed, issueClosed, mergeSha.',
  ].filter(Boolean).join('\n\n'), { label: `land:${id}`, phase: 'Land', schema: LAND_SCHEMA, model: 'haiku' })
}

async function repair(id, slot, pr, l, model) {
  return ag([
    `PR #${pr} for ticket ${id} (issue #${ISSUES[id]}, branch story/${id}) did not land: ${l.status}. Failing: ${(l.failing || []).join(', ') || 'n/a'}.`,
    `Log tail:\n${(l.logTail || '').slice(-3000)}`,
    `${BRIEF} Use its "CI fixer and merger" section.`,
    `In your own worktree: git fetch origin && git switch -C story/${id} origin/story/${id}, then npm ci --allow-remote=all --no-audit --no-fund. Your E2E_PORT is ${PORT_BASE + slot}. HELD files: ${heldList(id)}.`,
    'Return JSON: pushed (true if you pushed a fix or started a rerun), summary.',
  ].join('\n\n'), { label: `repair:${id}`, phase: 'Fix', schema: FIX_SCHEMA, model, effort: 'medium', isolation: 'worktree' })
}

async function followUp(id, results) {
  const p = results.find((c) => c.name === 'beginner-persona') || {}
  return ag([
    `Ticket ${id} (issue #${ISSUES[id]}) lands with math-police and historian passing; its beginner-persona critic was below bar, which the owner made advisory for content batches. Never edit code.`,
    `Write ${RUN}/tmp/${id}-persona-followup.md: parent #${PARENT}, source ticket #${ISSUES[id]}, the persona scores, and each finding (id, severity, where, problem) from ${JSON.stringify({ scores: p.scores, confirmed: p.confirmed, unverified: p.unverified })}. Then gh issue create --label needs-triage --title "${id} follow-up: beginner-persona findings to rework" --body-file that file.`,
    'Return the new issue number as pr.',
  ].join('\n\n'), { label: `followup:${id}`, phase: 'Land', schema: PR_SCHEMA, model: 'haiku' })
}

async function giveUp(id, pr, why) {
  return ag([
    `Ticket ${id} (issue #${ISSUES[id]}) is being set aside for the owner: ${why}. Never edit code.`,
    pr ? `Run gh pr ready ${pr} --undo (turn it into a draft), then gh pr comment ${pr} with a 2-line reason.` : '',
    `Add the label: gh issue edit ${ISSUES[id]} --add-label needs-triage. Comment on the issue: what was tried, the reason above, and that its dependants wait. Return pr ${pr || 0}.`,
  ].filter(Boolean).join('\n\n'), { label: `setaside:${id}`, phase: 'Land', schema: PR_SCHEMA, model: 'haiku' })
}

async function lane(id, slot) {
  const port = PORT_BASE + slot
  const tier = OPUS.has(id) ? 'opus' : 'sonnet'
  if (LAND_ONLY[id]) { prs[id] = LAND_ONLY[id]; return landLoop(id, slot, []) }
  let impl = await implement(id, port, tier, null)
  if ((!impl || impl.status === 'failed') && !limitHit) impl = await implement(id, port, 'opus', impl ? impl.summary : 'the agent stopped without a result')
  if (!impl) return { outcome: limitHit ? 'paused' : 'failed', reason: limitHit ? stopReason : 'the implementer stopped twice' }
  if (impl.needsPermission && impl.needsPermission.length) needsPermission.push(...impl.needsPermission.map((p) => `${id}: ${p}`))
  if (impl.spendUsd) ledger += impl.spendUsd
  if (impl.worktree) worktreeOf[id] = impl.worktree
  if (impl.status === 'needs_hot_file') return { outcome: 'requeue', reason: impl.hotFile || 'a held file' }
  if (impl.status !== 'pr_open' && impl.status !== 'ready_to_push') return { outcome: 'deferred', reason: `${impl.status}: ${impl.summary}` }
  if (impl.pr) prs[id] = impl.pr

  let results = []
  if ((CRITICS[id] || []).length) {
    results = await criticRound(id, 1)
    // Fix anything confirmed; but a content batch fails its gate only on a missed bar or a serious confirmed finding.
    // Lean votes let low-severity nits survive refuting, so a low finding never fails the gate on its own; the critic's own pass covers the bar.
    const serious = (c, f) => f.severity === 'high' || f.severity === 'critical' || ((c.name === 'math-police' || (c.name === 'historian' && f.highStakes)) && f.severity !== 'low')
    const gateFails = () => results.some((c) => !c.pass || c.confirmed.some((f) => serious(c, f)))
    // Owner order (6 Nov): beginner-persona is advisory for content batches. Its verdict flips between runs on the same text, and
    // persona-only fix rounds regressed D2a/D2b. It gets fix round 1; its leftovers go to a follow-up issue, not a set-aside.
    const hardFails = () => results.some((c) => c.name !== 'beginner-persona' && (!c.pass || c.confirmed.some((f) => serious(c, f))))
    const failing = (r) => (CONTENT.has(id) ? (r === 1 ? gateFails() : hardFails()) : results.some((c) => !c.pass || c.confirmed.length))
    const rounds = CONTENT.has(id) ? 2 : 1
    for (let r = 1; r <= rounds && failing(r) && !stopReason; r++) {
      const f = await fixFindings(id, slot, r === 1 ? tier : 'opus', results, r, !prs[id])
      if (f && f.pr) prs[id] = f.pr
      if (f && f.worktree) worktreeOf[id] = f.worktree
      if (f && f.triaged) triage.push(...f.triaged.map((t) => `${id}: ${t}`))
      if (CONTENT.has(id)) results = await criticRound(id, r + 1)
    }
    if (CONTENT.has(id) && hardFails()) {
      await giveUp(id, prs[id], `the content gate still fails after a Sonnet and an Opus fix: ${criticSummary(results)}`)
      return { outcome: 'failed', reason: 'content gate (G3) failed twice', pr: prs[id] }
    }
    if (CONTENT.has(id) && gateFails() && !stopReason) {
      const fu = await followUp(id, results)
      if (fu && fu.pr) triage.push(`${id}: ${fu.pr} (persona follow-up)`)
    }
  }
  if (stopReason) return { outcome: 'deferred', reason: stopReason, pr: prs[id] }
  if (!prs[id]) {
    const p = await publish(id, results)
    if (p && p.pr) prs[id] = p.pr
  }
  if (!prs[id]) return { outcome: 'failed', reason: 'no PR was opened' }
  return landLoop(id, slot, results)
}

async function landLoop(id, slot, results) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const l = await land(id, prs[id], results, attempt === 0)
    if (l && l.mainRed) mainRed = true
    if (l && l.status === 'merged') return { outcome: 'merged', pr: prs[id] }
    if (attempt === 2) break
    await repair(id, slot, prs[id], l || { status: 'blocked', logTail: 'the lander stopped without a result' }, attempt === 0 ? 'sonnet' : 'opus')
  }
  await giveUp(id, prs[id], 'the PR did not land after two repairs')
  return { outcome: 'failed', reason: 'could not land after two repairs', pr: prs[id] }
}

async function runG1(slot) {
  const port = PORT_BASE + slot
  for (let round = 1; round <= 3 && !stopReason; round++) {
    const dir = `${RUN}/critics/G1-r${round}`
    const m = await ag([
      `Goal loop G1, round ${round}: measure the merged app (spec §6.2 layout and affordance metrics; §9.4 G1). Never edit code.`,
      BRIEF,
      `In your own worktree on origin/main (git fetch origin && git switch --detach origin/main; npm ci --allow-remote=all --no-audit --no-fund), use the test bed with E2E_PORT=${port}.`,
      `At 1024x768, 1280x800, 1512x982 and 1920x1080, Light and Dark: run measureLayout() and auditAffordances() from e2e/support/measure.ts on /study (seed concept-widget), /course (many-topics), /notebook, /settings and /login (signed out), and save a screenshot of each.`,
      `Write the screenshots and measurements.json to ${dir}/. pass = every §6.2 layout and affordance metric meets its threshold. failing = one line per miss (page, viewport, theme, metric, number).`,
      'Return JSON: pass, dir, failing, summary.',
    ].join('\n\n'), { label: `G1:measure:r${round}`, phase: 'G1', schema: MEASURE_SCHEMA, model: 'sonnet', effort: 'medium', isolation: 'worktree' })
    if (!m) { g1Log.push(`round ${round}: measure stopped`); break }
    const crit = await parallel(['affordance', 'space', 'colour-liveliness'].map((name) => async () => {
      const c = await ag([
        `You are the ${name} critic (spec §8) for goal loop G1, round ${round}. Never edit files.`,
        `${BRIEF} Use its "Critic procedure". Rubric: ${RUN}/critics-prompts/${name}.md. Inputs: ${dir}/ (screenshots and measurements.json).`,
        'Return JSON: pass, scores, raw, findings[].',
      ].join('\n\n'), { label: `G1:critic:${name}:r${round}`, phase: 'G1', schema: CRITIC_SCHEMA, model: 'sonnet', effort: 'medium' })
      if (!c) return null
      const checked = (c.findings || []).slice(0, 5)
      if ((c.findings || []).length > 5) log(`G1 ${name}: refuting 5 of ${c.findings.length} findings; the rest stay unverified`)
      const v = await parallel(checked.map((f) => () => ag([
        `Refute this G1 ${name} finding if you can (fresh eyes; never edit files). Evidence: ${dir}/ and origin/main.`,
        `Finding: ${JSON.stringify(f)}`, 'Return refuted (true only with concrete evidence) and evidence.',
      ].join('\n\n'), { label: `G1:refute:${name}`, phase: 'G1', schema: VERDICT_SCHEMA, model: 'sonnet', effort: 'medium' })))
      return { name, pass: !!c.pass, scores: c.scores || {}, confirmed: checked.filter((f, i) => v[i] && !v[i].refuted) }
    }))
    const results = crit.filter(Boolean)
    const confirmed = results.flatMap((c) => c.confirmed.map((f) => ({ critic: c.name, ...f })))
    g1Log.push(`round ${round}: metrics ${m.pass ? 'pass' : 'miss ' + (m.failing || []).length}; critics ${results.map((c) => c.name + (c.pass ? ' pass' : ' below bar')).join(', ')}; ${confirmed.length} confirmed`)
    log(`G1 ${g1Log[g1Log.length - 1]}`)
    if (m.pass && !confirmed.length && results.every((c) => c.pass)) break
    const last = round === 3
    const f = await ag([
      `Goal loop G1, round ${round}: fix what the measurements and the verified critics found, as one PR to main.`,
      `${BRIEF} Use its "Fix procedure" and the PR rules.`,
      `In your own worktree: git fetch origin && git switch -C story/G1-r${round} origin/main; npm ci --allow-remote=all --no-audit --no-fund. E2E_PORT=${port}. HELD files: ${heldList('G1')}.`,
      `Metric misses: ${JSON.stringify(m.failing || [])}\nConfirmed findings: ${JSON.stringify(confirmed)}`,
      `Fix test-first where a seam shows it (S1 metrics live in e2e/). PR title "G1 round ${round}: layout and affordance fixes"; body lists each fix and its number before and after, then "Refs #${PARENT}" (not Closes). No auto-merge.${last ? ' This is the last round: file what you cannot fix as needs-triage sub-issues of #323.' : ''}`,
      'Return JSON: pushed, pr, fixed, triaged, summary.',
    ].join('\n\n'), { label: `G1:fix:r${round}`, phase: 'G1', schema: FIX_SCHEMA, model: 'sonnet', effort: 'medium', isolation: 'worktree' })
    if (f && f.triaged) triage.push(...f.triaged.map((t) => `G1: ${t}`))
    if (!f || !f.pr) { g1Log.push(`round ${round}: no fix PR`); break }
    let landed = false
    for (let attempt = 0; attempt < 2 && !landed; attempt++) {
      const l = await ag([
        `Land PR #${f.pr} (goal loop G1 fixes; it refers to #${PARENT} and closes no issue). Read ${RUN}/lane-brief.md, "Lander procedure", and follow it; skip the issue-closing step. Never edit code.`,
        'Return JSON: status, failing, logTail, mainRed, issueClosed, mergeSha.',
      ].join('\n\n'), { label: `G1:land:r${round}`, phase: 'G1', schema: LAND_SCHEMA, model: 'haiku' })
      if (l && l.mainRed) mainRed = true
      if (l && l.status === 'merged') landed = true
      else if (attempt === 0) await ag([
        `G1 fix PR #${f.pr} (branch story/G1-r${round}) did not land: ${l ? l.status : 'no result'}. Log tail:\n${l ? (l.logTail || '').slice(-3000) : ''}`,
        `${BRIEF} Use "CI fixer and merger". In your own worktree: git fetch origin && git switch -C story/G1-r${round} origin/story/G1-r${round}; npm ci --allow-remote=all --no-audit --no-fund. E2E_PORT=${port}.`,
        'Return JSON: pushed, summary.',
      ].join('\n\n'), { label: `G1:repair:r${round}`, phase: 'G1', schema: FIX_SCHEMA, model: 'sonnet', effort: 'medium', isolation: 'worktree' })
    }
    g1Log.push(`round ${round}: fix PR #${f.pr} ${landed ? 'merged' : 'not merged'}`)
    if (!landed) break
  }
  return { outcome: 'g1', reason: g1Log.join(' | ') }
}

async function mainFix() {
  return ag([
    'main CI is red. Find out why and make it green. The owner is asleep.',
    `${BRIEF} Use "CI fixer and merger".`,
    'gh run list --branch main --workflow CI --limit 5; read the newest failed run (gh run view <id> --log-failed). A flake (timeout, network, port) → gh run rerun <id> --failed, then wait for it (gh run watch <id>, Bash timeout 600000). A real break → in your own worktree from origin/main (npm ci --allow-remote=all --no-audit --no-fund, E2E_PORT=3118), fix it test-first on branch story/main-fix-<short sha>, open a PR to main with "Refs #323", wait for check, build and ui, then gh pr merge --auto --merge and confirm it merged.',
    'Return JSON: fixed (main CI green again), pr (if any), summary.',
  ].join('\n\n'), { label: 'main-fix', phase: 'Fix', schema: MAINFIX_SCHEMA, model: 'opus', effort: 'medium', isolation: 'worktree' })
}

function startLane(id) {
  const slot = slots.shift()
  for (const g of (GROUPS_OF[id] || [])) held.set(g, id)
  log(`start ${id} on slot ${slot} (critical path ${lp(id)}); running ${running.size + 1}`)
  const p = lane(id, slot)
    .catch((e) => ({ outcome: 'failed', reason: 'lane error: ' + (e && e.message ? e.message : String(e)) }))
    .then((r) => ({ ...r, id, slot }))
  running.set(id, p)
}
function startSpecial(id, fn, groups, useSlot) {
  const slot = useSlot ? slots.shift() : null
  for (const g of groups) held.set(g, id)
  log(`start ${id}`)
  const p = fn(slot).catch((e) => ({ outcome: 'failed', reason: String(e && e.message ? e.message : e) })).then((r) => ({ ...r, id, slot }))
  running.set(id, p)
}
function finish(r) {
  running.delete(r.id)
  if (r.slot != null) slots.push(r.slot)
  for (const [g, owner] of [...held]) if (owner === r.id) held.delete(g)
  if (r.pr) prs[r.id] = r.pr
  if (r.id === 'MAINFIX') {
    if (limitHit) return
    if (r.fixed) { mainRed = false; log('main is green again') }
    else if (++mainFixTries >= 2) stopReason = 'main CI still red after 2 fix tries'
    return
  }
  if (r.id === 'G1') { log(`G1 done: ${r.reason}`); return }
  if (r.outcome === 'merged') { merged.add(r.id); log(`${r.id} merged (#${r.pr}); ${merged.size} merged`) }
  else if (limitHit) { paused.push(r.id); log(`${r.id} paused (${stopReason}); relaunch me`) }
  else if (r.outcome === 'requeue' && (requeues[r.id] = (requeues[r.id] || 0) + 1) <= 2) log(`${r.id} waits for ${r.reason}; requeued`)
  else { dropped.add(r.id); reasons[r.id] = r.reason; log(`${r.id} set aside: ${r.reason}`) }
}

while (true) {
  if (!stopReason) {
    if (mainRed && !running.has('MAINFIX')) startSpecial('MAINFIX', () => mainFix().then((x) => ({ fixed: !!(x && x.fixed), reason: x ? x.summary : 'no result' })), [], false)
    if (!mainRed && !noNewLanes) {
      if (!g1Started && G1_SET.every((t) => merged.has(t) || dead(t)) && G1_GROUPS.every((g) => !held.has(g)) && slots.length) {
        g1Started = true
        startSpecial('G1', runG1, G1_GROUPS, true)
      }
      const ready = SCOPE.filter(isReady).sort((a, b) => lp(b) - lp(a))
      for (const id of ready) {
        if (!slots.length) break
        if (CONTENT.has(id) && [...running.keys()].filter((r) => CONTENT.has(r)).length >= CONTENT_MAX) continue
        if (isReady(id)) startLane(id)
      }
    }
  }
  if (!running.size) break
  finish(await Promise.race([...running.values()]))
}

const left = SCOPE.filter((id) => !merged.has(id) && !dropped.has(id) && !paused.includes(id))
if (left.length) log(`not started (blocked by a set-aside ticket or a stop): ${left.join(', ')}`)
return {
  merged: [...merged].filter((id) => SCOPE.includes(id)),
  prs,
  setAside: Object.fromEntries([...dropped].filter((id) => SCOPE.includes(id)).map((id) => [id, reasons[id] || 'set aside before this launch'])),
  notStarted: left,
  needsPermission,
  triage,
  g1: g1Log,
  ledgerUsd: ledger,
  stopReason,
  paused: paused.length ? { relaunchMe: paused } : {},
  agentCount,
  limitHit,
}
