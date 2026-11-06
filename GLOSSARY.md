# Finance Agent

An AI tutor that teaches an adult learner finance and economics seriously, from first principles through to real-world analysis.

## Language

**Learner**:
A person the Tutor teaches, signed in with Google (or, for the test tools, a passcode). Each Learner's Learner Profile, progress, Notebook (Topic Notes and Sessions) are theirs alone. Starting over archives a Learner and gives the same sign-in a fresh one; nothing is deleted. The owner's test tools play their own Learner, the tools Learner, started over before each run.
_Avoid_: User, student, account

**Invite list**:
The emails allowed to sign in with Google while the Sign-up switch is off. An invite may name an existing Learner (the owner's email names `owner`, so the owner keeps their progress); otherwise signing in makes a new Learner. Taking an email off the list stops new sign-ups only: a Learner already in keeps access until archived (remove the invite first, then archive; archiving alone lets them back in while the invite is listed or sign-up is open).
_Avoid_: Whitelist, allowlist, waitlist

**Sign-up switch**:
The setting `signup_open`: "off" (the default) lets only invited emails become Learners through Google; "on" lets anyone with a Google account in. Turned with `npm run invites -- open` and `close`.
_Avoid_: Registration flag, open beta

**Learner Profile**:
What the Learner chooses to share about their own life (work, where they live, any loan, what they are saving for), used only when the Learner asks how an idea applies to them, never to give advice.
_Avoid_: Account, user profile, persona

**Tutor**:
The agent that teaches, explains and works through finance and economics with the Learner.
_Avoid_: Assistant, bot

**Reply kind**:
What one Tutor reply sets out to do, such as feedback on an answer, a rule, a worked example, a hint, a drill, or an answer to the Learner's own question. Code chooses it when it knows the state, sends it to the Tutor, and records it with the turn's reply checks.
_Avoid_: Move, teaching move, action

**Course Map**:
The Topics across finance and economics, what each one requires first, and a default path the Tutor leads the Learner along, and shows the Learner's progress on it. The Learner can ask anything along the way, or choose another Topic, and come back to where they were.
_Avoid_: Syllabus, curriculum

**Topic**:
A lesson-sized stop on the Course Map, with an ordered list of Checks along the way.
_Avoid_: Lesson, module, unit

**Skill**:
One small thing a Topic teaches that can be tested on its own, such as turning percentage points into basis points. Each Quick try, Check question and Known mistake belongs to one Skill.
_Avoid_: Objective, competency, sub-skill

**Teaching Step**:
One of the seven parts every Topic follows: story, concept, explore, your turn, Check, reveal and principle. Concept, your turn and Check repeat for each of the Topic's Checks; explore comes once, after the concept of the Check that tests the Topic's Insight.
_Avoid_: Phase, stage

**Choice**:
One of the two or three tap-to-answer buttons code puts under every Tutor reply, each with an emoji before its words, such as "What happened next?", "What does that word mean?" or "Quiz me". Code picks them for the Teaching Step and may put one the Tutor suggested first. Pressing one sends its words as the Learner's message, which never counts as an Insight attempt. Typing stays open.
_Avoid_: Help chip, suggestion, quick reply, menu

**Concept card**:
A short explanation of one idea, written ahead in the Topic's file and shown by code at the concept step: at most five plain lines with one worked example. The Tutor adds feedback and one question around it, and never writes its own version.
_Avoid_: Lesson card, explainer, card (on its own)

**Quick try**:
One short practice question at the your-turn step, set easiest first: the Learner taps one of two to four choices, or True or False, and code marks the tap at once. The Learner never types a number. It counts toward no Check.
_Avoid_: Exercise, drill question, practice item

**Quick-try follow-up**:
The short Tutor turn code starts by itself after a Quick try marked wrong with no Known mistake to match: the Tutor names the slip in one sentence and gives the fix, then code shows a fresh Quick try. Code also starts one when Your turn finishes, to point the Learner to the Check.
_Avoid_: Retry turn, feedback turn

**Known mistake**:
A wrong choice the Topic's file expects for a question, such as "6 bp" for 60 bp (multiplied by 10, not 100), with a one-line mix-up fix that code shows the moment the Learner taps it.
_Avoid_: Slip, error tag, misconception

**Blocked numbers**:
Every number in the open quiz questions and the next attempt's, which the Tutor keeps out of its examples and Widgets while a quiz Check is open, so it can teach freely without giving an answer away.
_Avoid_: Forbidden numbers, quiz numbers

**Parked Skill**:
A Skill the Learner set aside by pressing "Park it, review tomorrow" after three misses in a row on it, on Quick tries or quiz questions. The Topic waits at its step while the Learner studies any other Topic: no Quick try, no Next, and Your turn cannot finish, though an open quiz can still be passed. Once 20 hours have passed, opening the Topic starts a drill of five on that Skill, and five answered tries end the park. A Parked Skill is neither a Review nor a Due Check, and it never lets the Learner past a Check.
_Avoid_: Skipped Skill, deferred Skill, review queue

**Converted Topic**:
A Topic whose file lists Skills, and with them a Concept card for each Check, Quick tries and Known mistakes. Its Concept steps show cards, and the lesson lint covers it. A Topic not yet converted keeps its concept text, taught by the Tutor.
_Avoid_: New-style Topic, carded Topic

**Lesson lint**:
The course check's rules for a Converted Topic's teaching: a Check tests only Skills a card at or before it teaches (L1), enough Quick tries and questions (L2), short cards (L3), valid Widget presets (L4), the Topic's currency (L5), no negative stems (L6), Check questions whose numbers differ from the worked examples (L7), every Quick try on a Skill its own Check tests (L8), template draws that never repeat a fixed question or Quick try of the same Check (L9), and, for every Topic, no Quick try that asks for a typed number, no stem that asks for a sum and a choice set of at least two on every template draw (L10, with a list of Topics not yet rewritten that can only shrink), and emoji names that all exist in the emoji registry (L11).
_Avoid_: Content lint, card check

**Widget preset**:
The numbers a ready-made Widget opens with: the slider values, by `$variable`. A Concept card writes one ahead (a Widget recipe and its inputs, or a Written-ahead Widget and its sliders' values), and the Tutor gives one to open_widget (or the recipe's inputs to show_widget) for the numbers under discussion. It replaces the Learner's last settings, the Widget item records it, and the Widget's earlier chip reopens those numbers.
_Avoid_: Widget settings, default values, starting state

**Running example**:
The one everyday example a Topic keeps using, such as Percent's savings rate going from 4% to 5%, shown in its Concept cards, its Widget and the Tutor's replies, so the Learner carries one picture instead of many.
_Avoid_: Anchor example, recurring scenario

**Topic goal**:
One line in the Topic bar saying what the Learner will be able to do by the end of the Topic. Words only: it never gives the Insight away.
_Avoid_: Objective, learning outcome

**Off-Topic answer**:
The Tutor's answer to a question that leaves the current Topic. It is marked by a quiet block in the conversation with "↩ Back to <Topic>", so the Topic stays in view. It never moves the Learner to another Topic: the Session stays that Topic's.
_Avoid_: Detour, tangent, side quest

**What the Learner found**:
One line, worked out by code from the Learner's saved Widget state, saying what they found or guessed in a Topic ("You guessed 12%", "You found where the annuity is worth the same as the cash"). It is shown in the Notebook and on the Topic complete card.
_Avoid_: Score, result

**Insight**:
The surprising consequence of a Topic's idea, which the Learner finds by playing with a Widget at the explore step before the Tutor confirms it. Once the Learner has found it, or been told it, the Insight is settled; until then a Widget holds back anything that would give it away.
_Avoid_: Aha, takeaway, novelty, X factor

**Connection**:
A written link from a Topic's idea to another idea or Topic, given when the Topic ends.
_Avoid_: Related topic, see also

**Notebook**:
The page where a Learner finds, for each Topic, its Session, what they found and their Topic Note.
_Avoid_: Notes page, Past Sessions

**Topic Note**:
The page kept for one Topic, in the Notebook: what code fills in once it is passed (its Formula Cards, the Insight in the Learner's words, the principle, the Connections, the mistakes noticed) plus anything the Learner saved or wrote, and any rule the Learner put more simply in their own words, which the Tutor saves for them.
_Avoid_: Summary, recap, cheat sheet

**Own rule**:
A rule the Learner says in their own words, correctly and more simply than the Tutor did, which code saves word for word to that Topic's Note. The Learner sees "Saved to your notes" with Undo, and the Tutor uses their words from then on. At most one per turn, and one per Skill in a Topic with Skills.
_Avoid_: Custom rule, user note

**Case**:
A real past episode that a Topic is taught through, with an outcome that is already known.
_Avoid_: Example, scenario

**Case Data**:
Checked historical datasets a Case is taught with, each with its source, kept in the private database. Until the reveal, nothing dated after the Case's as-of date is shown.
_Avoid_: Market data, figures

**Reference data**:
Real, sourced series that belong to no one Case (gold, the rupee-dollar rate, inflation, the repo rate, index closes, typical deposit rates, US yields), stored as Case Data under the reserved Case `reference` and readable in any Topic. While the current Topic has an unrevealed Case, nothing dated after that Case's as-of date is shown.
_Avoid_: Market data, background data

**Session**:
The whole conversation between one Learner and the Tutor about one Topic. Leaving and coming back, even days later, continues the same Session; every other Topic has its own. The one exception: a Learner who has passed every Topic talks to the Tutor in one Session with no Topic.
_Avoid_: Login, thread, chat

**Older session**:
A Session from before each Topic had one Session of its own. Older sessions are kept and can be read, listed apart from the Topic Sessions, but are never continued.
_Avoid_: Legacy session, archived session

**Start a Topic over**:
The Learner clears one Topic's progress and begins it again from its Story step. The Topic's progress is saved as an Earlier attempt first, and the notes, review cards and the old conversation stay.
_Avoid_: Reset a Topic, delete progress

**Earlier attempt**:
A Session the Learner restarted, with the Topic's progress as it stood then. It is read-only, and a Topic can have several.
_Avoid_: Old attempt, backup

**Opener**:
The Tutor's first reply in a Topic's Session, which starts by itself when the Learner opens a Topic they have not begun, before they write anything.
_Avoid_: Greeting, intro message

**Stop**:
What the Learner presses while waiting for the Tutor's reply: the reply in progress is dropped and none of it is shown, and the Learner's message stays, marked "Stopped".
_Avoid_: Cancel, abort

**Step divider**:
The line in a Session's conversation that marks where a Teaching Step began, such as "Step 5 of 10 · Concept".
_Avoid_: Separator, section header

**Stage**:
One of the four levels the course takes the Learner through: Foundation (groundwork), then Follow (understand what a writer argues), Judge (spot where an argument is weak) and Analyse (reach an own view from the numbers).
_Avoid_: Level, tier

**Subject**:
The field of finance or economics a Foundation Topic belongs to. _Avoid_: area, module, unit, track.

**Library**:
The private collection of source material the Tutor searches for quotes and context.
_Avoid_: Knowledge base, corpus

**Citation**:
A link from a claim in a Tutor reply to the exact sentences of the Library passage it rests on, made by Claude's built-in citations. Shown as a small number after the claim, with the reply's sources folded into one line at its end.
_Avoid_: Footnote, reference

**Passage view**:
The page a Citation opens: the stored Library passage with the cited sentences marked, its credit line, licence and a link to the original, under the as-of rule and the source's quote limit.
_Avoid_: Source page, document viewer

**Check**:
A marked point in a Topic where the Tutor tests the Learner's understanding, through conversation or a quiz. The last Check passed is the Learner's place on the Course Map.
_Avoid_: Checkpoint, test, exam

**Due Check**:
A Check, or the explore step, that a passed Topic still owes because it was added after the Topic was passed. The Learner takes it in that Topic's own Session before anything new.
_Avoid_: Review, retest

**Review**:
An old quiz question that code brings back just as the Learner is likely to forget it. Practice only: it never changes a Topic's progress.
_Avoid_: Revision, refresher, flashcard

**Study Workspace**:
The main product: a conversation with the Tutor beside charts and calculators the Learner can play with, the sources behind each answer, and what has been learned so far.
_Avoid_: Dashboard

**Home**:
The page at the site's main address, where every visit starts. Signed out, it introduces the Tutor, lets anyone try a live Widget and offers Start learning; signed in, it offers to Resume the Learner's current Topic.
_Avoid_: Landing page, dashboard, start page

**Welcome**:
A new Learner's first page, before they have any Session or chosen Topic: how a Topic works, an optional About you, and a first Topic to start.
_Avoid_: Onboarding, tour, first-visit card

**Topic bar**:
The slim bar above the conversation that stays for the whole Topic: its title and the Teaching Steps so far, the current one highlighted. A finished step takes the Learner back to where it began.
_Avoid_: Status card, progress bar, breadcrumb

**Topic Start card**:
The first item of a Topic's conversation: what the Learner will learn, what to study first and whether it is passed, the written-ahead Widgets they will use (You'll use) and how many Checks there are.
_Avoid_: Intro card, syllabus, overview

**Topic complete card**:
The card at the end of a passed Topic's Session: the Topic's principle in a line or two, a note that it is saved to the Learner's Notes, and What comes next.
_Avoid_: Certificate, completion screen

**Widget**:
An interactive picture beside the conversation, either written ahead for a Topic or drawn by code from a Widget recipe the Tutor chooses, and opened already set to the numbers being discussed: charts, tables, sliders and calculators whose numbers come from code, or a labelled Illustration. The Tutor never draws one of its own during the chat. A Widget in the Study Workspace belongs to one Topic's Session. With each message, chip and Next the Tutor is told what the open Widgets show (their slider values, ticked Guided Tasks and readouts worked out by code), and once all of a Widget's Guided Tasks are ticked the Learner can press Tell the Tutor what I found, which posts a message code writes (a widget report).
_Avoid_: artifact, card (on its own)

**Written-ahead Widget**:
A Widget written in a Topic's file, such as present value's "What the annuity is worth today" (`annuity-worth-today`). The Tutor opens it by its id and never draws its own version; it is listed under You'll use on the Topic Start card.
_Avoid_: template, preset Widget

**Widget recipe**:
A Widget design written in code, such as grow_money or history_case. The Tutor names a recipe and its params with show_widget, and code draws the Widget, checks it and keeps it in the Session (ADR 0005). Its params are inputs (sliders and calculator inputs), refs (Case Data) and facts (typed numbers, which make it an Illustration). The story set (story_scene, lingo_card, timeline and six more) opens the story Widgets, its text in inputs and checked before it shows; the headline recipe opens only a scene written ahead in the Topic's file, never text the Tutor writes.
_Avoid_: template, preset Widget

**Story scene**:
A Widget that tells a small story one beat at a time, with a cast of a few 3D emoji characters and the story's date stamped on it. A Topic file may also write one ahead for a Teaching Step (a Scene), and a Topic's Running example may carry one.
_Avoid_: Story card, comic, slideshow

**Lingo card**:
A Widget that shows one finance word, its plain meaning, how pros say it and an everyday example, in violet; turning it over shows the word in the Topic's story. A Topic's terms carry the making of one each.
_Avoid_: Vocabulary card, flashcard, glossary card

**Rate-move Widget**:
The one Widget for a rate change, drawn from the rate_move recipe with its own part, RateMove: an arrow on a number line from an old rate to a new one, with three worked lines code writes in words (points, basis points, percent of the old rate). In show mode the lines are on screen and sliders stay for play; in practice mode the lines stay hidden until the Learner picks the right reading of the move (three buttons: the right reading, the times-10 slip and the percent mix-up) and code marks the tap, then the lines follow, with sliders for play. Nothing is typed.
_Avoid_: rate calculator, Illustration

**Free-form Widget**:
A Widget no recipe covers, written by a second, faster model from the Tutor's brief with compose_widget, checked like any Widget. It is not offered to the Tutor any more (ADR 0007): only Sessions frozen while it was offered still have the tool. If it takes longer than 12 seconds or fails, code shows the closest Widget recipe instead (a fallback) and the Tutor says so.
_Avoid_: custom Widget, freeform lane (in Learner-facing text)

**Widget state**:
A Learner's work on a Widget in a Session: the numbers on its sliders and the Guided Tasks it has ticked, kept so the Widget draws as they left it. It is kept under the Widget's key: a written-ahead Widget's id, or the title of a Widget the Tutor drew.
_Avoid_: Widget data, saved Widget

**Archetype**:
The kind of idea a Widget teaches, named from the parts it uses: Grow, Compare, Convert, Chain, Predict, History, Rank, Check, Formula, Story or Lingo. Recipes carry one, and code works out a written Widget's with archetypeOf. The same kind may repeat: a Topic's running example keeps its one Widget.
_Avoid_: Widget type, layout

**Widget notes**:
A short line code adds to the Learner's next message: warnings about the Widgets of the Tutor's last reply (more than one control or visual, over 25 words, a number joined into text), and the recent archetypes, which no rule asks the Tutor to avoid repeating. Warnings never start a correction round; only errors that stop a Widget being right do.
_Avoid_: lint, Widget feedback

**Widget tool**:
A small piece of our code a Widget calls in the browser to get real numbers (Case Data, a calculator, a range of answers, an annuity schedule), so moving a slider redraws without asking the Tutor.
_Avoid_: API, query

**Illustration**:
A Widget built from clearly made-up numbers to picture an idea; its card says Illustration.
_Avoid_: example chart, mock data

**Formula Card**:
A Widget that shows a named formula with each symbol in plain words, the Learner's numbers filled in live and the result worked out by tested code.
_Avoid_: Equation, formula block

**Guided Task**:
A small instruction under a Widget, such as "set the rate to 0%", that ticks itself when the Widget reaches that state. Optional play: nothing is marked and the Tutor never sets one as work, but the ticks are kept with the Session.
_Avoid_: Exercise, challenge, step

**Question template**:
A Quick try or Check question written once in the Topic's file with ranges in place of numbers ("A rate moves from {a}% to {b}%. How many basis points?"). Code draws the numbers, works out the answer and each Known mistake, and builds the choices from them (the right answer plus each Known mistake's value, in the question's unit), so every try or attempt gets fresh numbers that code can mark.
_Avoid_: Question generator, item model

**Theme**:
One of two colour sets, Light and Dark, in one royal blue with four Accents. The Learner pins one, or follows the computer ("Match my Mac"). Saved per browser, not per Learner.
_Avoid_: Skin, dark mode (as the name of a setting), Day theme, Night theme

**Accent**:
One of four colours that carry a meaning: mint for the Learner and gains, coral for losses and warnings, sunflower for history and stories, violet for lingo. An accent is never used for decoration, and its fill never carries text (its "ink" variant does).
_Avoid_: Highlight colour

**Market Workbench**:
A possible later section for analysing real companies with real data alongside the Tutor.
_Avoid_: Dashboard, terminal

**Test bed**:
The whole app run in a browser on a throw-away database with a scripted Tutor, so a test can measure what a Learner would see without touching real data or calling a model. Never runs in production.
_Avoid_: Staging, sandbox, test server
