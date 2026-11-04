# Finance Agent

An AI tutor that teaches an adult learner finance and economics seriously, from first principles through to real-world analysis.

## Language

**Learner**:
A person the Tutor teaches, signed in with their own passcode. Each Learner's Learner Profile, progress, Topic Notes and Sessions are theirs alone. Starting over archives a Learner and gives their passcode a fresh one; nothing is deleted. The owner's test tools play their own Learner, the tools Learner, started over before each run.
_Avoid_: User, student, account

**Learner Profile**:
What the Learner chooses to share about their own life (work, where they live, any loan, what they are saving for), used only when the Learner asks how an idea applies to them, never to give advice.
_Avoid_: Account, user profile, persona

**Tutor**:
The agent that teaches, explains and works through finance and economics with the Learner.
_Avoid_: Assistant, bot

**Reply kind**:
What one Tutor reply sets out to do, such as feedback on an answer, a rule, a worked example, a hint, or an answer to the Learner's own question.
_Avoid_: Move, teaching move, action

**Course Map**:
The Topics across finance and economics, what each one requires first, and a default path the Tutor leads the Learner along. The Learner can ask anything along the way, or choose another Topic, and come back to where they were.
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

**Concept card**:
A short explanation of one idea, written ahead in the Topic's file and shown by code at the concept step: at most five plain lines with one worked example. The Tutor adds feedback and one question around it, and never writes its own version.
_Avoid_: Lesson card, explainer, card (on its own)

**Quick try**:
One short practice question at the your-turn step, set easiest first: the Learner types a number or picks True or False, and code marks it at once. It counts toward no Check.
_Avoid_: Exercise, drill question, practice item

**Known mistake**:
A wrong answer the Topic's file expects for a question, such as 6 for 60 (multiplied by 10, not 100), with a one-line fix that code shows the moment the Learner gives it.
_Avoid_: Slip, error tag, misconception

**Parked Skill**:
A Skill the Learner set aside by pressing "Park it, review tomorrow" after three misses in a row on it. The Topic waits at its step while the Learner studies any other Topic, and the next day it starts with a drill of five on that Skill. A Parked Skill is neither a Review nor a Due Check, and it never lets the Learner past a Check.
_Avoid_: Skipped Skill, deferred Skill, review queue

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
One line, worked out by code from the Learner's saved Widget state, saying what they found or guessed in a Topic ("You guessed 12%", "You found where the annuity is worth the same as the cash"). It is shown on Past Sessions and on the Topic complete card.
_Avoid_: Score, result

**Insight**:
The surprising consequence of a Topic's idea, which the Learner finds by playing with a Widget at the explore step before the Tutor confirms it. Once the Learner has found it, or been told it, the Insight is settled; until then a Widget holds back anything that would give it away.
_Avoid_: Aha, takeaway, novelty, X factor

**Connection**:
A written link from a Topic's idea to another idea or Topic, given when the Topic ends.
_Avoid_: Related topic, see also

**Topic Note**:
The page kept for one Topic: what code fills in once it is passed (its Formula Cards, the Insight in the Learner's words, the principle, the Connections, the mistakes noticed) plus anything the Learner saved or wrote, and any rule the Learner put more simply in their own words, which the Tutor saves for them.
_Avoid_: Summary, recap, cheat sheet

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
A Widget written in a Topic's file, such as Percent's "One rate change, said three ways". The Tutor opens it by its id and never draws its own version; it is listed under You'll use on the Topic Start card.
_Avoid_: template, preset Widget

**Widget recipe**:
A Widget design written in code, such as grow_money or history_case. The Tutor names a recipe and its params with show_widget, and code draws the Widget, checks it and keeps it in the Session (ADR 0005). Its params are inputs (sliders and calculator inputs), refs (Case Data) and facts (typed numbers, which make it an Illustration).
_Avoid_: template, preset Widget

**Free-form Widget**:
A Widget no recipe covers, written by a second, faster model from the Tutor's brief with compose_widget, checked like any Widget. If it takes longer than 12 seconds or fails, code shows the closest Widget recipe instead (a fallback) and the Tutor says so.
_Avoid_: custom Widget, freeform lane (in Learner-facing text)

**Widget state**:
A Learner's work on a Widget in a Session: the numbers on its sliders and the Guided Tasks it has ticked, kept so the Widget draws as they left it. It is kept under the Widget's key: a written-ahead Widget's id, or the title of a Widget the Tutor drew.
_Avoid_: Widget data, saved Widget

**Archetype**:
The kind of idea a Widget teaches, named from the parts it uses: Grow, Compare, Convert, Chain, Predict, History, Rank, Check or Formula. Recipes carry one; code works out a written Widget's with archetypeOf and tells the Tutor the last two, so it does not draw the same kind back to back.
_Avoid_: Widget type, layout

**Widget notes**:
A short line code adds to the Learner's next message: the recent archetypes, and warnings about the Widgets of the Tutor's last reply (more than one control or visual, over 25 words, a number joined into text). Warnings never start a correction round; only errors that stop a Widget being right do.
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

**Market Workbench**:
A possible later section for analysing real companies with real data alongside the Tutor.
_Avoid_: Dashboard, terminal
