# Step-led replies are checked before they show; own-question replies stream behind a stream guard

Status: accepted, 2026-11-14. Ticket: [#4](https://github.com/SiddharthMuramkar/finance-agent/issues/4) (Restore design docs from the archive?, start fresh: one new ADR for each decision the code still follows). Rewritten from archived ADRs 0008 and 0017, and the fallback rule of archived ADR 0016.

## Context

In the Percent Session of 4 November 2026 replies broke rules the instructions already held: 200 to 300 words where the cap was 120, many asks in one reply, headings, bold everywhere, app words such as "Code recorded a pass on Check 1", and a dollar sign in a rupee Topic. Prompt rules alone did not hold, and a streamed reply cannot be taken back once read. But holding every reply meant waits of 8.6 to 31.4 seconds with nothing on screen when the Learner asked their own question (audit of 11 November 2026).

## Decision

- **Step-led turns** (the Learner pressed Next, a Choice or a Quick try) are held until code checks the whole reply (`src/tutor/reply-checks.ts`):
  - V1 word cap for the step and Reply kind; V2 one question and one short ask as the last line; V3 no banned phrases, emoji or decorative arrows; V4 Widget rules (a valid Widget, at most one per reply); V5 no open quiz answer leaked; V6 no app words; V7 the right currency; V8 no sums asked (ADR 0002).
  - Code fixes small breaks for free (strips emoji and arrows, flattens headings, keeps the first bold span).
  - Any other break costs one retry, told exactly what failed, and only if the turn has used under 30 seconds (`RETRY_WITHIN_MS`). If that fails too, code shows a fallback.
- **Own-question turns** (the Learner typed, and no Check is waiting for an answer) stream at once, one sentence at a time, behind a stream guard (`src/tutor/stream-guard.ts`). Before each sentence shows, the guard blocks three things: a Blocked number, a line that tells the Learner to buy, sell or hold, and an internal word or id. On a hit the stream stops and one fixed line shows.
- In own-question turns, word count, a second question and the currency are soft checks: measured and recorded after the reply, never a retry.
- **The fallback tells the truth.** A step-led turn's fallback is the step's own words: at a Concept card, the card's write-down line and the next Quick try. An own-question turn that cannot get a checked answer shows one fixed line that says so, then the open step item. A write-down line is never offered as the answer to a question.
- **The open item is shown, not described.** Under an own-question reply, code shows the open item again: the Quick try card or the Next button. At Your turn the open Quick try is the ask, so V2 asks for no other there.

## Consequences

- Step-led replies show later than a stream would; the typing indicator and progress labels still stream.
- Some turns cost a second model request. Every reply's word count, failed checks, retry and fallback are recorded for the usage report.
- A draft is stored with its check result, so a reload shows only a reply that passed, or the fallback.
- Length and style slips in own-question replies can reach Learners; the soft checks count them per Reply kind.
- Stop drops the reply in progress, and the Learner's message stays, marked Stopped.
- After a few own questions the open Quick try can be far up the page, so a "Back to your turn" button brings it back.

## Alternatives considered

- **Prompt rules only:** no wait and no extra request, but the rules were already in the instructions and were broken.
- **Stream, then replace:** the first words show at once, but the Learner reads a reply that breaks a rule and then watches it vanish.
- **Hold every reply, own questions included:** every rule holds before anything shows, but a Learner waits up to half a minute for an answer.
- **Stream every reply:** faster everywhere, but step-led replies carry the teaching (the card's numbers, one ask, the caps), where the rules matter most.
- **Guard word by word:** words show sooner, but a Blocked number or advice can only be judged once the sentence is complete.
