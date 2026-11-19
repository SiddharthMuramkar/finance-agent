# Code plan: Value It course redesign (about 75 Lessons in 11 Units)

Root: /home/fedora/developer/finance-agent/. Every path below is under it. Sources: /tmp/value-it-audit/code-facts.md plus the code itself, read 2026-11-19. I edited no files.

**Overall strategy.** Build the new course (v2) beside the old one. It gets new modules, new tables and an admin-only route `/learn`, gated by `signedInAdmin`. Then switch over in one slice (S12), reset the data, and rename code identifiers last (S13).
- Why: production deploys from `main`. The old Topic pipeline keeps Home, the Examples and the Signal widget working until v2 runs end to end.
- Every new module uses the names Lesson and Unit from the first day.

---

## 1. The new Lesson shape (decision 10)

**Steps.** `LESSON_STEPS = ["open","beats","build","check","close"]` replaces the 7 `TEACHING_STEPS` (navigator.ts:13).
- **open:** code shows the previous Lesson's `result` line, a small snapshot of the Valuation sheet, and today's question (the previous Lesson's teaser). No model call; this removes the `openerNote` Tutor turn (context.ts:49).
- **beats:** beats 1..n, with the current `beat` index stored. Each beat is one card in the thread:
  - `say`: at most 3 lines, each at most 20 words, shown exactly as written;
  - `visual`: a recipe preset, interactive, drawn inline;
  - `tap`: 2 to 4 choices, or True/False, marked by code, with a fix on every wrong choice.
  - Beat kinds:
    - `teach`: the default.
    - `hand` (decision 8): one calculation step. Code works out the choices with a tested calculator, the visual shows the step, and a Formula Card is optional.
    - `predict`: the Learner taps before the visual reveals; a predict tap is never wrong. This replaces explore and the Insight.
  - First miss: show the fix and an `again` variant of the question. Second miss: a held Tutor re-teach turn (Reply kind `re_teach`), then a fresh variant.
- **build:** for each of the two Anchors, the Learner taps an option for each new sheet line. Each option has a verdict (accept or fix) and a feedback line.
  - The line then shows on the sheet.
  - If this Lesson removes a shortcut, a "value moved" item shows the old and new value for both Anchors.
- **check:** a quiz Check through the existing quiz.ts and quiz-panel, via an adapter to the `QuizCheck` shape. A failed Check uses the existing review turn for missed questions.
- **close:** the Unit milestone (on a Unit's last Lesson only), the teaser, and a Next Lesson button.

**Lesson file shape** (`course/lessons/<id>.yaml`):
```yaml
id: l04-operating-profit
title: …
minutes: 18                 # 15–25
goal: …
opens: { from: l03-two-costs, result: "…", answers: t03 }   # chain
teaches: [{ term: operating-profit, beat: b3 }]               # registry ids
beats:
  - id: b1
    kind: teach | hand | predict
    skill: op-profit-meaning
    say: ["…", "…"]
    visual: { recipe: cost_stack, inputs: {…}, anchor?: coca-cola }
    formula?: { id: operating-margin, inputs: {…} }
    calc?: operating-profit          # for hand beats
    tap: { ask, choices: [{id, text, fix?}], answer, again?: {…} } | { computed: {…} }
build: [{ line: operating-profit, anchors: { coca-cola: {options:[…], default: …}, dmart: {…} } }]
removes?: profitIsCash      # ladder Lessons only
firstValue?: true           # about Lesson 20
check: { questions: […], perAttempt: 4, pass: 3 }
goDeeper?: …
teaser: { id: t04, text: "…" }
milestone?: "You can now read any income statement"   # last Lesson of a Unit
allow?: [{ term, field, reason }]
```

**How this fits ADR 0001.**
- Kept: the file holds the teaching, and code sequences and marks every answer. Known mistakes and their fixes stay, as do Skills and the after-two-misses ladder (skill_state).
- Made stronger: the main explanation is shown exactly as written. The Tutor no longer words `concept`.
- Dropped: the 7-step list, the Insight at explore, the Running example (the Anchors replace it), concept, principle, connections, dailyLife and Primers.
- New ADR 0021:
  - supersedes ADR 0004;
  - amends ADRs 0001 and 0020;
  - amends ADR 0002: a hand beat may ask "which is the result of this step?" with choices code works out. That needs an exception in L10 and V8 for `hand` beats only; the Tutor still never asks for a sum;
  - amends ADR 0003: Formula Cards appear inside beats, and the registry must grow. Each card needs a tested calculator; `FORMULA_IDS` has only 5 today.

**What replaces spine-check.ts and lesson-lint L13.** A new `src/course/lesson-check.ts` covers every Lesson, with no special cases:
- 4 to 12 beats.
- `say` at most 3 lines and at most 20 words per line; this replaces L3.
- Exactly one visual and one tap per beat.
- Every wrong choice has a fix (L12 kept).
- No typed number (L10 kept, with the hand exception).
- Every Skill the Check tests is taught by a beat at or before it; this replaces L1.
- Check pool of at least 3×perAttempt (L2 kept). The half-done Quick-try rule is dropped.
- **L13 is replaced** by "the Check covers every beat Skill at least twice, and at least one question uses an Anchor". From the first-value Lesson on, at least one judgement question (which_lever, direction or predict) about the Anchors. The "what is it called" ban stays for Checks only.
- Declared minutes within ±30% of an estimate (about 1.5 minutes per beat, plus build and check): a warning, not a failure.
- Kept as they are: L4–L9 (the currency rule extends to beats about an Anchor), L11, L14 (computed questions read the Anchor's default inputs), formula-check, market readings, written-ahead.
- Removed or replaced:
  - beginner-check → the term check (§3);
  - connections-check → dropped (the chain replaces it);
  - youll-learn-check → dropped (the opener replaces it);
  - full-sheet-words-check → a check on the sheet's words;
  - critics-log → re-keyed to Lesson ids or dropped (owner decides).

**What the Tutor still does.**
- Re-teaches after a second miss.
- Answers the Learner's own questions (streamed, behind the stream guard).
- Go deeper (held).
- Reviews a failed Check.
- Explains why a build option is right or wrong, when asked.
- It never gives the main explanation, never marks an answer, and no longer opens a Lesson.

**Files.**
- New, course logic: `src/course/lesson-schema.ts` (zod, runs under plain Node), `lesson-texts.ts` (walks every string the Learner sees, like topic-texts.ts), `lesson-check.ts`, `chain-check.ts`, `lesson-navigator.ts` (pure).
- New, server and API: `src/lesson/beats.ts` (enter a beat, answer it, store items; reuses `teaching/choices` marking and `practice_answers` with `source:"beat"`), `src/app/api/lesson/beat/route.ts`.
- New, screen: `src/app/beat-card.tsx`, which hosts the visual inline.
- New Session item kinds: BEAT, BEAT_RESULT, LESSON_OPEN, SHEET_LINE, VALUE_MOVED, LESSON_CLOSE.
- Changed: practice.ts `enterStepItems`, turn.ts (a Tutor turn only on a re-teach, an own question, Go deeper or a Check review), context.ts, instructions.ts, reply-checks.ts (`StepKind` and caps), choices.ts, session-item-view.tsx, and the Topic bar strip, which becomes "Beat k of n".

## 2. One fixed linear course (decision 2)

**Remove:**
- **outline.ts:**
  - `STAGES`, `Stage`, `SPINE_MAX`, `SPINE_LENGTH`, `SPINE_MAX_MINUTES`, `SUBJECTS`;
  - the fields subject, spine, drawsOn, prerequisites and cases;
  - `spineProblems`, `spineCountProblems`, `spineTopics`, `isElective`, `usedInSpine`, `STAGE_TITLE`, and the sections by Stage in the course-map doc.
- **navigator.ts:**
  - `AFTER_SPINE`, `SPINE_LIVE_WITH` and the fallback to off-Spine Topics (:110-131), `spinePassed`;
  - chosen-Topic logic in `currentTopic`, `jumpTo`, `returnToDefaultPath`, `unmetPrerequisites`;
  - Due Checks, `required` and `restructure`;
  - explore and Insight (`exploreDue`, `lateExplore`);
  - parked Skills for now.
- **map.ts:** primers, piece, connections, explore, insight, stage, path, prerequisites, ownWork, concept, principle, dailyLife.
- **Primers:** primers.ts, tutor/primer-items.ts, app/primer-view.tsx, api/primer.
- **Follow, Judge and Analyse:**
  - pieces and pasting: tutor/pasted.ts, `pieceLines` (context.ts:378-394), the `pasted_texts` table;
  - instructions.ts:188 and the writer-naming exceptions at :187.
- **course-map-view.tsx:** the sections Recommended next, "You chose", Spine, Electives by Subject, Follow, Judge, Analyse and Assignment.
- **Topic conversion lists:** `LESSON_NOT_YET_CONVERTED`, `isConverted`, L13.
- **Site:**
  - `HOME_TOPIC_ID` (home-topic.ts:8): becomes `firstLessonId(outline)`;
  - the Example `topicId`s (examples.ts:56, 99): become an optional `lessonId`, checked against the outline;
  - stage counts in stats.ts and copy.ts:468-469;
  - Spine titles on How it works.
- **Tutor instructions:** the "Course Map lists every Topic" rule (instructions.ts:199) becomes "Lessons unlock in order; 'I know this: test me' passes one".
- **Dev and tests:** dev-e2e states, scripted e2e replies, 51 src tests and 12 e2e specs keyed to Spine ids, docs/critics/spine-log.yaml.

**Add:**
- **Outline v2:** `course/outline.yaml` becomes `units: [{id, title, milestone, lessons: [{id, title, minutes}]}]`. File order is course order; lessons without a file show as "Coming".
- **lesson-navigator.ts:** `currentLesson` = first unpassed Lesson; `lessonUnlocked`; `openPassed` (read-only); `unitOf`; `coursePassed`, which replaces `spinePassed` and now gates the Capstone and the Own Case.
- **Lock enforcement:** the beat and turn APIs refuse a locked Lesson.
- **Course page:** Units with locked, current and passed states and each Unit's milestone. Welcome and Home show "Next lesson".
- **"I know this: test me":** adapted from skip-ahead.ts.
  - The quiz draws from the Check plus the beat taps: 4 to 8 questions, at most 1 miss, once a day.
  - A pass fills the Lesson's sheet lines with their `default` option, marked "filled for you".
  - It is offered only on the current Lesson.

**Renaming Topic to Lesson and Subject to Unit, in stages:**
1. **S11, on screen only:** every string a Learner or visitor sees, the Tutor's app words (`ALLOWED_APP_WORDS`, reply-checks.ts:629, which has "Topic", "Course Map" and "I know this: quiz me"), and the instructions. Guarded by a test that scans JSX text and the copy modules.
2. **S1, the GLOSSARY.**
3. **v2 modules from day one:** the new course and navigator code replaces the old instead of being renamed.
4. **S13, after the switch:** a mechanical ts-morph rename (`Topic`→`Lesson`, `topicId`→`lessonId`, files `topic-*`→`lesson-*`), plus a migration renaming the `topic_id` columns.

## 3. The course check: term registry, budget, chain

**Registry** (`course/terms.yaml`):
```yaml
- id: revenue
  name: revenue                       # one canonical name
  forms: [revenues]                   # plurals added automatically; irregular forms listed here
  standIns: [sales, "money from customers"]   # plain words, allowed before the term is taught
  aliases: [turnover, net sales, top line]    # report aliases, taught in one report Lesson
  aliasLesson: l22-report-names
  acronym?: false
  ambiguous?: false   # if true, only `patterns` count (share, interest, return, capital, value…)
  patterns?: ["\\bper share\\b", "\\bshareholders?\\b"]
  means: …            # Lingo card
```
- **Where a term is taught:** only in the Lesson's `teaches:` list. The check fails unless each term is taught in exactly one Lesson.

**Matcher** (`src/course/terms.ts`; pure, shared with the Tutor check):
- Normalise: NFKC, lower case, strip markdown, straighten quotes, drop possessive "'s". Hyphens, en dashes and slashes become spaces, and compound entries are tokenised the same way ("sales-to-capital").
- A token trie over every name, form, alias and stand-in. Scan longest match first and consume the tokens, so "operating margin" never also counts "margin". Acronyms are matched on the original text with word boundaries.
- For an ambiguous term, only its `patterns` count.
- Allowlists: a global `course/terms-allow.yaml` and a per-Lesson `allow:` list. Each entry needs a reason.
- A warn-only `course/jargon-watchlist.txt` catches unregistered jargon; the audit found that nothing checks this today.

**Rules** (in `term-check.ts`):
- **Hard fail:** a registry name or alias used at any text position before it is taught. Taught means:
  - terms of earlier Lessons;
  - plus terms of this Lesson whose teaching beat is at or before the text's beat;
  - text in `open` sees only earlier Lessons; build, check and close see the whole Lesson.
- **Fields scanned:** every field `lesson-texts.ts` yields, which is everything the Learner sees: title, goal, the opener's result line, `say`, visual input strings, tap asks, choices, fixes and `again` variants, build option text and feedback, Check prompts, choices, explanations and fixes, teaser, milestone, goDeeper, Case story and reveal, Lingo text.
- **Code-drawn labels count too:**
  - each recipe declares `terms` for its fixed labels. value_levers' hard-coded "Operating margin once mature" and "Cost of capital…" (value-levers-model.ts:215, 237) explain why "operating margin" showed up in Topic 1;
  - each Formula Card declares `terms`;
  - each sheet line's label is its term.
- **Teaching beat:** the term's first use in the Lesson is in its declared beat, and a stand-in appears before the name in that beat (plain idea first).
- **Warnings:** a stand-in used after its term is taught ("use 'revenue'"); a stand-in that is itself a later term counts as a failure.
- **Soft budget:** print new terms per Lesson and the course average. Warn above 5, and when a Unit averages above 3.5.
- **Chain check** (`chain-check.ts`):
  - `opens.from` is the Lesson immediately before, except for Lesson 1, and `opens.answers` is that Lesson's teaser id;
  - a teaser is present;
  - every core Lesson `build`s at least one line for **both** Anchors;
  - the last Lesson of a Unit has a `milestone`;
  - the ladder: `firstValue` comes once, and `removes` appears in Unit order (report, then risk, levers, share, survival);
  - hand before engine: a sheet line the engine computes with calc X appears only at or after the first hand beat with `calc: X`.
  - A Lesson that is not written yet breaks the chain only with a warning.
- **Output:** each failure names the Lesson, beat, field, term and where the term is taught, plus a table of new terms per Lesson.

## 4. The Valuation sheet and the shortcut ladder (decisions 4, 5)

**Content, in git:**
- `course/anchors/coca-cola-2019.yaml` and `dmart-2019.yaml`: currency and unit (USD millions; INR crores), as-of date, price, shares, and every report figure with its source (title, URL, page). Also the reveal (what happened next) and an optional `analystValuation` whose credit sits in a fine-print source line only.
- `course/sheet.yaml`: lines `{id, term, section: business|report|risk|forecast|share|survival|value, input?, kind: figure|choice|derived, calc?}`.

**Learner data (DB):**
- New `sheet_entries` table: `(learner_id, anchor_id, line_id)` primary key; `option_id`, `value jsonb`, `lesson_id`, `filled_by` (learner, test_me or default), `updated_at`.
- The value at any Lesson is recomputed from entries and course order. No value history is stored.

**Engine API** (`src/finance/ladder.ts`; pure, runs under plain Node; ADR 0010 holds):
```ts
export const SHORTCUTS = ["profitIsCash","guessedRate","flatGrowth","businessIsShares","survives"] as const;
export function shortcutsActive(course, lessonId): Set<Shortcut>;
export function valueSheet(inputs: SheetInputs, active: ReadonlySet<Shortcut>):
  { ok: true; businessValue: number; equity: number; perShare?: number;
    compareTo: { label: "market value" | "price"; value: number }; active: Shortcut[]; dcf: DcfValue }
  | { ok: false; error: string; missing: string[] };
```
- `valueSheet` always builds `DcfInputs` and calls `valueStory`. Each active shortcut changes the inputs:
  - profitIsCash: a new engine flag `reinvest: false`, so reinvestment is 0 in the forecast years and after them;
  - flatGrowth: constant growth, margin and rate paths, with growthAfter = g;
  - guessedRate: the rate path is the guessed rate;
  - businessIsShares: cash, debt and options are 0, there is 1 share, and the result is compared with market value;
  - survives: no failure.
- An equivalence test pins the first rung to the closed form P(1+g)/(r−g).
- Golden tests: for both Anchors, the value at each rung with default options, pinned to the cent. Each shortcut removed must move both values.
- "Profit" in the first rung is after-tax operating profit (owner to confirm).

**Widget:**
- A fixed component (in the style of ADR 0011), `src/widgets/sheet/valuation-sheet-view.tsx`.
- It sits as a pinned panel tab "Sheet", with a `/sheet` page. It shows two columns or Anchor tabs, lines by section, a Lingo card on tap, and the newest line highlighted.
- The value block shows value against market value or price, chips for the shortcuts still in use (each naming the Unit that removes it), and a small line of the value across Lessons.
- No value shows before the `firstValue` Lesson.
- As-of rule for the Anchors: their Case Data and readings after mid-2019 stay hidden until the Reveal Lesson is passed. This needs a change to the ADR 0013 code, which today keys on each Topic's `revealShown`.

## 5. Engine extensions (decision 14), with ADR 0010 tests

- **Country risk.** Today the risk premium must be baked into the rate path (cost-of-capital-stack.ts:8-21).
  - Add `countryRisk` and `countryExposure` (λ, default = beta), with a "country" layer in the stack.
  - Add `rupeeRate(usdRate, inflationIN, inflationUS)` for dollar against rupee.
  - The valuation block gets an optional `costOfCapitalBuild` that derives the 10-year path (flat, then fading).
  - Tests: countryRisk 0 gives the old stack; DMart's build pinned; inflation conversion tables.
- **Banks and insurers.** Today the only dividend models (DDM, Gordon) are Tutor calculators (calculators.ts:266-284), and the Own Case excludes banks.
  - New `src/finance/financials-engine.ts`. `valueByExcessReturn`: book equity plus the present value of (ROE − cost of equity) × book value, plus a terminal; retention is set by a regulatory capital ratio × risk-weighted asset growth.
  - `valueByDividends` as a cross-check.
  - Property test: under clean surplus, the two methods agree.
  - A golden test against one published bank valuation (owner picks the Case). Insurers use the same model with solvency capital.
- **R&D capitalisation.** Today it is done by hand before entry (generated.ts:652).
  - `capitaliseRnD({rd[], life})` returns the research asset, amortisation, adjusted operating profit and added capital, applied in `toEngineInputs`.
  - Tests: straight-line amortisation tables; flat R&D leaves operating profit unchanged.
- **Scenarios.** Today the only branch is a single failure chance (dcf-engine.ts:204-211).
  - `valueScenarios(base, [{id, label, probability, change}])` returns each value, the expected value, low and high. Probabilities must sum to 1.
  - Tests: one scenario equals `valueStory`; `failure` equals a two-scenario special case.
- **Formula registry growth**, spread across the Unit slices (each card needs a tested calculator, ADR 0003): growing perpetuity, free cash flow, reinvestment, cost of equity, cost of capital, terminal value, equity bridge, expected value, country-risk cost of equity, excess return, justified multiple.

## 6. The Tutor follows the term rule (decision 13)

- **Context** (context.ts): add a line listing the terms taught so far, worked out from the registry, course order and the Learner's beat index. Also add the current beat's `say` exactly as written, the sheet values for both Anchors, and the instruction "explain any other finance word in plain words".
  - The Learner summary (memory.ts:244) gets the current Lesson and the count of Lessons passed.
- **Reply check:** a new V11 in reply-checks.ts, using the shared matcher. It flags a registry term not yet taught. Terms the Learner typed in this Session are exempt.
  - Held replies (re-teach, Go deeper, Check review): one retry, told the plain stand-in from the registry; if that fails, the beat's own words (ADR 0006).
  - Own-question streams: a soft check, recorded in `reply_checks`, never blocking (the stream guard stays limited to its three things).
- **Go deeper:** the material is checked by the course term check, and the reply is held and checked by V11.
- **Tutor eval fixtures:** at Lesson 3, the Tutor avoids "operating margin" and "cost of capital".

## 7. Removing commentator names (decision 12)

- **Rule:** names may appear only in `source`, `credit` and `sources[]` fields, drawn by one fine-print `SourceLine` component.
- **Check:** `src/course/names-check.ts` with an explicit, owner-extendable list (Damodaran, Zitron, Gurley, "professor"…). It runs in course:check over all Lesson and Case texts, and a vitest covers the code side below.
- **Code places to change:**
  - copy.ts:256-260: the Home and How it works source line becomes a SourceLine.
  - copy.ts:464-466: the About copy loses the name.
  - examples.ts:127, 131: the note becomes "on the analyst's inputs"; the label moves to fine print.
  - LeversWidget.tsx:481-482: the label becomes "An analyst's valuation (Feb 2000)", with credit in fine print.
  - set-workbench.ts: `caseStory: "Damodaran's story"` ×10 becomes "An analyst's story"; the readout source titles at :191-193, 263-264 and 533-535 move to fine print.
  - Market readings (readings.ts:113, 179-180; yardsticks.ts:36, 60; market-readings-view.tsx:32-36) and range-check-view.tsx:19-21: credit moves into a fine-print SourceLine.
  - spreadsheets.ts:152: our own passage text loses "linked from Aswath Damodaran's post".
  - Library citations (sources.ts, reply-markdown.tsx:79, the passage page): the credit stays only in the folded "N sources" line and the passage page's credit line, both fine print.
  - Tutor: instructions.ts:187-188 lose the writer exceptions (credit comes only from code); :306 drops the "Damodaran" example.
  - New V12: no commentator name in held replies; soft for streamed replies.
  - Widget readouts "(sourced: …)" (value-levers-model.ts:866, wacc-stack-model.ts:420) give a source id, never a name.
  - dev/e2e scripted replies updated.
- **Licences:** sources.json asks for credit. A fine-print credit should satisfy that; the owner should confirm.

## 8. Reset

- **When:** a migration in S12, run by migrate-on-build when the owner merges. Take a Neon snapshot first.
- **Truncate** (one `TRUNCATE … RESTART IDENTITY CASCADE`): sessions, messages, session_items, widget_state, turns, tool_calls, reply_checks, tutor_incidents, topic_restarts, learner_state, topic_progress, check_results, misconceptions, insight_attempts, quiz_attempts, review_cards, review_log, note_items, skill_state, practice_answers, skip_ahead_attempts, pasted_texts, own_cases.
- **Keep:** settings, learners, learner_profile, library_*, case_datasets and case_data_points, question_bank, login_failures, usage_rows.
- **Drop:** insight_attempts, pasted_texts, `learner_state.entered_by_jump`.
- **S13 renames:** topic_progress → lesson_progress (adding `beat`), every `topic_id` → `lesson_id`, skip_ahead_attempts → test_me_attempts.
- **Topic files:** delete the 113 files in `course/topics` (git history keeps them).
  - Before deleting, the valuation blocks the site needs (amazon-dcf-2000, and the cases for later type Lessons: Uber, WeWork, Coffee Day, Zomato, Tesla) move to `course/cases/*.yaml`.
  - The valuation registry generator then reads that folder, so Home's $35.04 stays.
- Regenerate docs/course-map.md from outline v2.

## 9. Build order: 15 slices

Labels: **agent** = ready-for-agent, **human** = ready-for-human. Every merge still needs the owner's yes, and so does any migration.

1. **ADRs 0021–0024 and the GLOSSARY.** Agent; no dependencies.
   - Scope:
     - 0021: Lessons and Units, linear order, test me, beat shape, 5 steps; supersedes 0004; amends 0001, 0002, 0003, 0020.
     - 0022: the term rule, including the Tutor.
     - 0023: Valuation sheet, Anchors, shortcut ladder.
     - 0024: names only in fine print.
     - GLOSSARY: add Lesson, Unit, Beat, Valuation sheet, Anchor company, Shortcut, Teaser, Unit milestone (clashes with the existing Widget "Milestone"), Term registry, Test me. Retire Spine, Elective, Primer, Converted Topic, Teaching Step.
   - Acceptance: check-adr-cites passes; the owner approves the wording.
2. **Lesson schema v2, outline v2, lesson and chain checks.** Agent; after slice 1 (loosely).
   - Scope: lesson-schema.ts, the outline with units, lesson-texts.ts, lesson-check.ts, chain-check.ts, the sheet.yaml schema, calc ids, a v2 course:check section beside v1, docs/course-map.md v2.
   - Acceptance: each rule has a failing fixture that names the Lesson, beat and field; the lessonTexts fixture covers every field; `npm run check` passes.
3. **Term registry and term check.** Agent; after slice 2.
   - Scope: terms.yaml schema, the matcher, term-check.ts (before-use, teaching beat, aliases, recipe, formula and sheet label terms, allowlists, watchlist, budget report).
   - Acceptance: a fixture where Lesson 2 uses a term taught in Lesson 5 fails; a stand-in passes; an alias used early fails; value_levers before its terms fails; matcher tests (hyphens, plurals, possessives, markdown, longest match, acronyms); the budget table prints.
4. **Units 1–2 scaffold and Anchor data.** Human; after slices 2 and 3.
   - Scope:
     - the owner confirms the Lesson list for Units 1–2 and the as-of date;
     - Anchor YAML with sourced figures from Coca-Cola's FY2018 10-K and DMart's FY2018-19 annual report;
     - terms seeded for Units 1–2;
     - Case Data import of both Anchors' price series (a Neon write).
   - Acceptance: course:check passes; every figure has a URL and page.
   - **Slices 2–4 unblock writing Unit 1.**
5. **Beat runner (admin preview at `/learn`).** Agent; after slice 2.
   - Scope: lesson-navigator, `lesson_progress` (a new table, added only), the beat API, BeatCard with the visual inline, Formula Card in a beat, hand and predict beats, test me left out. Use the modern-web-guidance skill.
   - Acceptance (Playwright): open → 3 beats → check → close with no `/api/turn` call on the happy path; two misses give exactly one held re-teach; a reload restores the beat; the phone layout works.
6. **Visual kit for beats.** Agent; after slices 3 and 5.
   - Scope:
     - recipes built on existing primitives (waterfall, money-stack, waffle, versus, step-through, time-travel, predict): money_in_out, price_times_units, cost_stack, margin_bar, owners_lenders, share_split, market_value, percent_points, growth_steps;
     - each declares `terms`;
     - value_levers labels come from inputs or the registry.
   - Acceptance: the widget checks pass; the term check reads recipe terms.
7. **Valuation sheet and ladder engine.** Agent; after slices 4 and 5.
   - Scope: ladder.ts, the `reinvest` flag, sheet_entries, the build step, the sheet component and tab, VALUE_MOVED, Anchor as-of gating keyed to the Reveal Lesson.
   - Acceptance:
     - golden values pinned to the cent for both Anchors at every rung;
     - each removal moves both values;
     - the perpetuity equivalence test passes;
     - a "fix" option shows feedback and saves nothing;
     - no value shows before `firstValue`.
8. **Linear course, test me, Course page.** Agent; after slice 5 (slice 7 for sheet auto-fill).
   - Acceptance:
     - a locked Lesson is refused by the API;
     - passed Lessons are read-only;
     - test me: 4 to 8 questions, at most 1 miss, once a day, auto-fills the sheet;
     - Units with locks and milestones;
     - "Next lesson" on Welcome and Home.
9. **Tutor for Lessons and the term rule.** Agent; after slices 3 and 5.
   - Scope: the new context, instructions rewrite, V11, Go deeper held, no opener turn.
   - Acceptance: tutor-eval fixtures; untaught-term retry message; soft V11 recorded for own questions.
10. **Names out.** Agent; no dependencies.
    - Scope: everything in §7.
    - Acceptance: names-check and its vitest pass; SourceLine is used everywhere listed; the owner confirms on the licences.
11. **On-screen rename Topic → Lesson, Subject → Unit.** Agent; no dependencies, before slice 12.
    - Acceptance: a scan finds no `\bTopics?\b` or "Subject" in visible text; app words updated; e2e text updated.
12. **Switch-over and reset.** Human (the merge runs the reset on production Neon); after slices 5–9 and 11.
    - Scope:
      - 12a (agent): move valuation blocks to `course/cases`;
      - 12b: delete the v1 pipeline (§2) and the topic files; `/learn` becomes `/study`; the §8 migration; reseed dev-e2e.
    - Acceptance: `npm run check` and ui:test pass; Home is still $35.04; production progress tables are empty and learners intact.
13. **Identifier and column rename.** Agent; after slice 12.
    - Scope: ts-morph renames plus the migration.
    - Acceptance: `\btopic` appears only in migration history.
14. **Engine: country risk and currency.** Agent; needed before the Risk Unit. Tests as in §5.
15. **Engine: scenarios, R&D capitalisation, bank/insurer model.** Agent, but the owner picks the bank and insurer Cases; needed before the Survival and company-types Units. It can split into 3 PRs. Tests as in §5.

Run in parallel at the start: 1, 10, 11, 14. Then 2 → 3 → 4; 5 → 6, 7, 8, 9; then 12 → 13; 15 any time before it is needed.

## Questions for the owner

1. "Growth is flat": one steady rate for ever, or zero?
2. Is "profit" in the first rough value after-tax operating profit?
3. Does fine-print credit satisfy the Library licences?
4. Keep the critics gate, keyed to Lessons?
5. Keep Reviews?
6. Which Anchor as-of date: the end of June 2019?
7. Which bank and insurer Cases?
8. What should the "Unit milestone" be called, since "Milestone" already names a Widget moment?

