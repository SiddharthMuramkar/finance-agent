# Tutor discovery: the spec-versus-repo audit for "Teach simply"

On 4 November 2026 a nine-agent audit checked the "Teach simply" plan (`TUTOR_SPEC.md`) against the repo before it became spec #229. It found 101 points, each confirmed by a skeptic with file and line evidence, and a critic listed 14 questions no point had covered. This page stands in for the spec's Phase 0 report. Each point has one line on how spec #229 resolves it, from its "Decisions taken" and "Further decisions from the repo audit" sections, with the ticket that builds it. The decisions behind the biggest changes are ADR 0006 (the Topic's file holds the teaching), ADR 0007 (ready-made Widgets only) and ADR 0008 (replies checked before they show).

The tickets: #230 reply checks, #231 teaching engine, #232 Skill state and the ladder, #233 Go deeper and the one-Skill quiz follow-up, #234 the rate-move recipe, #236 live tests, #235 ADRs and glossary, #237 Topic files and the lesson lint, #238 Tutor rules, #239 replies checked before they show, #240 no negative stems, #241 typed Check questions, #242 ready-made Widgets, #243 Concept cards and Quick tries, #244 the Learner's own rule, #245 the ladder, frustration and Park, #246 Percent, #247 Growth, compounding and logs, #248 go-live.

## Tutor replies (25)

- **reply-01** Reply text streams word by word, so nothing can be checked before it shows. → The turn holds the whole reply until it passes; only progress labels and the typing indicator stream (ADR 0008, #239).
- **reply-02** Stop keeps the partial reply, which would now be unchecked. → Stop drops the held reply and keeps the Learner's message, marked Stopped; the glossary changes to match (#239, #235).
- **reply-03** A resumed turn replays saved text, which could be an unchecked draft. → Drafts are stored with their check result and only a passing reply or the fallback is ever shown (#239).
- **reply-04** A rejected draft may already have run tools with lasting effects. → The retry rewrites the reply from the same turn, and failed attempts are recorded apart from what the Learner sees (#239).
- **reply-05** A rejected long draft and its correction would stay in every later request. → Failed drafts and correction messages are left out of later requests, the way refused turns are (#239).
- **reply-06** The fallback "card plus next Quick try" does not exist for unconverted Topics or other steps. → With a card: its write-down line and the next Quick try; without: the retry cut at its last full sentence within the cap, kept in history as a code note (#239).
- **reply-07** The open-quiz lines tell the Tutor not to teach, and the Check step has no concept to teach from. → Every open-quiz line becomes "teach, show Widgets and start again with other numbers; never give an open answer", and the Check context carries the card or concept text (#238).
- **reply-08** The blocked numbers during an open quiz are undefined. → They are every number in the open attempt's questions and choices, plus the next attempt's for a fixed pool; V5 enforces them (#230, #238).
- **reply-09** Small pools repeat questions whose answers are already in the history. → V5 checks against every open item's answer whatever the history holds, and templates give fresh numbers each attempt (#230, #241).
- **reply-10** Per-step caps and currency would break the frozen, shared instructions. → Code sends the cap, currency and blocked numbers per turn in the context; the merged rules have no placeholders (#238).
- **reply-11** One 120-word limit everywhere, "Want the next part?" and Accordion advice clash with the new caps. → A cap table by step and Reply kind (80 or 120) replaces the single limit, and Go deeper replaces "offer more" (#230, #233, #238).
- **reply-12** With the engine off, the instructions still teach free-form Widgets. → Ready-made Widgets only; the engine is on for new Sessions and a free-form Widget fails the reply check (ADR 0007, #242).
- **reply-13** open_widget cannot open a Widget at chosen numbers, and one-per-reply is not enforced across tools. → open_widget takes a preset, and one Widget per reply is enforced with a tool error (#242).
- **reply-14** The freeform lane adds compose_widget to the engine's tools. → compose_widget stays in code but is not bound for the Tutor; Sessions frozen with it still resume (ADR 0007, #242).
- **reply-15** The spec's examples type sums, which ADR 0002 forbids. → ADR 0002 stays: cards and replies say sums in words, and the rate Widget shows worked lines computed by code (#238, #234).
- **reply-16** The Learner Profile rule clashes with one Running example, and the currency source is undefined. → The Profile is used only when the Learner asks how an idea applies to them; the Topic's currency (₹ by default) rules examples, and Cases keep theirs (#238, #230).
- **reply-17** The instructions pitch the Tutor at MBA level. → Write for a beginner; analyst level is where the course ends up, and the comparison rubric changes to match (#238, #236).
- **reply-18** No list of banned app words exists. → Allowed: Topic, Check, Check tab, Widget, Next, Go deeper, Show me in a widget, Quick try, Concept card; banned: ids, tool names, "Course Navigator", "Session item", "Reply kind", "Skill state" and "Code" as a subject (#230).
- **reply-19** Asks sent through tools let the model write more after the ask, and question counting misses task verbs. → The ask is the reply's last line; tools carry only effects, and V2 counts task-verb lines too (#230).
- **reply-20** The spec has the Tutor ask and judge its own practice questions. → The Tutor never marks a question; Quick tries have their own input marked by code, and results reach the Tutor as a pending note (ADR 0006, #243).
- **reply-21** The quiz follow-up goes over every missed question. → It covers only the first missed Skill: the slip, its fix and one similar question with new numbers, in 60 words or fewer (#233).
- **reply-22** A new model or effort never reaches existing Sessions, and old long replies stay in view. → A refreeze folds earlier history into the compaction summary; the chosen model and effort are the default for new Sessions only (#239, #248).
- **reply-23** The Next and opener notes tell the Tutor to teach each step afresh. → In a converted Topic code shows the card and the note asks for one line of feedback and one question (#243).
- **reply-24** Notes cannot hold the Learner's own sentence. → An own-rule note kind and a Tutor tool save it, with the existing Undo (#244).
- **reply-25** The typing indicator and a word-limit grader already exist. → Reused: the indicator shows progress while the reply is checked, and the grader gains per-step caps and the spec's rubric (#239, #236).

## Learning flow and progress (26)

- **flow-concept-per-check** One concept text per Topic, but Percent needs two ideas before Check 1. → One Concept card per Check, and a Check teaches one idea, so Percent gets a new Check 2 (#237, #246).
- **flow-your-turn-finish** Nothing says who finishes Your turn once code marks the tries. → Code finishes it from Skill state, not the Tutor (ADR 0006, #232, #243).
- **flow-your-turn-gate** No exit rule for Your turn, and nothing for repeated misses. → Two right in a row on each Skill, or a park; there is no Skip (#232).
- **flow-typed-number-input** Typed answers have no rules for forms, sign or decimals. → Each typed item has a unit, the decimals its ask states and a sign rule; code compares as scaled integers (#231).
- **flow-quick-try-surface** A number typed in the message box starts a Tutor turn. → A Quick try is a Session item with its own input, locked while a Tutor turn runs (#243).
- **flow-unknown-wrong-and-new-numbers** An unrecognised wrong answer has no reply, and fixed tries run out. → Code shows "Not quite", a short Tutor turn names the slip, and a fresh code-made try follows (#231, #243).
- **flow-template-instances** Template numbers have nowhere to be stored. → Template questions are drawn with a seed and stored with the attempt, so a reload shows the same numbers (#231, #241).
- **flow-pool-too-small** 94 of 95 quiz pools repeat within three attempts. → L2 asks for three times the per-attempt count, templates count as unlimited, and converted Topics move to templates (#237, #241).
- **flow-quiz-followup-shape** The follow-up asks for every missed question again. → One Skill, one slip, one fix, one new try, and the miss counts on that Skill's state (#233).
- **flow-open-quiz-context** The refusal comes from the Course Navigator's context. → Every open-quiz line changes to "help freely, keep back only the open answers" (#238).
- **flow-blocked-numbers-scope** "Numbers not in the open questions" is unclear, and the Running example shares them. → The open attempt's numbers plus the next one's; a lint keeps Check numbers apart from the Running example and cards (#230, #237).
- **flow-skill-tags-and-bank** Skills do not exist and bank questions cannot be tagged. → Topic files declare Skills and tag every card, try and question; converted Topics replace bank items with tagged questions (#237).
- **flow-skill-state-store** No table holds per-Skill state. → A Skill-state table and a practice answers log, written only by code (#232).
- **flow-repair-ladder-rungs** The ladder's rungs do not map onto what exists. → One ladder in code for every Topic; fill-in boxes is a half-done Quick try, the Widget rung uses the Skill's card preset, and conversation Checks never climb it (#232, #245).
- **flow-park-vs-gate** Park fits none of today's pieces. → A Parked Skill stores a park-until time, leaves the Learner's place unchanged, is neither a Review nor a Due Check, and never passes a gate (#245).
- **flow-known-mistakes-vs-misconceptions** Storing every Known-mistake hit as a misconception would flood the summary. → Hits are stored with the practice answers; each distinct one is listed once on the Topic Note, with one line per Skill in the Learner summary (#232).
- **flow-r6-conversation-checks** A conversation Check's "why" can come before fluency. → Conversation Checks list their Skills and open only after their Your turn is done (#237, #243).
- **flow-d10-mechanics** No tool or item exists for saving the Learner's own rule. → A Tutor tool saves it once per turn with a "Saved to your notes" line and Undo, and saved wordings reach the Tutor (#244).
- **flow-d10-wrong-rule** A half-right rule could be saved. → In a converted Topic only right after a correct code-marked answer on the same Skill, at most once per Skill per Topic (#244).
- **flow-lesson-lane-overlap** The UX lesson lane is reshaping the per-step Topic schema. → Build constraint: tickets that touch those files start after the UX lanes merge, and extend their per-step shape (#237).
- **flow-pilot-not-converted** Percent types sums and the formula check misses new fields. → Percent is converted and taken off the not-yet-converted list, and the detector scans cards, tries and templates (#237, #246).
- **flow-rollout-without-cards** What an uncarded Topic does is undefined. → It keeps today's concept text, taught one idea per reply under the same caps, behind a list that can only shrink (ADR 0006, #237).
- **flow-card-shown-by-code** Where the card is shown, and how the Tutor sees it, is undefined. → The card is a Session item stored on entering the step, and its text goes into the Course Navigator context (#243).
- **flow-negative-stem-in-pool** The question read backwards twice is still in Check 1. → Negative stems are banned outright (L6) and reworded to "Which one is true?" (#240).
- **flow-pass-rule-exists** Code already picks, marks and applies the pass rule. → Reused: Skill tags and templates are added on top, with no second Check format (#241).
- **flow-id-format** The spec's ids use underscores and its authoring prompt asks for JSON. → Ids use hyphens, and Topic content is written as YAML that the course check accepts (#237).

## Widgets (25)

- **widgets-preset-mechanism** Nothing opens a Widget at chosen numbers. → open_widget and recipes take a preset checked against slider ranges, and the item records it (#242).
- **widgets-engine-gate-dependency** The engine's go rule measures free-form drawing. → Go-live owns the switch, judged on this spec's tests, where a correct "taught in words" reply counts as a pass (#248).
- **widgets-compose-in-engine** Turning the engine on would hand the Tutor compose_widget. → compose_widget is not bound for the Tutor; the code stays (ADR 0007, #242).
- **widgets-fences-not-blocked** A free-form fence is still drawn with the engine on. → V4 fails any free-form Widget in a reply, and old fences fold into the compaction summary at the refreeze (#230, #239).
- **widgets-one-per-reply** One Widget per reply is only partly enforced. → One shared check across both tools and the reply check, with a tool error (#242, #230).
- **widgets-guided-tasks-as-work** Tool results and the Widget block keep steering toward Guided Tasks. → Guided Tasks are optional play and the Tutor never sets one as work (ADR 0007, #242, #238).
- **widgets-tasks-gate-progress** Guided Tasks decide progress at explore and in the lesson lane's step ends. → Explore is the one place a task may decide progress (ADR 0001); elsewhere a tick may end a step early but never holds one back (#242).
- **widgets-d6-retry-side-effects** Widgets show before the reply is checked. → The reply check covers the Widgets shown with the reply, and the single retry is told what is already on screen (#239).
- **widgets-currency-rule** Dollar Cases clash with a rupee rule. → Case figures keep the Case's currency; examples and non-Case Widgets use the Topic's example currency, and V7 allows $ only in Topics whose Case is in dollars (#230, #237).
- **widgets-currency-hardcoded-usd** Formula Cards and the formula recipe know only dollars. → Non-Case Widgets use the Topic's example currency; the rate-move recipe shows no currency symbol (#234), and rupee Formula Cards are not yet in a ticket.
- **widgets-rate-move-from-parts** rate_move can be built from existing parts, but no rate_change calculator exists. → The rate-move recipe, with readouts from tested code (#234).
- **widgets-written-ahead-duplicate** A rate recipe would duplicate Percent's written-ahead Widget. → One rate Widget: Percent's file names the rate-move recipe instead of its own code (#234, #246).
- **widgets-practice-mode-vs-quick-try** No part gives practice mode. → Practice mode stays, built on the Predict part, comparing in whole basis points (#234).
- **widgets-quiz-open-presets** No preset is checked against the open quiz. → V5 refuses a Widget preset that uses blocked numbers (#230, #242).
- **widgets-quiz-open-widget-solves** The Learner can read an open answer off a Widget. → Allowed: a Widget may be used as a calculator during an open quiz, and V5 still stops the Tutor confirming an answer (#230).
- **widgets-no-recipe-chip** "Show me in a widget" has no answer when no recipe fits. → The chip stays; the Tutor says in one sentence that no picture fits and gives the shortest version in words (#242, #238).
- **widgets-preset-vs-learner-state** A preset would overwrite the Learner's own slider work. → A Tutor preset replaces the Learner's last settings, and the item records it so an earlier chip reopens its own numbers (#242).
- **widgets-worked-numbers** The rate Widget shows results, not worked numbers. → Worked lines in words made by code, such as "5.2% minus 5% is 0.2 points" (#234).
- **widgets-quick-check-recipe** quick_check lets the Tutor write unmarked practice. → quick_check leaves the Tutor's catalogue for Topic teaching; "quiz me" goes to the next Quick try (#242).
- **widgets-engine-instructions-conflicts** "Don't repeat the last archetype" fights one Running example, and the engine allows 120 words. → The archetype line is dropped and the cap comes from the step's cap (#238).
- **widgets-coverage-risk** Most Topics would get almost no Widgets. → Accepted: they teach in words, and Widgets and presets follow the Concept cards Topic by Topic (ADR 0007).
- **widgets-adr-docs** ADRs 0003 and 0005 still describe free-form drawing as the plan. → ADR 0007 amends both (#235).
- **widgets-illustration-facts** Whether Illustrations remain is undecided. → Allowed only where no input or Case Data path covers the same number (#242).
- **widgets-step-widget-in-topic-file** No Topic-file field names a recipe with a preset. → The per-step Widget names a written-ahead Widget or recipe with a preset, checked by L4 (#237).
- **widgets-settings-defaults** Settings defaults never reach production. → Go-live owns switching the engine and the chosen model and effort in production (#248).

## Content (18)

- **content-01** One concept text per Topic, but two or three Checks. → One Concept card per Check, under each Check in the schema (#237).
- **content-02** L1 cannot run without Skills and tags. → Skills are declared per Topic and every card, try and question carries its Skills (#237).
- **content-03** The typed-formula check skips not-yet-converted Topics. → The detector scans cards, Quick tries and templates, and Percent comes off the list (#237, #246).
- **content-04** The next Topic, num-compounding, has none of the new content. → Growth, compounding and logs is converted too, once compound growth and CAGR are Formula Cards (#247).
- **content-05** 93 uncarded Topics cannot follow "never write your own explanation". → They keep today's concept text, taught one idea per reply under the same caps, behind a list that can only shrink (ADR 0006).
- **content-06** Carding the whole course is a large job. → Only Percent and Growth, compounding and logs now, written by Claude Code lanes and gated by the lints and a beginner-reader review; the rest wait for a later spec.
- **content-07** Only 1 of 95 quiz Checks has enough questions for three fresh attempts. → L2 means three times the per-attempt count, with templates counting as unlimited (#237, #241).
- **content-08** Topic files have no currency, and most Cases are in dollars. → An example currency per Topic (₹ by default) for cards, tries and Widget labels; Case figures keep theirs (#237).
- **content-09** The Check tab cannot show bold, so "bold negative" cannot work. → Negative stems are banned outright and the 19 in 15 Topics are reworded (#240).
- **content-10** Bank questions cannot be tagged or linted. → Converted Topics replace them with Topic-written or template questions; unconverted Topics keep theirs (#237, #241).
- **content-11** Nothing stops a card or try from reusing an open Check's numbers. → A lint keeps Check questions' moves apart from the Running example and every card's worked example (#237).
- **content-12** A card shown before explore could state the Insight. → Not settled by the spec: the explore step is unchanged (ADR 0001), so a card for the explore Check must not state the Insight, which is left to authoring review (#246, #247).
- **content-13** Exact comparison works only for rates. → Every typed item has a unit, decimals and a sign rule, compared as scaled integers (#231).
- **content-14** Check wrong choices carry no Known mistakes. → Known mistakes can sit on fixed items and on wrong multiple-choice options, and each match gets its fix in the marking (#237, #241).
- **content-15** The UX lesson lane owns the per-step Topic schema. → Build constraint: the schema work starts after the UX lanes merge and extends their shape (#237).
- **content-16** Nothing says when Your turn is finished. → Two right in a row on each Skill, decided by code (#232).
- **content-17** Conversation Checks have no open-answer rule and no Skills. → While one is open the Tutor teaches with other numbers and never states the pass reasoning about the prompt's own move; each lists its Skills for L1 (#237, #238).
- **content-25** "Taught" terms depend on each Learner's path, and files list no terms. → Converted Topics list their terms; "taught" means earlier in the Topic or on the default path, and the Tutor is sent the Topic's terms (#237, #238).

## Checks and CI (7)

- **content-18** A paid job with an API key does not fit CI's required checks and auto-merge. → The live tests run as a separate job that is not a required check, capped at $5, and post a report (#236).
- **content-19** The Tutor's rules are spread across several files. → The live job runs on PRs that change the Tutor's instructions or context, the quiz follow-up, the chips or a Topic file (#236).
- **content-20** The behaviour runner cannot set up the spec's states. → Each live case is a state and a Learner message run through the real Tutor Turn on a throwaway database (#236).
- **content-21** The runner tests default settings, and its budget can be overrun. → The sweep tests the candidate models and efforts with a spend cap; the cheapest that passes becomes the default (#236, #248).
- **content-22** The grader, code-only rules and word counter already exist. → Reused, with T1 to T11 added and the single 120-word limit replaced by the cap table (#236, #230).
- **content-23** The simulated Learner cannot run a 50-turn replay. → Go-live runs a 50-turn replay with no reply over 120 words (#248).
- **content-24** The live widget probe rewards free-form drawing. → Probes and judges count a ready-made Widget or a correct "taught in words" reply as a pass (ADR 0007, #248).

## Questions the critic raised (14)

- **Story and Reveal length.** → They keep today's Tutor-told shape, capped at 120 words.
- **Go deeper against "never write your own".** → Go deeper at a Concept step is the one place the Tutor writes its own explanation: same Running example, no new analogy, at most 120 words; a typed "simpler" gets the card's rule in four lines or fewer (#233).
- **Reading Topics (Follow, Judge, Analyse).** → Not converted by this spec; they get the new reply rules and keep their concept text until a later spec.
- **Which style rules code enforces.** → Code strips emoji and arrows, flattens headings and keeps the first bold at no retry; sentence length and praise are graded in the live tests only (ADR 0008).
- **Wait time.** → The retry runs only if the turn has used under 30 seconds; otherwise the fallback shows (ADR 0008).
- **Frustration.** → Code counts "get it over with", "too complicated", "over complicated", "don't know any of this" and two misses in a row; the Tutor answers in eight words or fewer, then a smaller step (#245).
- **Reply kind policy.** → Code sends "Reply kind: X" whenever it knows the state and records the kind; free questions are recorded as answers to the Learner's own question (#232, #245).
- **The sweep's scope.** → T1 to T11 three times out of three, no new failures in the behaviour suite, and a few conversation-Check verdicts with known answers; one model and effort for every turn (#248).
- **Start again during an open Check.** → A Tutor tool re-posts the Topic's Concept cards and the first Quick try; the step and the open attempt stay (#245).
- **Learners mid-Topic at go-live.** → A Topic file can mark a restructure as content-only: passed Topics stay passed with no Due Check, and Learners keep their step (#237).
- **Authoring and review.** → Claude Code lanes write the content, gated by the lints and a beginner-reader review; no paid authoring script and no draft flag.
- **Build process.** → This page replaces Phase 0, and the phases became ticket dependencies gated by automated tests.
- **Measuring success.** → Each reply's word count, failed checks, retry and fallback, and each Check's attempts to pass, are recorded and shown in the usage report (#239).
- **ADRs and architecture notes.** → ADRs 0006 to 0008 (#235), and each ticket updates docs/architecture.md for its layers.
