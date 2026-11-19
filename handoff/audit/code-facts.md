# Value It: code facts for the lesson redesign (fact-finding only, no repo edits)

Repo: /home/fedora/developer/finance-agent. Paths relative to it. Read 2026-11-19 on branch feat/visual-polish-batch-1.

## 1. How a Topic reaches the Learner

Topic files are parsed with `yaml.parse` (src/course/map.ts:947), so **YAML comments never reach anyone** (not code, not the Tutor, not the screen).

### Shown on screen verbatim (code draws it)
| Field | Where | Evidence |
|---|---|---|
| `title` | Topic bar, Course Map rows, Topic Start card, "Next Topic: <title>" chip/Home button, Notebook, Connection titles in Notebook, public How it works (Spine titles from outline) | src/app/topic-header.tsx:30; src/app/course/course-map-view.tsx:66; src/course/topic-start.ts:41; src/course/navigator.ts:550; src/site/home-button.ts:23; src/app/notebook/filled-part.tsx:61; src/app/(site)/how-it-works/page.tsx:152-155 via src/site/stats.ts:27 |
| `goal` | Topic bar | src/app/study/page.tsx:96; src/app/topic-header.tsx:30 |
| `youllLearn` | Topic Start card, Welcome | src/course/topic-start.ts:43; src/app/topic-start-card.tsx:20-24 |
| `minutes` (outline/file) | Course Map row "N min", Recommended next | course-map-view.tsx:77, 222 |
| `checks[].card` (title, lines, writeDown) | Concept card item at the Concept step | src/tutor/practice.ts:518-529; src/app/session-item-view.tsx:136 |
| `checks[].quickTries` (ask, choices, halfDone, mistake fixes) | Quick try items + result line | src/tutor/session-item-kinds.ts:51-76 |
| `questions[]` prompt, choices, `speaker`; after marking: explanation, mistake fix, computed figure | Check tab | src/course/quiz.ts:260-297; src/app/quiz-panel.tsx:41-46,178,268 (speaker) |
| `insight.pick` question, choices, fixes, hints, `insight.written` | Insight pick above composer | src/app/insight-pick.tsx:54,79-81; src/learner/insight.ts:184-202 |
| `insight.written` (when told) | Notebook "As written" | src/learner/notes.ts:79-82; filled-part.tsx:36-40 |
| `principle` | Topic complete card (first sentence), Notebook (whole) | src/tutor/topic-complete-card.ts:18-21; src/tutor/topic-complete.ts:56; filled-part.tsx:45-46 |
| `dailyLife` | Item at Principle step, Topic complete card, Notebook | src/tutor/practice.ts:494-509; filled-part.tsx:47-51 |
| `connections[].text` + linked Topic titles | **Notebook, verbatim** | src/learner/notes.ts:85; filled-part.tsx:54-63 |
| `primers[]` title, lines, term (term/means/pro/example), Quick try, Elective title | Primer item | src/course/primers.ts:16-32 |
| `terms[]` (term, pro, means, example, emoji, inStory) | Lingo card, **only when the Learner asks "what does X mean"** (word Choice or typed) | src/tutor/companion.ts:117-137, 76-89; src/tutor/reply-choices.ts:91-93 |
| `explore.workbench.title`, `inputs.caseStory`, mode labels | Workbench title and story chip label | src/course/explore-widget.ts:62; src/widgets/workbench/value-levers-model.ts:661 |
| `scenes[]`, written-ahead `widgets[]`, `revealWidget`, `found` | Widgets / Notebook / complete card | src/tutor/companion.ts:140-146; src/tutor/topic-complete-card.ts:14 |
| `skills[].rule` | Drill divider "Drill · <rule>"; Notebook mistakes line | src/tutor/practice.ts:621-622; src/learner/known-mistakes.ts:105 |

### Worded by the Tutor (sent in the Course Navigator context, never drawn by code)
- `concept`: context.ts:175 (concept/explore/your_turn when no card), :192, :203. Not drawn anywhere; notes.ts:68 only scans it for formula markers.
- Case `title`, `asOf`, `story`, `reveal` (reveal only from the reveal step): src/tutor/context.ts:164-166. Opener is told "open the Topic with its Case's story" (context.ts:55).
- `why` (only when asked "why am I learning this"): context.ts:138; instructions.ts:200.
- `goal` also, `terms` as "term: means" for the current Topic only: context.ts:136, 139-141.
- `goDeeper`: context.ts:144-149 (given when Go deeper pressed; "in your own words").
- `runningExample` text, Skill analogies: context.ts:97-106.
- `principle`, `dailyLife`, `connections` (worded again at Principle): context.ts:207-219; instructions.ts:189.
- `insight.question`, `foundWhen`, hints (typed-insight Topics), `written` after settled: context.ts:339-376.
- conversation Check `prompt`/`passCriteria`: context.ts:180-188.
- Case `piece.author/title/url` (Follow etc.): context.ts:379.
- Widget readings incl. "(sourced: <title>)": value-levers-model.ts:866; wacc-stack-model.ts:420.

### Never reaches the Learner
- `questions[].source`: `PublicQuestion` has "no answer, no explanation, no source" (src/course/quiz.ts:42); `markAttempt` copies only `credit` (Question Bank only) (quiz.ts:273). Not sent to the Tutor either.
- YAML comments (dropped by parse).
- Outline `cases[]` (title, outcome, sources, note, verified): only docs/course-map.md (src/course/outline.ts:240-245) and dev judges (src/behaviour/delight/judges.ts:441). Course Map page shows Topic titles, not outline Case titles (course-map-view.tsx).
- Valuation block `sources`, `notes`, `published`: no view reads them (no `.sources` in src/widgets, src/app Study code). Own Case shows its own sources.
- `drawsOn`: only "Used in Spine Topic N" on Elective rows (course-map-view.tsx:80).

### Direct answers
- **case.title**: not on screen in the Study Workspace; goes to the Tutor (context.ts:164), which may say it ("Damodaran values Amazon, February 2000", spine-01-worth.yaml:17).
- **question.source**: never shown, never sent to the Tutor (quiz.ts:42, 262-297).
- **speaker**: shown verbatim as a chip (quiz-panel.tsx:41-46).
- **explore.workbench.inputs.caseStory**: shown verbatim as the story chip label (value-levers-model.ts:661; part schema value-levers-part.tsx:39). spine-01 sets "Damodaran's story" (spine-01-worth.yaml:100).
- **connections**: shown verbatim in the Notebook (filled-part.tsx:54-63) and worded by the Tutor at Principle. spine-01's 2nd Connection "Damodaran set out the same four levers…" (spine-01-worth.yaml:109) is on screen in the Notebook with title "Follow: Damodaran, Tesla valuation (Feb 2020)".
- **goDeeper**: Tutor only, own words (context.ts:144-149).

### Why "operating margin" pops up in Topic 1 (code, not just content)
- The Value levers Workbench hard-codes slider labels: "Operating margin once mature" (src/widgets/workbench/value-levers-model.ts:215-216) and "Cost of capital while it grows" (:237-238). `firstLook` only relabels lever 1 and hides the after-year-10 readout (value-levers-model.ts:763, 865). So Spine 1's explore shows "Operating margin" on screen whatever the Topic file says.
- The term card exists only on demand (companion.ts:117-137); nothing proactively teaches a term before the Workbench shows it.

## 2. The concept step

- `concept` is never shown verbatim; the Tutor words it (context.ts:175). In a converted Topic the Concept step instead shows the Check's card verbatim (practice.ts:518-529) and tells the Tutor: "Add one sentence and one ask; never write your own version of the card" (context.ts:36).
- Length limits:
  - `concept`: `z.string().min(1)`, no max (map.ts:677). spine-01's concept is 138 words.
  - Concept card: at most 5 entries including the write-down line, no sentence over 20 words (lesson-lint.ts:133-134, L3 at :285-297).
  - Tutor reply: 80 words at concept, your_turn and check; 120 at story, explore, reveal, principle, worked example, Go deeper (src/tutor/reply-checks.ts:80-86, 112-115). Code enforces it before the reply shows (V1, reply-checks.ts:394-396; ADR 0006). Instructions: "Simple first… Give more only when the Learner asks" (instructions.ts:159). "One idea and one ask" (instructions.ts:153).
  - Primer: at most 3 lines (map.ts:630). `why` at most 30 words (map.ts:645; goal-check.ts:24). `goal` at most 120 characters (map.ts:667).
  - **Net effect:** depth per Spine Topic is capped by design: one card of ≤5 short lines, plus a Tutor sentence of ≤80 words.
- Multiple beats in one Topic: **already supported by the engine, banned on the Spine by the course check.**
  - Steps per Topic: story, then for each Check concept → your_turn → check, then reveal and principle (navigator.ts:78, 443-451). Explore follows the concept of the Check named in `explore.before` (map.ts:443-446; navigator.ts:197-198), so beats can come before explore.
  - Precedent: num-percent-bps has 4 Checks, 4 cards and 16 Quick tries; num-compounding has 5, 5 and 16. Every Spine Topic has 2 Checks and 1 card.
  - Spine bans: exactly 1 Concept card (spine-check.ts:60-61); 6 to 8 Quick tries in all (:21, :67); at most 2 quiz Checks, or 1 quiz and 1 conversation (:73); each quiz Check draws 4 per attempt and passes at 3 (:22-23, :76-80); L13 asks each Spine quiz Check for ≥6 questions, ≥4 judgement kinds and ≥1 computed one (lesson-lint.ts:568-600).
  - What each beat costs today: a card, plus a Skill, plus ≥3 Quick tries per Skill with one half-done (L2, lesson-lint.ts:254-270), plus a Check with ≥3×perAttempt distinct questions (L2), plus a fix on every wrong choice (L12).
  - There is no "explain only" beat without a test: every Check is a quiz or a conversation (map.ts:278-352).
- Ways to add multi-beat teaching:
  - **(a) Several Checks per Topic (no new code).** Relax spine-check.ts:60-80, L13 and beginner/term caps; write the content. Progress is keyed by Check id. A new Check is due in a passed Topic only if `required` (default false, map.ts:281, 349; navigator.ts:86-89). `restructure: content-only` keeps passes and fails on required Checks (lesson-lint.ts:181-184). An in-progress Learner resumes at the first unpassed Check (navigator.ts:162-165). **No data migration.**
  - **(b) Several cards in one Concept step (no new step).** Changes:
    - map.ts:102-109 and 272-275: `card` becomes a list.
    - practice.ts:518-529: store N CONCEPT_CARD items.
    - practice.ts:1026: the start_again replay.
    - context.ts:25-33: shownCard and cardText.
    - lesson-lint L1/L3, and spine-check.ts:61.
    - ConceptCardData (session-item-kinds.ts:40) and its view (session-item-view.tsx:136).
    - Old stored card items still render. **No DB migration.**
  - **(c) A new Teaching Step (such as "example").** Every list of step names changes:
    - navigator.ts:13, :359, :376; map.ts:528 (STEP_KEYS, held equal to navigator by a test).
    - instructions.ts:178 (rule text) and :228 (finish_teaching_step enum).
    - reply-checks.ts:12 and :86 (StepKind and caps); choices.ts:14, :29; course-map-view.tsx:10; behaviour/tutor-eval/setup.ts:92.
    - In all, 17 non-test files list step names.
    - `topic_progress.step` is free text (src/db/schema.ts:165), so adding a step needs no schema change. ADR 0001 says "dropping or adding a step needs a data migration" (docs/adr/0001…md, Consequences): rows saved at a removed step need moving.
    - Step dividers store step, number and label (src/tutor/session-items.ts:36-40), so old Sessions keep their old "Step k of N" text.

## 3. Course check and lesson lint: what is enforced

`npm run check` runs scripts/check-course.mjs, which runs each rule below in order.

| Rule | What | File |
|---|---|---|
| Outline schema | Spine Topics are numbered 1..n with no gaps; ≤15 min; **no prerequisites** (only drawsOn); drawsOn may not name Spine Topics | src/course/outline.ts:122-150 |
| Spine count | exactly SPINE_LENGTH (18) | outline.ts:157-160; check-course.mjs:42-43 |
| Schema | ≤2 Primers (map.ts:644, 676); Primer ≤3 lines, its term must be one of the Topic's terms, never at a check step (map.ts:630, 866-883); a Primer's Elective must be a Foundation Topic (map.ts:1160-1166); 0, 2 or 3 Connections (map.ts:710-714); file minutes = outline minutes (map.ts:1067-1068) | src/course/map.ts |
| L1 | Each Check has a card (Spine Checks after the first may share it); every Skill tested is taught on a card at or before its Check; ≥1 term listed | lesson-lint.ts:228-251 |
| L2 | ≥3 Quick tries per Skill, one of them half-done; ≥3×perAttempt questions | lesson-lint.ts:254-281 |
| L3 | Card ≤5 lines, sentences ≤20 words | lesson-lint.ts:285-297 |
| L4–L9 | presets, currency, no negative stems, Check numbers apart from the examples, Quick try Skill matches its Check, template draws apart | lesson-lint.ts |
| L10 | no typed number, no sum (ADR 0002) | lesson-lint.ts:529-563 |
| L11 | emoji names must be Icon names | lesson-lint.ts:499-503 |
| L12 | every wrong choice has a fix | lesson-lint.ts:509-519 |
| L13 | Spine quiz Check: ≥6 questions, ≥4 judgement kinds, ≥1 computed, no "what is it called" | lesson-lint.ts:568-600 |
| L14 | computed questions have a clear answer from the engine | lesson-lint.ts:610-622 |
| Spine shape | Case with a valuation block (except the annuity and cash Topics); one Workbench at explore; an Insight; **exactly 1 card**; 3–5 terms; 6–8 Quick tries; quiz Checks as above; no `ownWork`; no all_open mode; a why line; ≤15 min | src/course/spine-check.ts:37-98 |
| Beginner | Spine: **≤4 terms** (MAX_NEW_WORDS); no own-story Check; no "your story" text; a dailyLife line. Converted Electives need dailyLife too | src/course/beginner-check.ts:13, 39-64 |
| Critics gate | each Spine Topic has an entry in docs/critics/spine-log.yaml with 4 lenses and nothing left open | src/course/critics-log.ts:11-40 |
| Formulas | no typed formula outside goDeeper (ADR 0003) | src/course/formula-check.ts:8-21 |
| Connections | a Topic with an Insight has 2–3 Connections | src/course/connections-check.ts:8-13 |
| You'll learn / goal / why | words only; no figures; must not repeat the Insight; why ≤30 words | youll-learn-check.ts; goal-check.ts:21-45 |

**Not enforced anywhere:**
- **Term before use, across Topics.** No check compares a Topic's texts with the terms of earlier Topics.
- **Unlisted jargon.** beginner-check counts only `terms` entries, not words used in the texts.
- **Exactly one Case.** spine-check needs "a Case with a valuation block", not one Case: spine-15-value-yourself has 3, spine-09 has 2.
- Only per-Topic tests pin terms by hand: spine-01-beginner.test.ts:22-27 (term list, "sales" never "revenue"); spine-02-03-beginner.test.ts:47; share-terms.test.ts (operating margin as a share).

**The Tutor cannot follow term-before-use either:**
- It sees only the current Topic's terms (context.ts:139-141).
- The Learner summary lists no earlier Topics or terms (src/learner/memory.ts:244-292).
- Spine Topics may not have prerequisites (outline.ts:136), so "Unmastered prerequisites" is always empty on the Spine.
- The rule "explain any term the course has not taught yet" (instructions.ts:139, 151) lives only in the prompt.

## 4. Commentator names outside course/topics

**Visitor- or Learner-visible in production:**
- Home and How it works source line: "Aswath Damodaran, "Can Amazon.com be valued?", March 2000". src/site/copy.ts:256-260, used in src/app/(site)/_home/levers-story.tsx:115 and src/app/(site)/how-it-works/moves.tsx:214.
- About page: "published work by Aswath Damodaran and others…" with a named link. copy.ts:464-466, used in src/app/(site)/about/page.tsx:93.
- Example page sources (amazon example): label "Aswath Damodaran, The Dark Side of Valuation…" and note "…on Damodaran's inputs…". src/site/examples.ts:127, 131, rendered at src/app/(site)/examples/[slug]/case-flow.tsx:149-158.
- Signal Levers widget footer: source "Damodaran's valuation of Amazon, Feb 2000…" and its link name. src/components/signal/LeversWidget.tsx:481-482.
- Workbench story chips the Tutor can open (ready-made presets): `caseStory: "Damodaran's story"` ×10. src/widgets/recipes/set-workbench.ts:224, 240, 259, 275, 285, 295, 314, 324, 334, 352. Source titles "Damodaran, Can Amazon.com be valued?…" go into the readouts (set-workbench.ts:191-193, 263-264, 533-535).
- Market readings shown beside the Workbench:
  - credit "Aswath Damodaran, NYU Stern" (src/markets/readings.ts:113; yardsticks.ts:36);
  - source "Damodaran Online, … January 2026 update" (yardsticks.ts:60);
  - titles "Damodaran, Historical Implied Equity Risk Premiums…" and "Damodaran, Equity Risk Premiums (ERP)…" (readings.ts:179-180);
  - all rendered at src/widgets/market-readings-view.tsx:32-36. Europe, Japan and Korea use the same builder (readings-europe.ts:21; readings-japan-korea.ts:56, 64).
- Own Case range check (Assignment): yardstick source "Damodaran Online…". src/widgets/range-check-view.tsx:19-21; Own Case sources at src/finance/own-case.ts:200-204.
- Library citations: the reply "sources" line and the passage page show the credit lines:
  - "Aswath Damodaran, Musings on Markets…" (scripts/library/sources.json:8);
  - "Aswath Damodaran, NYU Stern… spreadsheets" (:20);
  - "…papers" (:31);
  - shown at src/tutor/sources.ts:30-35, src/app/reply-markdown.tsx:79 and src/app/passages/[id]/page.tsx.
  - Spreadsheet passage text itself says "linked from Aswath Damodaran's post" (src/library/spreadsheets.ts:152).
- Topic titles drawn from Topic files and the outline: Follow/Judge titles "Follow: Damodaran, …" and "Follow: Zitron, …" (outline.yaml:1472, 1485, 1501, 1516, 1528, 1542, 1556, 1572, 1585, 1663). They appear on the Course Map, Topic bar, Topic Start card, "Next Topic" and Notebook Connection titles.

**Tutor-facing (the Tutor may repeat them):**
- instructions.ts:187: the Tutor names the writer when "the writer is the subject (a Follow Topic…)" and "when the Learner asks where a figure or idea comes from… by name". Also `source "Damodaran"` as an example.
- instructions.ts:188: "(such as Zitron's articles)".
- instructions.ts:306: search_library tool description `e.g. "Damodaran"`.
- context.ts:379: "Piece studied: ${piece.author}…" for Follow Topics.
- Case title and story via context.ts:164; spine-01's story names "Aswath Damodaran" (spine-01-worth.yaml:25).
- Widget readouts carry "(sourced: Damodaran…)" (value-levers-model.ts:866; wacc-stack-model.ts:420).

**Dev and test only (not production):**
- src/dev/e2e-tutor.ts: 30 hits. These are scripted Tutor replies the e2e specs assert, for example :434, :768, :821.
- src/app/api/dev-e2e/route.ts:56 (comment); src/course/spine-fixture.ts.
- e2e/spine-01.spec.ts, e2e/spine-02-03.spec.ts, e2e/about.spec.ts, e2e/own-case*.spec.ts.

**Code comments only (not shown):** finance/*, markets/*, library/*, widgets/workbench/*-model.ts comments, db/schema.ts:471, 512, 602.

**Not checkable from the repo:**
- Case Data `source` strings are imported JSON, stored in DB `case_datasets` and shown at src/widgets/case-data-view.tsx:65-67 and sources.ts:92. Check in the DB.
- Emails: there is no email code in the repo; Clerk sends them (its config).

**Constraint:** the Library licences say "quoted briefly with credit" or "used with acknowledgement" (sources.json:6-8, 20, 31), and the course check needs every Market reading to carry a credit (check-course.mjs:88-91; marketReadingErrors). Removing the name from credit lines may conflict with these terms. Lesson text and chip labels can drop it freely.

## 5. Spine length, order and progress keys

**Length and order:**
- `SPINE_LENGTH = 18` (src/course/outline.ts:21) and the schema cap `SPINE_MAX = 18` (:15); each Spine Topic ≤15 minutes (:22).
- Order is the `spine:` number in course/outline.yaml (for example lines 15, 29, 52, 70 … 341). The default path sorts by it (navigator.ts:129-130). Topic files may not set stage or place (map.ts:1064-1065).
- `SPINE_LIVE_WITH` hard-codes 5 ids (navigator.ts:110). **If any of them is missing, `spineLive` turns false and the default path becomes every off-Spine Topic in outline order** (navigator.ts:126-128).

**Progress is keyed by Topic id, never by position:**
- `topic_progress` PK (learner_id, topic_id), with step stored as text (src/db/schema.ts:160-173).
- `check_results` by topic_id and check_id (:175-193).
- `sessions`: one live per (learner, topic) (:83-86).
- `insight_attempts`: settled once per (learner, topic) (:238-240).
- `skill_state` PK (learner, topic, skill); `practice_answers` by topic and skill (schema.ts ~743-800).
- `review_cards` PK (learner, question_id) (:421-439).
- `note_items` by topic_id (~664-690); `skip_ahead_attempts` by topic per day (~877-893); `topic_restarts` by topic_id (:95-111).
- `learner_state.current_topic_id` (:141-156).
- In memory: `Progress.topics: Record<topicId, …>` (navigator.ts:27-31).

**What spine-renumber.test.ts protects** (src/course/spine-renumber.test.ts):
- A Spine number lives only in outline.yaml.
- Swapping numbers on the real outline keeps the whole course check green: lesson lint, spine-check, critics, formula, written-ahead, connections, you'll-learn and goal (:34-52, 55-73).
- The Spine stays live and the default path follows the new order (:75-83).
- It does **not** test adding or removing Spine Topics, or progress.
- It hard-codes the ids spine-02-money-later, spine-03-cash, spine-15-value-yourself, spine-04-growth and spine-05-margins.
- Tests for keeping progress live elsewhere: spine-statements.test.ts:58 and spine-01-beginner.test.ts (the "passed before" block).

**Cost to replace the Spine:**
- **Keep progress:** reuse the existing Topic ids and Check ids, rewrite the content, and renumber in the outline.
  - Passes, Sessions, Notes and Reviews stay.
  - New Checks must be non-required to avoid Due Checks.
  - A Learner who wants the rewritten lesson can Start over: the snapshot keeps the old attempt (schema.ts:95-111).
- **New ids:**
  - Old rows stay in the DB but drop out of view: Course Map and Notebook iterate `map.topics` only (navigator.ts:608; src/learner/notes.ts:110), so the Learner's own note lines on removed Topics vanish from the Notebook.
  - Reviews of removed questions are silently dropped (navigator.ts:650).
  - A `current_topic_id` pointing at a removed Topic falls back to the default path (navigator.ts:152-160).
  - Past Sessions show the raw id as their title (src/tutor/past-sessions.ts:47).
  - **The Assignment re-locks** for Learners who passed the old Spine: `spinePassed` needs every written Spine Topic passed (navigator.ts:137-140; src/learner/own-cases.ts:44; src/app/course/page.tsx:32).
- **Edits needed either way:**
  - outline Spine entries; SPINE_LENGTH and SPINE_MAX; SPINE_LIVE_WITH; HOME_TOPIC_ID (src/site/home-topic.ts:8); Example `topicId`s (src/site/examples.ts:56, 99).
  - critics log entries (docs/critics/spine-log.yaml, 18 now).
  - dev-e2e states (src/app/api/dev-e2e/route.ts:57-145) and scripted replies (src/dev/e2e-tutor.ts).
  - **51 src test files and 12 e2e specs** hard-code Spine ids.
  - Site counts come from the outline (src/site/stats.ts:26-38), but copy says "N core Topics…" (copy.ts:468-469).
  - Valuation blocks live in Elective and Follow files and the Spine borrows them via `valuationFrom`: amazon-dcf-2000 in val-dcf, webvan-centre-npv-2000 in cf-capital-budgeting, fol-tesla-2020-diy, uber-vc-narrative-2014 in val-young, wework-leases-2019 in fs-leases-debt, coffee-day-* in val-distress and val-india, zomato-ipo-2021 in ana-build-valuation, fol-uber-2014-crowd. Deleting those files breaks the Spine.

## 6. Electives, Primers, Follow/Judge/Analyse and Skip ahead wiring

- **Stages:** `STAGES` = spine, foundation, follow, judge, analyse (outline.ts:12). Foundation Topics need a Subject, others must not have one (outline.ts:99-100). `isElective` (outline.ts:166).
- **Default path:** Spine, then follow/judge/analyse, with Electives only when chosen (navigator.ts:104, 125-131). `currentTopic` honours a chosen Topic (:152-160). `jumpTo` and `returnToDefaultPath` (:342-358).
- **Course Map page** (src/app/course/course-map-view.tsx):
  - Recommended next card (:217-229); "You chose X. The default path continues…" (:233-240).
  - Spine section with progress bar (:244-262); Assignment section, locked until the Spine is passed (:264-279).
  - **Electives** by Subject (:281-297), with "Used in Spine Topic N" (:80) and "taught live" (:81).
  - Follow/Judge/Analyse sections (:299-312); Coming (:315-329).
  - Page wiring: src/app/course/page.tsx:24-32.
- **Home and Welcome:** home-button.ts:21-29 (whatComesNext); welcome firstTopic (src/app/welcome/page.tsx:23); Study page (src/app/study/page.tsx:95-106).
- **Primers:**
  - Schema at map.ts:626-642 (Elective link required, :1160-1166); shown on entering a step (src/course/primers.ts; src/tutor/primer-items.ts; practice.ts:491).
  - View src/app/primer-view.tsx; API src/app/api/primer/route.ts.
  - Used in 10 of the 18 Spine Topics.
- **Follow/Judge/Analyse:**
  - Case `piece` schema (map.ts:362-376); Tutor piece lines and paste flow (context.ts:378-394; src/tutor/pasted.ts; schema.ts:602-627 pasted_texts).
  - Instructions rule (instructions.ts:188); site "stages read real arguments" (stats.ts:6, 38; copy.ts:468-469).
- **Skip ahead:**
  - Rules in src/course/skip-ahead.ts; save, mark and pass in src/learner/skip-ahead.ts; questions scheduled as Reviews (src/learner/review.ts).
  - API src/app/api/skip-ahead/route.ts; view src/app/skip-ahead-view.tsx; offered on the Topic Start card (topic-start-card.tsx:57; study/page.tsx:101-102).
  - Tutor lines (context.ts:268-272; turn-facts.ts); DB table (schema.ts:877-893).
  - ADR 0004 requires it, and spine-check says every Spine Topic offers it (spine-check.ts:15-16).
- **Prerequisites as hints:** "Do first" links (course-map-view.tsx:96-106); the Topic Start card's "before" list (topic-start.ts:44); Tutor rule at instructions.ts:199.
- **Converted vs taught live:** 20 Topics are converted (18 Spine + num-percent-bps + num-compounding). 93 sit on LESSON_NOT_YET_CONVERTED (lesson-lint.ts:27-122) and are taught live from `concept` text.
- **Cost to collapse to one fixed linear list:**
  - Every Topic becomes the Spine stage: SPINE_LENGTH and SPINE_MAX change, and the 15-minute cap and spine-check apply to all.
  - Or keep the stages and hide the sections: remove the course-map-view sections; drop `drawsOn`/"Used in"; drop Primers or retarget them (Elective-link rule map.ts:1160); drop AFTER_SPINE stages from defaultPath.
  - Also: site counts and copy (stats.ts, copy.ts:468-469); the Tutor "Course Map lists every Topic" rule (instructions.ts:199); Connections that link to Electives (map.ts connectionProblems); Skip ahead (keep or remove); the Assignment gate (spinePassed).
  - Electives keep progress rows if they stay as files. Deleting files hides passes, notes and Reviews (see 5).

## 7. The valuation engine (ADR 0010): what it can value

- **Engine:** src/finance/dcf-engine.ts:14-49 (inputs), 180-224 (`valueStory`).
  - FCFF only: revenue growth → operating margin → tax (with NOL) → reinvestment = Δrevenue / sales-to-capital (yearCash, :152-169).
  - Discounting at a cumulative yearly cost of capital (:187-189).
  - Terminal value: year-11 FCF with reinvestment g/ROC, divided by (year-10 WACC − g) (:198-202).
  - Failure weighting (:204-211). Equity bridge: + cash − debt − options, ÷ shares (:213-216).
- **The four levers** (valuation-case.ts:219-240, `inputsFor` 260-315):
  - revenueYear10 (scales the growth path, dcf-paths.ts:36);
  - marginTarget (halving path, or per-year shift);
  - salesToCapital (flat or scaled per year);
  - costOfCapitalGrowing (year 1 moves, year 10 kept, dcf-paths.ts:81-90).
  - Plus failureChance, growthAfter, costOfCapitalAfter, cash, debt and options (Terminal seesaw, Value bridge).
- **Supported inputs** (valuation-case.ts:36-79):
  - currency USD/INR/JPY/KRW/EUR (money.ts:7); units millions/crores/billions.
  - 10 yearly growth rates; margin as a halving path or yearly with an after-margin; flat or yearly tax; NOL; flat or yearly sales-to-capital; 10-year cost-of-capital path.
  - terminal growth (must be < year-10 WACC) and terminal ROC.
  - cash, debt (leases counted as debt by convention), options (a fixed amount), shares.
  - `per: share | company` (private companies); failure chance with a fixed or %-of-value recovery.
- **Not supported:**
  - **FCFE, dividend or excess-return models for banks and insurers.** The Own Case excludes them: "Any other firm (not a bank or insurer)" (own-case.ts:24). DDM and Gordon exist only as Tutor calculators (src/finance/calculators.ts:266-284), outside the engine.
  - Country risk premium as an input: cost-of-capital-stack.ts takes risk-free, ERP, beta, debt share, cost of debt and tax only (:8-21, 65-79); CRP must be baked into the WACC path.
  - Non-operating assets, cross-holdings and minority interests: only folded into cash by hand (Uber note in valuation-cases.generated.ts:544).
  - R&D or lease capitalisation: done before entry (notes at generated.ts:652).
  - Option pricing (options are a typed amount); more than 10 explicit years; a mid-year convention; base revenue ≤ 0 (pre-revenue) (valuation-case.ts:39); scenario weighting beyond the single failure branch.
- **Side tools:**
  - Relative valuation: `justifiedMultiple` = value-to-sales from growth, WACC and margin (src/finance/justified-multiple.ts), the multiple_decoder Workbench.
  - implied-erp.ts: two-stage index-implied premium. cost-of-capital-stack.ts: CAPM + debt mix + relevered beta.
  - Workbench recipes: value_levers, cash_waterfall, wacc_stack, terminal_seesaw, value_bridge, multiple_decoder (map.ts:38). Value levers modes: market, margin_marks, roic, failure, two_stories, match_price, range, all_open (set-workbench.ts:108-109).
- **Own Case (Assignment)** (src/finance/own-case.ts):
  - Markets IN, US, JP, KR, EU (:9); industries auto, food, software, "any other (not bank or insurer)" (:20-25).
  - About 8 typed figures (:121-140); NOL 0, options 0, no failure input (:227-234).
  - Growth and WACC run 5 years then fade linearly (:166-171); the margin halves toward its target.
- **Valued Cases today** (11 blocks): amazon-dcf-2000; webvan-centre-npv-2000 (illustration); fol-tesla-2020-diy; fol-uber-2014-crowd and uber-vc-narrative-2014 (per company); jud-nn-uber-2014-post; jud-nn-uber-s1-2019; wework-leases-2019; zomato-ipo-2021 (INR); coffee-day-distress-2019 and coffee-day-rupee-valuation-2015 (INR crores, illustrations).
  - Covered: young or loss-making growth companies, a distressed company, leases-as-debt, private (per company), India.
  - Not covered: a bank or insurer, a cyclical or commodity firm, a mature dividend payer, and a multi-segment company (no model for these).
