export const meta = {
  name: 'linear-course-curriculum',
  description: 'Draft, adversarially critique and revise the ~75-Lesson linear Value It curriculum (re-run after the Fedora pause)',
  phases: [
    { title: 'Draft', detail: 'one curriculum author writes the full draft to a scratch file' },
    { title: 'Critique', detail: 'zero-knowledge reader, valuation expert, decisions compliance' },
    { title: 'Revise', detail: 'final curriculum with term ledger check' },
  ],
}

const REPO = '/Users/siddharth/Developer/finance-agent-branch-2'
const AUD = REPO + '/handoff/audit'
const OUT = '/private/tmp/claude-501/-Users-siddharth-Developer-finance-agent-branch-2/21838ba0-7db4-448b-abfa-36d42678787d/scratchpad/curriculum'
const DRAFT = OUT + '/draft.md'
const FINAL = OUT + '/final.md'

const DECISIONS = `
THE OWNER'S SETTLED DECISIONS (grilling session, 2026-11-19). Treat these as fixed requirements. They are recorded in ${REPO}/docs/adr/0021-*.md, 0022-*.md, 0023-*.md, 0024-*.md and in ${REPO}/GLOSSARY.md (read those; use the glossary words: Course, Unit, Lesson, Can-do line, Core, Term, Beat, Hand-first sum, Teaser, Anchor company, Valuation sheet, Shortcut, Rough value, Commentator, Skip ahead / "I know this: test me").
1. DONE = the Learner can value EVERY type of company (mature, high-growth, young/loss-making, cyclical/commodity, banks and insurers, emerging-market/multinational with currency and country risk, distressed): they find every input in an annual report, choose every input, and can explain every line. The valuation engine does the arithmetic.
2. ONE FIXED LINEAR COURSE of about 75 Lessons in about 11 Units, 15-25 minutes each (depth decides). Lessons unlock in order; an "I know this: test me" quiz lets someone pass a Lesson. No Electives, Primers, Follow, Judge or Analyse stages.
3. BOTTOM-UP FROM ABSOLUTE ZERO (an adult who does not know what revenue or a share is). HARD RULE: no term is used in any Lesson before the Lesson that teaches it. Plain idea first, then the real name; after that ONE canonical name per idea (revenue, introduced as "sales"; operating profit; operating margin; enterprise value; cost of capital; "discount rate" as the general idea). Report aliases (operating income, turnover, etc.) are taught once in the report unit. SOFT BUDGET: about 3 new terms per Lesson on average; 4-5 allowed when the flow needs it.
4. EACH LESSON BUILDS ON THE ONE BEFORE: it opens on the previous Lesson's result, pays off with a new line on the Valuation sheet of the two Anchor companies (something the Learner can now do that they could not before), and ends with a Teaser the next Lesson answers. Units end on a Can-do line ("You can now read any income statement"; never call it a milestone: Milestone is a Widget moment). Addictiveness comes from understanding and the build: no streaks, points or badges.
5. THE SHORTCUT LADDER: a first Rough value at about Lesson 20 (after business basics and time-and-money), using deliberate, named Shortcuts: profit counts as cash; the rate is a guess; growth is flat; the business counts as the shares; the company survives. Each later unit removes ONE Shortcut and both values move: the report unit (profit becomes free cash flow); the risk unit (the guessed rate becomes the real cost of capital; central banks, insurance and risk transfer, diversification and portfolios, and country risk are woven in); the levers unit (a real forecast: revenue growth path, target operating margin, sales-to-capital reinvestment, risk path, terminal value; trade and tariffs, competition, growth limits woven in); the share unit (debt, cash, leases, staff options, share count); the survival unit (chance of failure, ranges and scenarios). Then THE REVEAL: what actually happened to both Anchor companies. After the core: a Stories unit (narrative to levers; judging other people's stories; updating on news), a Pricing unit (multiples, peers, what a multiple assumes, reading a price backwards), an Every-company-type unit (young/IPO, mature/declining, distressed, cyclical/commodity incl. hedging, R&D-heavy/intangibles, country risk in depth, currency and multinationals, banks and insurers, holding groups), and a Capstone (finding every input in a report; an unseen company of a random type with lighter guidance; then the Learner's own company as an Own Case Assignment).
6. TWO ANCHOR COMPANIES through the core: Coca-Cola (USD; mature, slow growth, high margin, low reinvestment, low risk) and DMart / Avenue Supermarts (INR; fast-growing, thin margin, heavy reinvestment, India country risk). Every core Lesson shows its idea on BOTH. Other companies appear for the special types.
7. THE WORLD IS WOVEN IN, NOT STANDALONE: central bank policy, interest rates, inflation, bonds, currency (dollar vs rupee), country risk, trade and tariffs, insurance and risk transfer, portfolio management and diversification, competition, business cycles. Each is taught properly and step by step at the point it moves a valuation input, still obeying the term rule. Not trivia, not a bolt-on lesson.
8. HAND FIRST, THEN THE ENGINE: each new calculation is worked once by the Learner (choosing the right result by tap, with a visual of the step; Formula Cards allowed) before the engine automates it. Every question is a tap; the Learner types numbers only into an Own Case.
9. DERIVATIVES ONLY WHERE VALUATION USES THEM: staff stock options in the equity bridge; shares in a near-failure company behave like an option; hedging inside the cyclical/commodity lesson. No futures/swaps lessons, no Black-Scholes maths.
10. VISUAL-FIRST LESSON SHAPE: teaching comes in Beats: a short written explanation shown exactly as written (never more than about 3 short lines between visuals) -> an interactive visual -> a quick tap; plus the Valuation sheet. The Tutor handles feedback, the Learner's own questions and re-teaching, not the main explanation.
11. GUIDED BUILDING: during the core the Learner picks each Anchor input from tapped options, with feedback; judging other people's stories is its own unit; their own company comes at the end.
12. NO COMMENTATOR NAMES (no professor, analyst or writer unknown to the public, including the author of the valuation method this course follows) in learner-visible text. Published valuations may be used as "an analyst's valuation"; credit only in fine-print source lines. Company names are fine. The method is taught as the method, never as someone's.
13. The Tutor follows the term rule too (it gets the list of terms taught so far).
14. The engine will gain: a country-risk input, a bank/insurer equity model, R&D capitalisation, several scenarios.
15. Audience: global, English; India appears through DMart, the rupee and country risk.

ROUND-4 ANSWERS (owner, 2026-11-19, "yes to all"):
16. As-of date for both Anchors: Wednesday 31 July 2019, market close. Nothing after it reaches the Learner until the Reveal (the As-of rule).
17. The Rough value is after-tax operating profit valued as a growing perpetuity: one steady growth rate for ever ("growth is flat" = one flat rate, not zero) at a guessed rate.
18. A Unit closes on a Can-do line. Reviews and the critics gate stay, keyed to Lessons.
19. Which bank and which insurer Cases: you propose them (with an as-of date); the owner confirms later.`

const INPUTS = `
Inputs to read first:
- ${AUD}/report.md (audit synthesis incl. a 76-lesson draft curriculum in section 9; it was written before the decisions above, so re-cut it).
- ${AUD}/verify.md (corrections: the draft used revenue, earnings, enterprise multiple, dividend, index, simulation and percentile before teaching them; earnings per share never taught).
- ${AUD}/skill-tree.md (prerequisite-ordered valuation skill tree, end state, essentials).
- ${AUD}/code-facts.md and ${REPO}/handoff/code-plan.md (the planned Lesson shape: open, beats, build, check, close; Beat kinds teach / hand / predict; planned visual recipes; the Shortcut ladder engine). Use the recipe names where they fit and name new ones when needed.
- ${REPO}/handoff/anchor-data-2019.md (checked figures for both Anchors at 31 Jul 2019, market readings, and what happened next). Use these real numbers in Valuation sheet lines.
- ${AUD}/spine-1.md, spine-7.md, spine-13.md, offspine-*.md (audit detail) as needed.
- Lesson files live in ${REPO}/course/topics/*.yaml (113 old Topics; mine their best explanations, strip names); vocabulary in ${REPO}/GLOSSARY.md.
Do NOT edit any file in the repo. The only files you may write are in ${OUT}.`

const FORMAT = `For EACH Lesson give:
- # and title (plain words a beginner understands; the title itself must obey the term rule)
- Unit
- The ONE idea, in one sentence
- New terms: canonical term + the plain stand-in used first (respect the soft budget; mark when you go to 4-5 and why)
- Opens on: the exact result from the previous Lesson it builds on
- Hand-first sum (if a new calculation appears): what the Learner works out once, on which Anchor, with the real numbers
- Beats: 2-5 Beats, each = what the short explanation says + the interactive visual (name the recipe; describe what the Learner moves and what changes) + the tap
- World woven in (if any): which force, how it moves which input, the dated real event used (on or before 31 Jul 2019 in the Core, except the Reveal)
- Valuation sheet: the line it adds or changes for Coca-Cola and for DMart, with real figures where they exist, and how the Rough value moves (or "no change, why")
- Shortcut status: which Shortcuts are still in place
- Teaser: the one question that pulls the Learner into the next Lesson
- Reuse: existing course/topics files and line ranges worth mining (strip names)

Then give:
A. TERM LEDGER: every term in the course, alphabetical, with the Lesson that teaches it, its plain stand-in, and any report aliases. Check yourself: for every Lesson, every term it uses (titles, ideas, beats, teasers, sheet lines) must be taught in it or earlier. Do this check explicitly and list any fix you made.
B. UNITS AND CAN-DO LINES: one line per Unit with its Lesson range.
C. THE SHORTCUT LADDER TABLE: Shortcut -> Lesson where it is introduced -> Lesson where it is removed -> what replaces it -> how each Anchor's value moves (direction and rough size).
D. WORLD-FORCES MAP: each force in decision 7 -> the Lesson(s) where it is woven in, the input it moves, the dated event.
E. COMPANY-TYPE COVERAGE: each type in decision 1 -> the Lessons that teach it, the real company used (with an as-of date), and the engine feature it needs (decision 14).
F. OPEN QUESTIONS for the owner (short; include your proposed bank and insurer Cases).`

const WRITE_RULE = (path) => `OUTPUT: The document is long (about 75 Lessons). Write it in Markdown to ${path} using the Write tool, in several parts if needed (write the first part, then append the rest with Bash heredocs or the Edit tool) so nothing is cut off. Make sure every Lesson and every section A-F is in the file. Your final answer (return value) is ONLY: the file path, the Lesson count, the Unit count, the Lesson number of the first Rough value, and the result of your term-ledger check, in under 120 words.`

const AUTHOR = `You are the lead curriculum designer for Value It, a web app that teaches company valuation to a general beginner audience.
${DECISIONS}
${INPUTS}

Write the COMPLETE linear curriculum, Lesson by Lesson, honouring every decision above. Re-order and re-cut the audit's 76-lesson draft around the Shortcut ladder (decision 5) and the two Anchor companies (decision 6).

${FORMAT}

${WRITE_RULE(DRAFT)}`

const CRITIC = (lens) => `${DECISIONS}
${INPUTS}

Read the draft linear curriculum for Value It at ${DRAFT} (read the whole file, in chunks if needed). Review it through ONE lens, adversarially: assume it is flawed until you have checked.
LENS: ${lens}
Return a numbered list of concrete findings, each with the Lesson number(s), what is wrong, why it matters, and the exact fix. End with a short verdict. Be specific; no generic advice. Do not write any file; your final answer is the findings list.`

phase('Draft')
const draftSummary = await agent(AUTHOR, { label: 'author:curriculum', phase: 'Draft' })
log('Draft: ' + String(draftSummary).slice(0, 300))

phase('Critique')
const lenses = [
  { key: 'zero-knowledge reader', lens: 'You are a complete beginner (you do not know what revenue, profit, a share or interest is). Walk the curriculum strictly in order. Flag EVERY term used before the Lesson that teaches it (in titles, ideas, beats, teasers, sheet lines), every jump where a Lesson does not truly build on the one before, every place you would be lost or bored, and every Teaser that does not make you want the next Lesson. Also check the soft term budget: list Lessons with more than 5 new terms.' },
  { key: 'valuation expert', lens: 'You are an expert in intrinsic valuation in the narrative-and-numbers tradition (four levers: revenue growth, target operating margin, sales-to-capital reinvestment, cost of capital; terminal value with growth capped by the risk-free rate and reinvestment = g / return on capital; equity bridge; failure probability; relative valuation; special cases: young, mature, cyclical/commodity normalisation, financial service firms via equity/excess returns and regulatory capital, R&D capitalisation, leases as debt, country risk premium and currency consistency, distressed). Check that following this curriculum truly produces someone who can value ANY company with this approach; find missing skills, wrong order, technical errors (also check the Anchor figures against the anchor data file), oversimplifications that would mislead, and places where the Shortcut ladder teaches something false that is never corrected.' },
  { key: 'decisions compliance', lens: 'Check the curriculum against EVERY one of the 19 owner decisions above, one by one: first Rough value about Lesson 20; each later unit removes exactly one Shortcut and says how both values move; the Reveal after the core; both Anchors shown in every core Lesson; every world force in decision 7 woven in at a real input with a dated event on or before 31 Jul 2019; hand-first sums; derivatives limited per decision 9; Beats with visuals in every Lesson; guided building by tap; no commentator names; Stories, Pricing, Company-type and Capstone units present; about 75 Lessons in about 11 Units; Can-do lines (never "milestone"). Report each decision as MET / PARTLY / NOT MET with evidence and the fix.' },
]
const critiques = await parallel(lenses.map(l => () => agent(CRITIC(l.lens), { label: 'critic:' + l.key, phase: 'Critique' })))
const critiqueText = lenses.map((l, i) => '===== CRITIC: ' + l.key + ' =====\n' + (critiques[i] || '(critic failed)')).join('\n\n')

phase('Revise')
const finalSummary = await agent(`${DECISIONS}
${INPUTS}

You are the lead curriculum designer. Your draft curriculum is at ${DRAFT} (read all of it). Below are three adversarial critiques of it. Produce the FINAL curriculum in the same format as the draft (every Lesson with all its fields, then sections A-F), then a section G. REJECTED FINDINGS: each critique finding you reject, with a one-line reason. Apply every valid fix. Re-run the term-ledger check yourself, Lesson by Lesson, and state the result explicitly at the end of section A ("0 terms used before taught", or list them).

${FORMAT}

${WRITE_RULE(FINAL)}

${critiqueText}`, { label: 'revise:curriculum', phase: 'Revise' })

return { draftSummary, finalSummary, critiques: critiqueText, draftPath: DRAFT, finalPath: FINAL }
