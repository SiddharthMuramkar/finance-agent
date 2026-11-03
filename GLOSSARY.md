# Finance Agent

An AI tutor that teaches an adult learner finance and economics seriously, from first principles through to real-world analysis.

## Language

**Learner**:
The one person the Tutor teaches.
_Avoid_: User, student

**Tutor**:
The agent that teaches, explains and works through finance and economics with the Learner.
_Avoid_: Assistant, bot

**Course Map**:
The Topics across finance and economics, what each one requires first, and a default path the Tutor leads the Learner along. The Learner can leave it to ask anything and return to where they were.
_Avoid_: Syllabus, curriculum

**Topic**:
A lesson-sized stop on the Course Map, with an ordered list of Checks along the way.
_Avoid_: Lesson, module, unit

**Teaching Step**:
One of the six parts every Topic follows: story, concept, your turn, Check, reveal and principle.
_Avoid_: Phase, stage

**Case**:
A real past episode that a Topic is taught through, with an outcome that is already known.
_Avoid_: Example, scenario

**Case Data**:
Checked historical datasets a Case is taught with, each with its source, kept in the private database. Until the reveal, nothing dated after the Case's as-of date is shown.
_Avoid_: Market data, figures

**Session**:
One continuous conversation between the Learner and the Tutor. Returning after a long break starts a new one.
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
A link from a claim in a Tutor reply to the exact sentences of the Library passage it rests on, made by Claude's built-in citations. Shown as a small number after the claim, with the reply's sources listed at its end.
_Avoid_: Footnote, reference

**Passage view**:
The page a Citation opens: the stored Library passage with the cited sentences marked, its credit line, licence and a link to the original, under the as-of rule and the source's quote limit.
_Avoid_: Source page, document viewer

**Check**:
A marked point in a Topic where the Tutor tests the Learner's understanding, through conversation or a quiz. The last Check passed is the Learner's place on the Course Map.
_Avoid_: Checkpoint, test, exam

**Study Workspace**:
The main product: a conversation with the Tutor beside charts and calculators the Learner can play with, the sources behind each answer, and what has been learned so far.
_Avoid_: Dashboard

**Market Workbench**:
A possible later section for analysing real companies with real data alongside the Tutor.
_Avoid_: Dashboard, terminal
