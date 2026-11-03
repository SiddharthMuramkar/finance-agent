# Finance Agent

An AI tutor that teaches an adult learner finance and economics seriously, from first principles through to real-world analysis.

## Language

**Learner**:
A person the Tutor teaches, signed in with their own passcode. Each Learner's Learner Profile, progress, Topic Notes and Sessions are theirs alone. Starting over archives a Learner and gives their passcode a fresh one; nothing is deleted.
_Avoid_: User, student, account

**Learner Profile**:
What the Learner chooses to share about their own life (work, where they live, any loan, what they are saving for), used only to pick everyday examples, never to give advice.
_Avoid_: Account, user profile, persona

**Tutor**:
The agent that teaches, explains and works through finance and economics with the Learner.
_Avoid_: Assistant, bot

**Course Map**:
The Topics across finance and economics, what each one requires first, and a default path the Tutor leads the Learner along. The Learner can ask anything along the way, or choose another Topic, and come back to where they were.
_Avoid_: Syllabus, curriculum

**Topic**:
A lesson-sized stop on the Course Map, with an ordered list of Checks along the way.
_Avoid_: Lesson, module, unit

**Teaching Step**:
One of the seven parts every Topic follows: story, concept, explore, your turn, Check, reveal and principle. Concept, your turn and Check repeat for each of the Topic's Checks; explore comes once, after the concept of the Check that tests the Topic's Insight.
_Avoid_: Phase, stage

**Insight**:
The surprising consequence of a Topic's idea, which the Learner finds by playing with a Widget at the explore step before the Tutor confirms it.
_Avoid_: Aha, takeaway, novelty, X factor

**Connection**:
A written link from a Topic's idea to another idea or Topic, given when the Topic ends.
_Avoid_: Related topic, see also

**Topic Note**:
The page kept for one Topic: what code fills in once it is passed (its Formula Cards, the Insight in the Learner's words, the principle, the Connections, the mistakes noticed) plus anything the Learner saved or wrote.
_Avoid_: Summary, recap, cheat sheet

**Case**:
A real past episode that a Topic is taught through, with an outcome that is already known.
_Avoid_: Example, scenario

**Case Data**:
Checked historical datasets a Case is taught with, each with its source, kept in the private database. Until the reveal, nothing dated after the Case's as-of date is shown.
_Avoid_: Market data, figures

**Session**:
The whole conversation between one Learner and the Tutor about one Topic. Leaving and coming back, even days later, continues the same Session; every other Topic has its own.
_Avoid_: Login, thread, chat

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

**Widget**:
An interactive picture beside the conversation, either written ahead for a Topic or built by the Tutor: charts, tables, sliders and calculators whose numbers come from code, or a labelled Illustration. A Widget in the Study Workspace belongs to one Topic's Session. With each message, chip and Next the Tutor is told what the open Widgets show (their slider values, ticked Guided Tasks and readouts worked out by code), and once all of a Widget's Guided Tasks are ticked the Learner can press Tell the Tutor what I found, which posts a message code writes (a widget report).
_Avoid_: artifact, card (on its own)

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
A small instruction under a Widget, such as "set the rate to 0%", that ticks itself when the Widget reaches that state. Practice only: nothing is marked, but the ticks are kept with the Session.
_Avoid_: Exercise, challenge, step

**Market Workbench**:
A possible later section for analysing real companies with real data alongside the Tutor.
_Avoid_: Dashboard, terminal
