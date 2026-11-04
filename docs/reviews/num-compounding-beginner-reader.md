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
