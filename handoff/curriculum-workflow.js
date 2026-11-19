export const meta = {
  name: 'linear-course-spec-inputs',
  description: 'Draft and adversarially verify the 75-lesson linear curriculum; check anchor company data for 2019; plan the code changes',
  phases: [
    { title: 'Draft', detail: 'curriculum author, anchor data research, code plan (parallel)' },
    { title: 'Critique', detail: 'zero-knowledge reader, valuation expert, decisions compliance' },
    { title: 'Revise', detail: 'final curriculum with term ledger' },
  ],
}

const REPO = '/home/fedora/developer/finance-agent'
const AUD = '/tmp/value-it-audit'

const DECISIONS = `
THE OWNER'S SETTLED DECISIONS (grilling session, 2026-11-19). Treat these as fixed requirements.
1. DONE = the Learner can value EVERY type of company (mature, high-growth, young/loss-making, cyclical/commodity, banks and insurers, emerging-market/multinational with currency and country risk, distressed): they find every input in an annual report, choose every input, and can explain every line. The valuation engine does the arithmetic.
2. ONE FIXED LINEAR COURSE of about 75 Lessons in about 11 Units, 15-25 minutes each (depth decides). Lessons unlock in order; an "I know this: test me" quiz lets someone pass a Lesson. No Electives, Primers, Follow, Judge or Analyse stages.
3. BOTTOM-UP FROM ABSOLUTE ZERO (an adult who does not know what revenue or a share is). HARD RULE: no term is used in any Lesson before the Lesson that teaches it. Plain idea first, then the real name; after that ONE canonical name per idea (revenue, introduced as "sales"; operating profit; operating margin; enterprise value; cost of capital; "discount rate" as the general idea). Report aliases (operating income, turnover, etc.) are taught once in the report unit. SOFT BUDGET: about 3 new terms per Lesson on average; 4-5 allowed when the flow needs it.
4. EACH LESSON BUILDS ON THE ONE BEFORE: it opens on the previous Lesson's result, pays off with a new line on the Valuation sheet of the two Anchor companies (something the Learner can now do that they could not before), and ends with a teaser the next Lesson answers. Units end on a milestone ("You can now read any income statement"). Addictiveness comes from understanding and the build: no streaks, points or badges.
5. THE SHORTCUT LADDER: a first rough value at about Lesson 20 (after business basics and time-and-money), using deliberate, named shortcuts: profit counts as cash; the rate is a guess; growth is flat; the business counts as the shares; the company is assumed to survive. Each later unit removes ONE shortcut and both values move: the report unit (profit becomes free cash flow); the risk unit (the guessed rate becomes the real cost of capital; central banks, insurance and risk transfer, diversification and portfolios, and country risk are woven in); the levers unit (a real forecast: revenue growth path, target operating margin, sales-to-capital reinvestment, risk path, terminal value; trade and tariffs, competition, growth limits woven in); the share unit (debt, cash, leases, staff options, share count); the survival unit (chance of failure, ranges and scenarios). Then THE REVEAL: what actually happened to both Anchor companies. After the core: a Stories unit (narrative to levers; judging other people's stories; updating on news), a Pricing unit (multiples, peers, what a multiple assumes, reading a price backwards), an Every-company-type unit (young/IPO, mature/declining, distressed, cyclical/commodity incl. hedging, R&D-heavy/intangibles, country risk in depth, currency and multinationals, banks and insurers, holding groups), and a Capstone (finding every input in a report; an unseen company of a random type with lighter guidance; then the Learner's own company as an Own Case Assignment).
6. TWO ANCHOR COMPANIES through the core: Coca-Cola (USD; mature, slow growth, high margin, low reinvestment, low risk) and DMart / Avenue Supermarts (INR; fast-growing, thin margin, heavy reinvestment, India country risk). As-of date mid-2019 (5+ years of "what happened next", COVID included). Every core Lesson shows its idea on BOTH. Other companies appear for the special types.
7. THE WORLD IS WOVEN IN, NOT STANDALONE: central bank policy, interest rates, inflation, bonds, currency (dollar vs rupee), country risk, trade and tariffs, insurance and risk transfer, portfolio management and diversification, competition, business cycles. Each is taught properly and step by step at the point it moves a valuation input, still obeying the term rule. Not trivia, not a bolt-on lesson.
8. HAND FIRST, THEN THE ENGINE: each new calculation is worked once by the Learner (choosing the right result by tap, with a visual of the step; Formula Cards allowed) before the engine automates it. Every question is a tap; the Learner types numbers only into an Own Case.
9. DERIVATIVES ONLY WHERE VALUATION USES THEM: staff stock options in the equity bridge; shares in a near-failure company behave like an option; hedging inside the cyclical/commodity lesson. No futures/swaps lessons, no Black-Scholes maths.
10. VISUAL-FIRST LESSON SHAPE: teaching comes in beats: a short written explanation shown exactly as written (never more than about 3 short lines between visuals) -> an interactive visual -> a quick tap; plus the Valuation sheet. The Tutor handles feedback, the Learner's own questions and re-teaching, not the main explanation.
11. GUIDED BUILDING: during the core the Learner picks each Anchor input from tapped options, with feedback; judging other people's stories is its own unit; their own company comes at the end.
12. NO COMMENTATOR NAMES (Damodaran, Zitron, any analyst unknown to the public) in learner-visible text. Published valuations may be used as "an analyst's valuation"; credit only in fine-print source lines. Company names are fine.
13. The Tutor follows the term rule too (it gets the list of terms taught so far).
14. The engine will gain: a country-risk input, a bank/insurer equity model, R&D capitalisation, several scenarios.
15. Audience: global, English; India appears through DMart, the rupee and country risk.`

const INPUTS = `
Inputs to read first: ${AUD}/report.md (audit synthesis incl. a 76-lesson draft curriculum in section 9), ${AUD}/verify.md (corrections: the draft used revenue, earnings, enterprise multiple, dividend, index, simulation and percentile before teaching them; earnings per share never taught), ${AUD}/skill-tree.md (prerequisite-ordered valuation skill tree, end state, essentials), ${AUD}/code-facts.md. Lesson files live in ${REPO}/course/topics/*.yaml; vocabulary in ${REPO}/GLOSSARY.md.
Do NOT edit any file in the repo. Return your full result as your final answer (do not rely on writing files).`

const AUTHOR = `You are the lead curriculum designer for Value It, a web app that teaches company valuation to a general beginner audience.
${DECISIONS}
${INPUTS}

Write the COMPLETE linear curriculum, Lesson by Lesson, honouring every decision above. Re-order and re-cut the audit's 76-lesson draft around the shortcut ladder (decision 5) and the two Anchor companies (decision 6).

For EACH Lesson give:
- # and title (plain words a beginner understands)
- Unit
- The ONE idea, in one sentence
- New terms: canonical term + the plain stand-in used first (respect the soft budget; mark when you go to 4-5 and why)
- Opens on: the exact result from the previous Lesson it builds on
- Hand-first calculation (if a new calculation appears): what the Learner works out once, on which Anchor
- Beats: 2-5 beats, each = what the short explanation says + the interactive visual (describe the widget: what the Learner moves, what changes) + the tap
- World woven in (if any): which force, how it moves which input, the dated real event used
- Valuation sheet: the line it adds or changes for Coca-Cola and for DMart, and how the rough value moves (or "no change, why")
- Shortcut status: which shortcuts are still in place
- Teaser: the one question that pulls the Learner into the next Lesson
- Reuse: existing course/topics files and line ranges worth mining (strip names)

Then give:
A. TERM LEDGER: every term in the course, alphabetical, with the Lesson that teaches it, its plain stand-in, and any report aliases. Check yourself: for every Lesson, every term it uses must be taught in it or earlier. Do this check explicitly and list any fix you made.
B. UNIT MILESTONES: one line per Unit.
C. THE SHORTCUT LADDER TABLE: shortcut -> Lesson where it is introduced -> Lesson where it is removed -> what replaces it.
D. WORLD-FORCES MAP: each force in decision 7 -> the Lesson(s) where it is woven in and the input it moves.
E. COMPANY-TYPE COVERAGE: each type in decision 1 -> the Lessons that teach it, the real company used (with an as-of date), and the engine feature it needs (decision 14).
F. Open questions for the owner, if any (keep short).`

const DATA = `You are researching data for two Anchor companies in a beginner valuation course.
${DECISIONS}

Follow the owner's web rules: for searches, fan out in ONE message, concurrently, to Parallel web_search, Octen search, Tavily tavily_search and Firecrawl firecrawl_search (load via ToolSearch in one batched call: "select:mcp__claude_ai_Parallel_Search__web_search,mcp__claude_ai_Parallel_Search__web_fetch,mcp__claude_ai_Octen__search,mcp__claude_ai_Tavily__tavily_search,mcp__claude_ai_Tavily__tavily_extract"; Firecrawl firecrawl_search and firecrawl_scrape are already loaded). Read URLs with Parallel web_fetch, falling back to Tavily tavily_extract or Firecrawl firecrawl_scrape. Prefer primary sources (SEC EDGAR 10-K, the company's annual report PDF, BSE/NSE filings, central bank data). If a provider errors, continue and name it.

Task: check that a mid-2019 As-of date works for BOTH Coca-Cola (KO, USD) and DMart (Avenue Supermarts Ltd, INR, NSE: DMART), and gather the inputs a beginner valuation needs.
1. Propose ONE As-of date (or one per company) in mid-2019 such that the latest annual report is public and no later fact leaks: Coca-Cola's FY2018 10-K (filed Feb 2019) and DMart's FY2018-19 annual report (year to 31 March 2019; when was it published?). Give exact filing/publication dates.
2. For each company at that As-of date, with source URL and page/line where possible: revenue (and the prior 3-5 years for growth), cost of goods, operating profit (EBIT), effective tax rate, depreciation, capital spending, change in working capital, invested capital or the inputs for it, total debt (and leases if disclosed), cash, shares outstanding (and staff options if disclosed), the share price on the As-of date, and market value. Note DMart owns most of its stores (capital-heavy) and Coca-Cola's refranchising in 2017-2018 distorts its revenue history.
3. Market readings at that date: US 10-year Treasury yield, India 10-year G-sec yield, US-India inflation in 2019, rupee per dollar, a published equity risk premium for the US and a country risk premium for India at that time (any reputable published dataset; names are fine in this internal research), Coca-Cola's and DMart's credit rating if any.
4. WHAT HAPPENED NEXT (for the Reveal), through the latest available year: revenue and operating margin path, the share price path (incl. COVID 2020), big events (DMart's growth, Coca-Cola's pricing, currency effects, tariffs/inflation).
5. Teaching fit: is each company a clean example for the four levers? Any traps (Coca-Cola's bottler investments and equity income, refranchising; DMart's promoter holding, store ownership, related entities like DMart Ready)? If either is a poor fit, propose a better alternative with the same profile (mature USD / fast-growing INR) and say why.
Mark every figure VERIFIED (read in a primary source) or UNVERIFIED. Return the full result as your final answer.`

const PLAN = `You are a senior engineer planning the code work for a course redesign in ${REPO} (Next.js, TypeScript, Drizzle/Neon, vitest, Playwright).
${DECISIONS}
Read ${AUD}/code-facts.md first, then the code it cites (src/course/*, src/tutor/*, src/widgets/*, src/valuation or wherever the engine lives, src/app/*, course/outline.yaml, scripts/check-course.mjs, docs/adr/0001, 0002, 0003, 0004, 0010, 0020). The owner says there are NO users and NO progress to keep: data can be reset; migrations can drop and recreate.
Do NOT edit any file. Produce a code plan:
1. The new Lesson shape (decision 10): a "beat" step (explanation shown as written + visual + tap), Formula Cards inside beats, how it fits ADR 0001's Teaching Steps, what replaces spine-check.ts and lesson-lint L13, what the Tutor still does. Files to change/add.
2. One fixed linear course with locked order and "test me" skip (decision 2): what to remove (Spine/Elective/Primer/Follow/Judge/Analyse wiring, SPINE_* constants, SPINE_LIVE_WITH fallback, Course Map sections, Home topic, Example ids) and what to add. Rename Topic -> Lesson and Subject -> Unit on screen first, code identifiers later: how to stage it.
3. The course check: a term registry (each term taught in exactly one Lesson; hard fail on use before teaching, across all learner-visible fields), the soft budget (report average, warn above 5), and a chain check (each Lesson declares buildsOn, adds, teaser). How to detect terms in prose robustly (registry with aliases and plain stand-ins; word-boundary matching; an allowlist).
4. The Valuation sheet (decisions 4, 5): a per-Learner, per-Anchor sheet persisted across Lessons; the shortcut ladder in the engine (first rough value as a growing perpetuity on profit with a guessed rate, then each unit swaps in the real piece). Data model, widget, engine API.
5. Engine extensions (decision 14): country-risk input, bank/insurer equity model (excess-return or dividend model with regulatory capital), R&D capitalisation, scenarios. What exists, what to add, tests (ADR 0010).
6. The Tutor term rule (decision 13): taught-terms list into context, reply check flags untaught terms (ADR 0006 path), Go deeper too.
7. Name removal (decision 12): every learner-visible place (Topic prose is being rewritten anyway; code: site copy, Example pages, widget labels, Library credit rendering in replies, Tutor instructions, market readings): what to change; credit moves to fine-print source lines only.
8. Reset: drop old progress/sessions/notes tables' rows or schema, old Topic files removed from the map (kept in git history).
9. A SLICED BUILD ORDER: 8-15 vertical slices, each a PR-sized issue with a title, scope, acceptance criteria, dependencies, and whether an agent can do it alone (ready-for-agent) or needs the owner (ready-for-human). The first slices must unblock writing Unit 1.
Return the full plan as your final answer.`

const CRITIC = (lens) => `${DECISIONS}
${INPUTS}

Below is a draft linear curriculum for Value It. Review it through ONE lens, adversarially: assume it is flawed until you have checked.
LENS: ${lens}
Return a numbered list of concrete findings, each with the Lesson number(s), what is wrong, why it matters, and the exact fix. End with a short verdict. Be specific; no generic advice.

===== DRAFT CURRICULUM =====
`

phase('Draft')
const dataP = agent(DATA, { label: 'research:anchor data', phase: 'Draft' })
const planP = agent(PLAN, { label: 'plan:code', phase: 'Draft' })
const draft = await agent(AUTHOR, { label: 'author:curriculum', phase: 'Draft' })

phase('Critique')
const lenses = [
  { key: 'zero-knowledge reader', lens: 'You are a complete beginner (you do not know what revenue, profit, a share or interest is). Walk the curriculum strictly in order. Flag EVERY term used before the Lesson that teaches it (in titles, ideas, beats, teasers, sheet lines), every jump where a Lesson does not truly build on the one before, every place you would be lost or bored, and every teaser that does not make you want the next Lesson. Also check the soft term budget: list Lessons with more than 5 new terms.' },
  { key: 'valuation expert', lens: 'You are an expert in intrinsic valuation in the narrative-and-numbers tradition (four levers: revenue growth, target operating margin, sales-to-capital reinvestment, cost of capital; terminal value with growth capped by the risk-free rate and reinvestment = g / return on capital; equity bridge; failure probability; relative valuation; special cases: young, mature, cyclical/commodity normalisation, financial service firms via equity/excess returns and regulatory capital, R&D capitalisation, leases as debt, country risk premium and currency consistency, distressed). Check that following this curriculum truly produces someone who can value ANY company with this approach; find missing skills, wrong order, technical errors, oversimplifications that would mislead, and places where the shortcut ladder teaches something false that is never corrected.' },
  { key: 'decisions compliance', lens: 'Check the curriculum against EVERY one of the 15 owner decisions above, one by one: first rough value about Lesson 20; each later unit removes exactly one shortcut and says how both values move; the Reveal after the core; both Anchors shown in every core Lesson; every world force in decision 7 woven in at a real input with a dated event; hand-first calculations; derivatives limited per decision 9; beats with visuals in every Lesson; guided building by tap; no commentator names; Stories, Pricing, Company-type and Capstone units present; about 75 Lessons in about 11 Units. Report each decision as MET / PARTLY / NOT MET with evidence and the fix.' },
]
const critiques = await parallel(lenses.map(l => () => agent(CRITIC(l.lens) + draft, { label: `critic:${l.key}`, phase: 'Critique' })))
const critiqueText = lenses.map((l, i) => `===== CRITIC: ${l.key} =====\n${critiques[i] ?? '(critic failed)'}`).join('\n\n')

phase('Revise')
const final = await agent(`${DECISIONS}
${INPUTS}

You are the lead curriculum designer. Below is your draft curriculum and three adversarial critiques. Produce the FINAL curriculum in the same format as the draft (every Lesson with all its fields, then sections A-F). Apply every valid fix; for any critique you reject, say why in a short "Rejected findings" list at the end. Re-run the term-ledger check yourself and state the result explicitly ("0 terms used before taught", or list them).

===== DRAFT =====
${draft}

${critiqueText}`, { label: 'revise:curriculum', phase: 'Revise' })

const data = await dataP
const plan = await planP
return { final, data, plan, critiques: critiqueText }
