# Value It: one linear Course, from zero to valuing any company

| | |
|---|---|
| Status | Accepted direction; build not started |
| Date | 19 November 2026 (owner grilling session) |
| Decisions | ADR 0021 (one fixed Course, built bottom-up), ADR 0022 (Beats shown as written; hand-first sums), ADR 0023 (two Anchor companies, the Shortcut ladder), ADR 0024 (no commentator names in teaching) |
| Supersedes | ADR 0004 in full; ADR 0020's Spine length and judge-only path; the Spine parts of spec #68 |
| Curriculum | [`linear-course-curriculum.md`](linear-course-curriculum.md): every Lesson, the Term ledger, the world-forces map and company-type coverage |
| Research | Branch `research-linear-course`: the 113-Topic audit (`handoff/audit/`), the code plan and the Anchor data check, all read 2026-11-19 |

Words follow `GLOSSARY.md`: Course, Unit, Lesson, Can-do line, Core, Term, Beat, Hand-first sum, Teaser, Anchor company, Valuation sheet, Shortcut, Rough value, Commentator, Skip ahead. Code still says `topic` and `spine` until the rename slice.

## Problem Statement

The Owner is Learner #1 and a beginner. They opened the first Spine Topic and met "operating margin" with no teaching. An audit of all 113 Topics (2026-11-19) found the problem is the shape of the course, not one Topic:

- Topic 1 shows the whole machine before any part is taught: four Levers, the after-year-10 bar, the share bridge and failure. Margin is taught at Topic 6, failure at 12, multiples at 14, and "revenue" never.
- About half of all terms are used before they are taught.
- The order runs backwards in places: cash before the statements; the Levers in the order 3, 1, 2, 4.
- Depth is capped by rule: one card of at most five lines per Topic, 250 to 350 words of teaching against 750 to 1,300 words of quiz. The `concept` text is never shown; the Tutor paraphrases it in about 80 words.
- Five core sums are never worked anywhere: the cost of equity, the cost-of-capital blend, the terminal value, an expected value and a justified multiple.
- Amazon 2000 is the Case in 8 of 18 Topics. Nothing a Learner works out carries into the next Topic.
- 95 Topics sit off the Spine. The default path then runs 23 Follow, Judge and Analyse Topics built on named writers. One writer's name appears about 250 times in Topic files.

ADR 0004 bet that showing the whole picture first motivates a beginner. In practice it reads like binge-scrolling: a stream of words with nothing underneath them. And at the end a Learner still cannot value most kinds of company: banks, young companies, cyclical ones, companies in emerging markets or near failure.

## Solution

Value It becomes one fixed Course of about 75 Lessons in about 11 Units, climbed in a locked order from absolute zero. Lesson 1 assumes an adult who does not know what revenue or a share is. Each Lesson teaches one idea on top of the one before. No Term is used before the Lesson that teaches it, in Lessons or in Tutor replies; the course check fails if one is.

Two Anchor companies run through the Core: Coca-Cola (dollars; mature, slow growth, high margin, little reinvestment, low risk) and DMart (rupees; fast growth, thin margin, heavy reinvestment, India's country risk), both as of 31 July 2019. Each Core Lesson opens on the previous Lesson's result, adds a line to each Anchor's Valuation sheet and ends on a Teaser the next Lesson answers. Each Unit ends on a Can-do line.

At about Lesson 20 the Learner makes a Rough value of both companies with five named Shortcuts: profit counts as cash; the rate is a guess; growth is flat; the business counts as the shares; the company survives. Each later Unit removes one Shortcut and both values move. When the last one goes, the Reveal shows what really happened to both companies, COVID included. After the Core come Stories, Pricing, every company type, and a Capstone that ends with the Learner's own company as an Own Case.

Lessons teach in Beats: a few short lines shown exactly as written, an interactive visual, a quick tap. Each new sum is worked once by hand, by tap, with its steps drawn; after that the engine does it. The Tutor gives feedback, answers the Learner's own questions and re-teaches after a miss; it never writes the main explanation. The world (central banks, interest rates, inflation, bonds, the dollar and the rupee, country risk, trade, insurance, diversification, competition, cycles) is taught where it moves a valuation input, with a dated event. No commentator is named anywhere a Learner reads while learning.

There are no users yet, so all progress is reset and nothing is migrated.

## User Stories

**Starting from zero**

1. As a Learner who knows no finance, I want Lesson 1 to start with what a business is and what owning a piece means, so that I am never lost on the first screen.
2. As a Learner, I want every new word explained in plain words first and then given its real name, so that I never meet a word I must look up.
3. As a Learner, I want one name per idea after it is taught ("revenue", not also "sales" or "turnover"), so that I do not think two words mean two things.
4. As a Learner, I want report names like "turnover" or "operating income" taught once, in the Lesson about reading a report, so that a real annual report does not trip me.
5. As a Learner, I want about three new words per Lesson, so that each Lesson feels possible.
6. As a Learner, I want every Lesson to open on what I found in the one before, so that I feel the steps add up.
7. As a Learner, I want every Lesson to end on a question the next Lesson answers, so that I want to keep going.
8. As a Learner, I want each Unit to end by telling me what I can now do ("You can now read any income statement"), so that I see my progress in skills, not points.
9. As a Learner, I want no streaks, points or badges, so that the pull comes from understanding.

**The Course**

10. As a Learner, I want one Course in one order, so that I never have to choose what to study next.
11. As a Learner, I want the next Lesson to open when I pass the current one, so that I never skip a step I need.
12. As a Learner who already knows a Lesson, I want "I know this: test me", so that I can pass it with one short quiz.
13. As a Learner who passes a Lesson by "test me", I want its Valuation sheet lines filled for me and marked so, so that the build carries on.
14. As a Learner, I want to reopen any passed Lesson read-only, so that I can look back without losing my place.
15. As a Learner, I want the Course page to show Units, which Lessons are passed, current and locked, and each Unit's Can-do line, so that I see the whole climb.
16. As a Learner, I want "Next lesson" on Welcome and Home, so that I return to the right place in one press.
17. As a Learner, I want each Lesson to take 15 to 25 minutes, so that I can finish one in a sitting.

**Beats**

18. As a Learner, I want each idea taught in a few short lines, then a visual I can move, then a quick tap, so that I learn by seeing and doing, not by reading walls of text.
19. As a Learner, I want the explanation shown exactly as written by the course, so that every Learner gets the same tested teaching.
20. As a Learner, I want to predict before a visual reveals the answer, so that I notice what I expected.
21. As a Learner, I want a wrong tap to show me why it was wrong and give me a fresh try, so that a miss teaches me.
22. As a Learner who misses twice, I want the Tutor to re-teach the idea another way, so that I am not stuck.
23. As a Learner, I want to work each new sum once myself, by tapping the right result with the steps drawn, so that I see inside the machine.
24. As a Learner, I want the engine to do that sum after I have worked it once, so that I am never asked the same sum twice.
25. As a Learner, I want a Formula Card when a formula helps, with every symbol named in words, so that formulas do not scare me.
26. As a Learner, I want to ask the Tutor my own question at any Beat, so that my doubts get answered where they arise.
27. As a Learner, I want every question to be a tap, so that I never type a number while learning.

**The Anchor companies and the Valuation sheet**

28. As a Learner, I want two real companies carried through the whole Core, so that what I work out in one Lesson is still there in the next.
29. As a Learner, I want one slow, steady company and one fast-growing one, so that I see why the same idea gives different answers.
30. As a Learner, I want one company in dollars and one in rupees, so that currency and country risk come up inside the valuation, not beside it.
31. As a Learner, I want both companies to stand as of 31 July 2019, so that I value them without knowing what happened next.
32. As a Learner, I want a Valuation sheet for each company that grows by one line per Lesson, so that I watch a full valuation take shape under my hands.
33. As a Learner, I want to pick each input from a few tapped options with feedback, so that I practise choosing with a guide.
34. As a Learner, I want every line on the sheet in plain words, with a card that explains it on tap, so that I can explain every line.
35. As a Learner, I want every figure on the sheet to come from the company's real annual report, with the page, so that I learn where numbers live.
36. As a Learner, I want no value shown until I have learned enough to make one, so that the first number means something.

**The Shortcut ladder and the Reveal**

37. As a Learner, I want a first Rough value of both companies at about Lesson 20, so that I can value something early.
38. As a Learner, I want the Shortcuts in my Rough value named on the sheet, each with the Unit that removes it, so that I know what is still simplified.
39. As a Learner, I want each later Unit to remove one Shortcut and show how both values moved, so that I feel what each real piece is worth.
40. As a Learner, I want to see the old and new value side by side when a Shortcut goes, so that the change is clear.
41. As a Learner, I want the Reveal, after the last Shortcut, to show what happened to both companies (sales, margins, prices, COVID, the rupee), so that I judge my valuations against reality.
42. As a Learner, I want nothing after 31 July 2019 shown before the Reveal, so that hindsight never leaks into my choices.

**The world, woven in**

43. As a Learner, I want interest rates and central banks taught where they move the rate I use, with a real dated decision, so that the news makes sense.
44. As a Learner, I want inflation and the dollar against the rupee taught where they change DMart's numbers, so that I can handle any currency.
45. As a Learner, I want country risk taught where it raises DMart's rate, so that I can value a company in any market.
46. As a Learner, I want insurance, diversification and portfolios taught where they explain which risk a rate pays for, so that "risk" is not a vague word.
47. As a Learner, I want competition, trade and tariffs, and business cycles taught where they shape growth and margins, so that my forecasts have reasons.
48. As a Learner, I want options taught only where valuation uses them (staff options, shares in a company near failure, hedging), so that I do not study what I will not use.

**After the Core**

49. As a Learner, I want a Stories Unit where I turn a story into Lever settings, judge other people's stories, and update on news, so that I can test a claim.
50. As a Learner, I want a Pricing Unit (multiples, peers, what a multiple assumes, reading a price backwards), so that I can compare value with price.
51. As a Learner, I want a Lesson for each company type (young, mature and declining, near failure, cyclical, research-heavy, banks and insurers, multinational, holding groups), so that I can value any company.
52. As a Learner, I want a Capstone where I find every input in a real report, then value an unseen company with lighter guidance, so that I prove I can do it.
53. As a Learner who has passed the Course, I want to value my own company as an Own Case, typing its numbers from its annual report, so that I can use what I learned.

**The Tutor**

54. As a Learner, I want the Tutor to use only words I have been taught, so that its answers never undo the Course's care.
55. As a Learner, I want the Tutor to explain any other finance word in plain words if it must use one, so that I can always follow.
56. As a Learner, I want the Tutor's re-teach and Go deeper replies checked before they show, so that they obey the same rule.
57. As a Learner, I want the Tutor to know both my Valuation sheets, so that its feedback fits my numbers.

**Names**

58. As a Learner, I want no professor, analyst or writer named in Lessons, visuals or Tutor replies, so that the teaching reads cleanly.
59. As a Learner, I want a published valuation called "an analyst's valuation", so that I judge it on its numbers.
60. As a Learner who wants to read further, I want a fine-print source line with a link, so that I can find the author.
61. As a Visitor, I want Home, How it works, About and the Examples to name no commentator outside source lines, so that the site sells the method, not a person.

**Owner and authors**

62. As the Owner, I want the course check to fail on any Term used before its Lesson, in any field a Learner sees, so that the rule holds as the Course grows.
63. As the Owner, I want the course check to report the new-Term load per Lesson and per Unit, so that I see heavy Lessons.
64. As the Owner, I want the course check to fail when a Lesson does not open on the one before, has no Teaser, or skips an Anchor in the Core, so that the chain holds.
65. As the Owner, I want the course check to fail on a commentator's name in any learner-visible field, so that ADR 0024 holds.
66. As the Owner, I want to preview the new Course on an admin-only route while the old one still serves Home and the Examples, so that production never breaks during the build.
67. As the Owner, I want every Anchor figure to carry its source and page, so that a wrong number can be traced.
68. As the Owner, I want all progress reset at the switch, behind a snapshot, so that no old Topic state lingers.
69. As a content author, I want one Term registry with plain stand-ins and report aliases, so that I know which words a Lesson may use.
70. As a content author, I want a Lesson's labels drawn by code (visual labels, Formula Cards, sheet lines) checked too, so that a widget cannot leak a word early.

## Implementation Decisions

**Strategy**
- Build the new Course beside the old one: new modules, new tables and an admin-only preview route. The old Topic pipeline keeps Home, the Examples and the Signal widget working until the new Course runs end to end. Then switch over in one slice, reset the data, and rename code identifiers last.
- Every new module uses the words Lesson and Unit from the first day.

**The Lesson shape (ADR 0022)**
- Five Teaching Steps replace the seven: open, beats, build, check, close.
  - **open**: code shows the previous Lesson's result line, a small snapshot of both Valuation sheets and today's question (the previous Teaser). No Tutor turn opens a Lesson.
  - **beats**: Beats 1 to n, with the current Beat stored. Each Beat is one card: `say` (at most 3 lines of at most 20 words, shown exactly as written), one visual (a recipe preset, drawn inline, interactive) and one tap (2 to 4 choices or True/False, marked by code, a fix on every wrong choice).
  - Beat kinds: **teach** (the default); **hand** (a Hand-first sum: code works out the choices with a tested calculator, the visual draws the step, a Formula Card is optional); **predict** (the Learner taps before the visual reveals; a predict tap is never wrong).
  - First miss: the fix and a variant of the question. Second miss: a held Tutor re-teach, then a fresh variant.
  - **build**: for each Anchor, the Learner taps an option for each new sheet line; each option has a verdict (accept or fix) and a feedback line. If the Lesson removes a Shortcut, a "value moved" card shows the old and new value for both Anchors.
  - **check**: a quiz Check through the existing quiz path. A failed Check uses the existing review of missed questions.
  - **close**: the Can-do line (last Lesson of a Unit only), the Teaser and Next lesson.
- A Lesson file declares: id, title, minutes (15 to 25), goal, what it opens on (the previous Lesson and the Teaser it answers), the Terms it teaches and in which Beat, its Beats, its build lines per Anchor, the Shortcut it removes (ladder Lessons only), whether it holds the first Rough value, its Check, optional Go deeper, its Teaser, its Can-do line (Unit ends) and a per-Lesson allowlist with reasons.
- ADR 0001 holds and is stronger: the file holds the teaching, code sequences and marks every answer, and the main explanation is shown as written. Skills, known mistakes and the two-miss ladder stay. Dropped: the Insight at explore, the Running example (the Anchors replace it), concept, principle, connections, the daily-life line and Primers.

**The Lesson shape check** (replaces the Spine shape rules and lesson lint L13)
- 4 to 12 Beats; `say` at most 3 lines and at most 20 words per line; exactly one visual and one tap per Beat; every wrong choice has a fix; no typed number.
- A tap may ask for the result of a sum only in a hand Beat (narrows ADR 0002; L10 and reply check V8 gain this one exception).
- Every Skill a Check tests is taught by a Beat at or before it.
- The Check pool holds at least three times the questions per attempt. The Check covers every Beat Skill at least twice, and at least one question uses an Anchor. From the first Rough value on, at least one judgement question about the Anchors.
- Declared minutes within 30% of an estimate (about 1.5 minutes per Beat, plus build and check): a warning, not a failure.
- Kept as they are: the currency rule (extended to Beats about an Anchor), computed choices at least 5% apart, the formula check, Market readings dated and sourced, written-ahead.
- The beginner check becomes the Term check; the connections and "you'll learn" checks go (the chain replaces them); the full-sheet words check becomes a check on the sheet's words; the critics log is re-keyed to Lesson ids.

**One fixed Course (ADR 0021)**
- The outline becomes Units, each with a title, a Can-do line and its Lessons in order. File order is Course order. A Lesson without a file shows as Coming.
- The navigator: the current Lesson is the first one not passed; a Lesson is unlocked when the one before is passed; passed Lessons open read-only; the Course passed gates the Capstone's Own Case.
- The Lesson and Turn APIs refuse a locked Lesson.
- Removed: Stages, the Spine constants and the fallback to off-Spine Topics, chosen-Topic jumps, prerequisites, Due Checks and restructures, explore and Insight, Primers, pasted pieces for Follow, Judge and Analyse, the Course Map sections, the Topic conversion lists, the Home Topic id (it becomes the first Lesson), stage counts on the site.
- "I know this: test me" (from Skip ahead): 4 to 8 questions from the Check and the Beat taps, at most 1 miss, once a day, offered on the current Lesson only. A pass fills the Lesson's sheet lines with their default option, marked "filled for you".
- Renaming in stages: on screen first (every string a Learner or Visitor sees, the Tutor's app words, guarded by a scan test); the new modules use Lesson and Unit from day one; a mechanical identifier and column rename after the switch.

**The Term registry and the Term check (ADR 0021)**
- One registry of Terms. Each has one canonical name, its irregular forms, its plain stand-ins (allowed before it is taught), its report aliases (taught in one report Lesson), an acronym flag, an ambiguity flag with patterns for words like share, interest, return, capital and value, and its Lingo text.
- A Term is taught only where a Lesson's `teaches` list says. Each Term is taught in exactly one Lesson.
- The matcher is pure and shared with the Tutor's reply check: normalise (Unicode, lower case, markdown stripped, quotes straightened, possessives dropped, hyphens, dashes and slashes as spaces); scan a token trie longest match first, so "operating margin" never also counts "margin"; acronyms match on the original text at word boundaries; ambiguous Terms count only by their patterns.
- **Hard fail**: a Term's name or alias used anywhere before it is taught. Taught means earlier Lessons' Terms plus this Lesson's Terms whose teaching Beat is at or before the text's Beat. The open step sees only earlier Lessons; build, check and close see the whole Lesson.
- Fields scanned: everything a Learner sees, including title, goal, the opener's result line, `say`, visual input strings, taps, choices, fixes and variants, build options and feedback, Check prompts, choices, explanations and fixes, Teaser, Can-do line, Go deeper, Case text and Lingo text.
- Code-drawn labels count too: each visual recipe declares the Terms its fixed labels use; each Formula Card declares its Terms; each sheet line's label is its Term. (A hard-coded "Operating margin once mature" label is how the word reached Topic 1.)
- Teaching Beat: a Term's first use in its Lesson is in its declared Beat, and a stand-in appears before the name in that Beat.
- Warnings: a stand-in used after its Term is taught; unregistered jargon from a watchlist. A stand-in that is itself a later Term fails.
- Allowlists, global and per Lesson, each entry with a reason.
- Soft budget: a table of new Terms per Lesson and the Course average. Warn above 5 in a Lesson and above 3.5 on average in a Unit. Never fail.
- **The chain check**: each Lesson opens on the one right before and answers its Teaser; every Lesson has a Teaser; every Core Lesson builds at least one line for both Anchors; the last Lesson of a Unit has a Can-do line; the first Rough value comes once; Shortcuts are removed in Unit order (report, risk, levers, share, survival); a sheet line the engine computes with a sum appears only at or after the hand Beat for that sum. A Lesson not yet written breaks the chain with a warning only.
- Each failure names the Lesson, Beat, field, Term and where the Term is taught.

**The Valuation sheet and the Shortcut ladder (ADR 0023)**
- Anchor data lives in git, one file per Anchor: currency and unit (USD millions; INR crore), As-of date, price, shares, every report figure with its source (title, URL, page), the Reveal (what happened next) and an optional analyst's valuation whose credit sits in a fine-print source line only. The figures checked so far are in the appendix.
- Sheet lines are declared once: an id, its Term, a section (business, report, risk, forecast, share, survival, value), its input and kind (figure, choice, derived) and the sum that computes it.
- Schema change: a new table of sheet entries per Learner, Anchor and line: the chosen option, its value, the Lesson, who filled it (Learner, test me or default) and when. The value at any Lesson is recomputed from the entries and Course order; no value history is stored.
- The ladder is a pure module beside the valuation engine (ADR 0010 holds). The five Shortcuts: profit is cash, guessed rate, flat growth, business is shares, survives. Given the sheet inputs and the Shortcuts still active, it returns the business value, the equity, the value per share when known, what to compare with (market value or price), the Shortcuts active and the full DCF value; or an error naming the missing inputs.
- It always builds the engine's inputs and calls the one engine. Each active Shortcut changes the inputs: profit is cash sets a new engine flag so reinvestment is zero; flat growth makes growth, margin and rate constant with growth after year 10 equal to it; guessed rate puts the guessed rate in the rate path; business is shares sets cash, debt and options to zero with one share and compares with market value; survives sets the chance of failure to zero.
- The Rough value is after-tax operating profit valued as a growing perpetuity at one steady growth rate and a guessed rate. A test pins the first rung to the closed form P(1+g)/(r−g).
- The sheet is a fixed component in the style of ADR 0011: a pinned panel tab and its own page, the two Anchors side by side (tabs on a phone), lines by section, a Lingo card on tap, the newest line highlighted. The value block shows value against market value, chips for the Shortcuts still active (each naming the Unit that removes it) and a small line of the value across Lessons. Nothing shows before the first-value Lesson.
- The As-of rule (ADR 0013) keys on the Reveal Lesson for the Anchors: their Case Data and readings after 31 July 2019 stay hidden until it is passed.

**Engine extensions** (each with tests, ADR 0010)
- **Country risk**: a country risk premium and the company's exposure to it, as a "country" layer in the cost-of-capital stack; a converter from a dollar rate to a rupee rate by relative inflation; an optional cost-of-capital build in a valuation that derives the 10-year path (flat, then fading). Zero country risk gives today's stack.
- **Banks and insurers**: a new equity model valuing by excess return (book equity plus the present value of return on equity minus cost of equity, times book equity, plus a terminal), with retention set by a regulatory capital ratio times the growth of risk-weighted assets; a dividend model as a cross-check. Insurers use solvency capital. Under clean surplus the two agree.
- **R&D capitalisation**: turns a run of research spending and a life into a research asset, its amortisation, adjusted operating profit and added capital, applied before the engine.
- **Scenarios**: values a base and a set of scenarios with probabilities that sum to 1, returning each value, the expected value, the low and the high. One scenario equals today's value; failure is a two-scenario special case.
- **Formula Cards** grow with the Units, each with a tested calculator (ADR 0003): growing perpetuity, free cash flow, reinvestment, cost of equity, cost of capital, terminal value, equity bridge, expected value, country-risk cost of equity, excess return, justified multiple.

**The Tutor and the Term rule**
- The Tutor's context gains the list of Terms taught so far (from the registry, Course order and the Learner's Beat), the current Beat's text as written, both Valuation sheets, and the instruction to explain any other finance word in plain words. The Learner summary gains the current Lesson and the count passed.
- A new reply check flags a Term not yet taught, using the shared matcher. Terms the Learner typed in this Session are exempt. Held replies (re-teach, Go deeper, Check review) get one retry told the plain stand-in, then fall back to the Beat's own words (ADR 0006). Own-question streams get a soft check, recorded and never blocking; the stream guard keeps its three jobs.
- Go deeper material is checked by the course Term check; the reply is held and checked.
- The Tutor never gives the main explanation, never marks an answer and no longer opens a Lesson.

**Names out (ADR 0024)**
- Names appear only in source and credit fields, drawn by one fine-print source line component. Credit stays on the Passage page and the About credit.
- A names check with an Owner-extendable list runs over every Lesson and Case text in the course check; a unit test covers the code side; a new reply check blocks a listed name in held replies and records it softly in streamed ones.
- Code places reworded: the Home and How it works source line, the About copy, the Example notes and labels, the levers Widget label ("An analyst's valuation (Feb 2000)"), the Workbench story chips ("An analyst's story"), Market reading and yardstick credits, our own passage text, Library citation lines, Tutor instructions (writer exceptions removed), Widget readouts (a source id, never a name), the test bed's scripted replies.

**Reset and switch-over**
- At the switch a migration empties every progress, Session and Note table (Sessions, messages, items, Widget state, Turns, tool calls, reply checks, incidents, restarts, Learner state, Topic progress, Check results, misconceptions, quiz attempts, Reviews, review log, Note items, Skill state, practice answers, Skip ahead attempts, Own Cases). Kept: settings, Learners and profiles, the Library, Case Data, the question bank, login failures and usage. Dropped: Insight attempts, pasted texts and the "entered by jump" flag. A Neon snapshot comes first, and the merge needs the Owner's yes.
- The 113 Topic files leave the repo (git keeps them). The valuation blocks the site needs (Amazon 2000 for Home's $35.04, and the Cases for later company-type Lessons) move first to a Cases folder that the valuation registry reads.
- The course-map doc is regenerated from the new outline.

**Reviews and critics**
- Reviews stay, keyed to Lessons.
- The critics gate stays, keyed to Lesson ids; the beginner persona judges each Unit as it is written.

## Testing Decisions

- A good test checks what a Learner or Visitor can see or do, or what a number comes out as. It does not test how a module is built inside, and it survives a refactor that keeps the behaviour.
- **Seam 1, the course check** (Lesson files, the registry, the outline and the engine, in CI with no database). It covers: the Term rule (a Lesson using a Term taught later fails; a stand-in passes; an alias used early fails; a recipe label using an untaught Term fails); the matcher (hyphens, plurals, possessives, markdown, longest match, acronyms, ambiguous Terms); the soft budget table; the chain; the Lesson shape check; the names check. Each rule has a failing fixture that names the Lesson, Beat and field. Prior art: the Spine shape rules, lesson lint, the beginner check, the formula check.
- **Seam 2, the valuation engine and the ladder** (pure, inputs in git). It covers: the first rung equals P(1+g)/(r−g); golden values for both Anchors at every rung with default options, pinned to the cent; each Shortcut removed moves both values; country risk zero equals today's stack; DMart's cost-of-capital build pinned; excess return equals the dividend model under clean surplus, plus one published bank value; R&D capitalisation tables (flat R&D leaves operating profit unchanged); one scenario equals today's value and failure is a two-scenario case. Prior art: the Amazon acceptance value ($35.04 against the published $35.08), the Signal widget model tests, the implied-premium solver tests.
- **Seam 3, the browser on the test bed** (Playwright, signed test-bed person). It covers: open, three Beats, build, check, close with no Tutor call on the happy path; two misses give exactly one held re-teach; a reload restores the Beat; a locked Lesson is refused; passed Lessons are read-only; test me passes a Lesson and fills its sheet lines; the sheet shows no value before the first-value Lesson and the "value moved" card when a Shortcut goes; the phone layout at 360 and 390 px; no `Topic` or commentator name in visible text. Prior art: the Spine Topic 1 spec, the no-typing spec, the phone spec, the UI matrix of widths.
- **Tutor evals**: fixtures at early Lessons where the Tutor must avoid untaught Terms (at Lesson 3, no "operating margin" or "cost of capital") and name no commentator; the untaught-Term retry message.
- Existing checks stay green: theme contrast, the ADR cite check, the critics.
- Minutes per Lesson are measured by hand with real Learners and written into the Lesson files.

## Out of Scope

- Electives, Primers, and Follow, Judge and Analyse Topics. A Learner who wants bonds or derivatives for their own sake finds them only where valuation uses them.
- Futures, swaps and option-pricing maths.
- Live prices, bought company data and any "today" Market reading.
- Streaks, points, badges and leaderboards.
- Keeping any old progress. There are no users.
- Languages other than English.
- Changing the valuation engine's existing maths (ADR 0010); it only gains the extensions above.
- Payments, the Waitlist and the Owner's approval of each Learner (ADR 0014): unchanged.

<<UNITS>>

<<LADDER>>

## Build order

<<BUILD>>

## Open questions

<<OPEN>>

## Further Notes

- Decided in one Owner grilling session on 2026-11-19, after an audit of all 113 Topics, a check of the Anchor data and a code plan. Round 4 (Rough value, As-of date, Can-do line, Reviews, critics, licences) was answered "yes to all".
- The Course follows one well-known valuation method and uses its author's published datasets for Market readings. The author is credited in fine-print source lines only (ADR 0024).
- The Anchor data's traps are teaching material: Coca-Cola's refranchising and the restated 2018 revenue (use the as-filed 31,856, not the later 34,300) make a ready "updating on news" Lesson; DMart's standalone against consolidated figures, land in capital spending, the 2020 share issue and the September 2019 tax cut all fall after or around the As-of date.

<<APPENDIX>>
