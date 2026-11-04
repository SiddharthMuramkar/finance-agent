# Beginner-reader review: Growth, compounding and logs (ticket #247)

The three Concept cards of `course/topics/num-compounding.yaml`, read cold. This lane could not spawn a fresh
subagent, so the review was a separate pass that read only each card's text and the cards before it, nothing else
in the Topic. For each card it asked:

1. Could an adult in India with no finance background follow it in two minutes?
2. Is every term defined before it is used?
3. Is any step missing?

Percent (the prerequisite Topic) counts as taught, so "10% of ₹1,100" and "percent change" need no definition.

## Card 1: Growth on growth (Check `cp-quiz-compounding`)

**First read.**
- Follow in two minutes: yes.
- Terms: "compounding" was never named on the card, only shown.
- Steps missing:
  - "year three at ₹1,331" jumped from ₹1,210 without the ₹121;
  - "20% up is only ₹960" skipped the ₹160 that 20% of ₹800 adds;
  - "At 6% a year, money doubles in about 12 years" never showed 72 divided by 6.

**Changed.**
- Each year's gain is now said in rupees (₹110, then ₹121).
- The fall line says the ₹160.
- The rule-of-72 line says "72 divided by 6 gives about 12 years".
- The write-down line names compounding.

**Second read.** Every step is shown, and the one new term is named. **Verdict: pass.**

## Card 2: One steady rate (Check `cp-quiz-steady-rate`)

**First read.**
- Follow in two minutes: yes for CAGR; no for log returns, which were described ("a second way to measure growth")
  with no example.
- Terms:
  - "CAGR" was used as a bare acronym;
  - "percent return" was not a term the Learner had met.
- Steps missing: "Dividing the ₹331 gain by 3 years says about 11%" skipped ₹110 a year being 11% of ₹1,000.

**Changed.**
- CAGR is spelled out as the compound annual growth rate.
- The averaged-gain line says ₹110 a year, 11% of ₹1,000.
- The log line now gives a worked example in words: 0.3 one year and 0.1 the next make 0.4.
- It compares a log return with the "percent change", the word Percent taught.

**Second read.** CAGR and log return are both defined before use, and each sum is said in words with its steps.
**Verdict: pass.**

## Card 3: Is the pace steady? (Check `cp-sensex-rate`)

**First read.**
- Follow in two minutes: only partly. "Find the CAGR of each with the steady-rate card" named a card the reader had
  not met by that name.
- Terms: fine; CAGR is defined on card 2.
- Steps missing: there was no worked example of an uneven path.

**Changed.**
- The card now works a made-up example: 100 became 600 in 10 years, about 20% a year, but the last 2 years went from
  300 to 600, about 41% a year.
- Its Formula Card opens on that last stretch.
- It keeps away from the Sensex's figures, which belong to the story and the conversation Check.
- Later, the card was given its own Skill (steady pace) and Quick tries on made-up stretches. The card's text did not
  change.

**Second read.** The point (a long-run rate can hide a fast last stretch) is shown with numbers a beginner can check
on the card. **Verdict: pass.**

## Result

| Card | Final verdict |
|---|---|
| Growth on growth | pass |
| One steady rate | pass |
| Is the pace steady? | pass |

## Second pass: a fresh-context beginner reader (ticket #248)

A fresh reader with no other context read both Topics' cards and tried every Quick try as a beginner. Verdict, card
by card, with what changed for each fail.

| Card (Check) | Verdict | What the reader said | What changed |
|---|---|---|---|
| Growth on growth (`cp-quiz-compounding`) | pass | Quick tries answerable; the templated ones mean long year-by-year sums. | Nothing. |
| A fall, then a rise (`cp-quiz-fall-recover`) | pass | "A percent works on the amount it starts from" is abstract, and "₹200 on ₹800 is 25%" relied on the Percent Topic. | Line 1 now says a percent is a share of the amount you have at that moment; line 4 shows ₹200 divided by ₹800 is 0.25, a 25% rise. |
| Time to double (`cp-quiz-rule-72`) | pass | Clear. | Nothing. |
| One steady rate (`cp-quiz-steady-rate`) | fail | Two ideas packed in, line 3 needed two reads, and no method for finding a CAGR; the steady-rate half-done hint ("ended 1.69 times where it started") taught nothing, so two template tries were unanswerable. | The card now teaches one idea with a method: for 2 years divide the end by the start, find the number that times itself gives that (square-root key), worked on 100 to 144 (1.2 times 1.2, so 20%). The "do not split the gain evenly" line is gone. The hint now says "the end divided by the start is {grew}". The CAGR Quick try hint was reworded the same way, and 144 joined the template's avoid list. |
| Returns that add up (`cp-quiz-log-return`) | fail | Never said what a log return is or how to get one; three facts on one card. | Line 1 now defines it (divide end by start, press ln); line 2 works a 20% rise (about 0.18, a little below 0.20); the card keeps one use, that log returns add, with the round trip as the consequence. |
| Is the pace steady? (`cp-sensex-rate`) | pass | "Hide an uneven path" was vague; two tries needed a 2-year CAGR that no card taught. | Line 1 reworded. Line 3 now works the made-up stretch (2 times, about 1.41 times 1.41, so about 41%). The CAGR card now teaches the 2-year method these tries use, and their half-done hints say which number to find. |

Result: all six cards pass after the second pass.
