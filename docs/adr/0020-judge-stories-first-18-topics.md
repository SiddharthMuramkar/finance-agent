# On the Spine a Learner judges other people's Stories, in 18 Topics; own valuations come after it

Status: accepted, 2026-11-16 (owner grilling session). Supersedes two parts of ADR 0004: the Spine's length (fifteen) and its last Topic as the place where the Learner values a company of their choice. The rest of ADR 0004 holds: the Spine is the default path, the other Topics are Electives met through Primers, and Skip ahead stays. It also narrows ADR 0002: a Learner types numbers only when copying them into an Own Case. Spine length superseded by ADR 0021 and the judge-only path by ADR 0023 (2026-11-19); the Own Case Assignment and "dated, never live" hold.

## Context

The goal is a beginner who can value a company on their own and make real decisions with it. Two things stood in the way.

- The course asked a beginner for their own story early. Topic 1 ends with "Tell Amazon's story … as you would set the four levers", and Home says "Now it's your story." The owner: a beginner who trusts their own story too early is how people lose their savings. Learn to judge stories first.
- Some Spine Topics are too heavy for a beginner. Topic 3 brings 14 new words and Topic 7 about 8 (first-hour walk-through, 2026-11-16).

## Decision

- **Judge first.** On the Spine, the Learner judges Stories: what a founder, an analyst, a headline or the Price claims about a company's future, set against what happened. Moving a Lever tests a Story. It does not tell the Learner's own.
- **Eighteen Spine Topics.** The cash Topic and the three financial statements become two Topics. The risk Topic becomes two: the cost of equity, and the cost of capital (named WACC once). A new last Topic teaches how to find a valuation's numbers in an annual report.
- **Own valuations come after the Spine, as Assignments.** The Learner picks a listed company, finds about eight numbers in its annual report with a guide, and values it as an Own Case. The valuation engine does all the maths (ADR 0010). The Tutor flags an input far outside the usual range for the industry. Value It buys no company data.
- **Typing only in Own Cases.** A Learner types numbers only when copying them from an annual report into an Own Case. Copying a reported number is a real-world skill, not an answer or a sum. Every question stays a tap (ADR 0002).
- **Dated, never live.** An Own Case, like every Case, stands at a past As-of date: the date of its annual report. A Market reading, such as the premium investors ask over safe bonds, shows the date it was measured. Nothing shows today's price (ADR 0013).

## Consequences

- Three new Spine Topics to write and pass through the course check and the critics. `SPINE_LENGTH` changes, and the site says 18 Topics.
- Renumbering must keep every pass, Session, Topic Note and Review, as ADR 0004 requires.
- Topic 1's own-story Check and Home's "your story" step become judging steps.
- A Spine Topic's Insight may be settled by a tap: choices written in the Topic file (`insight.pick`), marked by code like a Quick try, a wrong tap releasing the next hint. This narrows ADR 0001, where the Insight is found only in the Learner's typed words; a Topic without choices keeps that. A closing Check may be a second, judging quiz Check by tap instead of a conversation Check (ticket #88, Topic 1).
- A Learner who wants to value their own company early waits until the Spine ends. Electives and Examples stay open.
- The Learner types an Own Case's numbers, so they can be wrong. The Tutor's range check names the input; it never says the value is right or wrong.

## Alternatives considered

- **Own company from Topic 1, built along the path:** each idea is used at once, but it asks a beginner for their own story first.
- **Keep fifteen Topics and move the extra words to Go deeper or Electives:** a shorter path, but less depth, and the owner wants Learners able to work alone.
- **Buy company data for Own Cases:** faster, but it costs money and licences, and the Learner never learns to find the numbers.
- **The Tutor reads the report and the Learner confirms each number by tap:** no typing, but the model picks the numbers and the Learner learns less.
- **Pick ranges by tap:** no typing, but the values are rough.
