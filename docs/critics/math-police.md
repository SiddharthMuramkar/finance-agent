# Math police (spec §8.5)

## Inputs
- A set of course files (a D2 or E6 batch) or a list of Tutor replies.
- Inside the Delight eval it runs as Appendix D.2.2.

## Rubric
1. Does any question ask the Learner to compute, calculate, work out, find a number, or type a figure?
2. Does any choice set require arithmetic to tell right from wrong, instead of knowing the idea?
3. Does any Quick try, Check, Review or reply stem say "how many", "how much", "what is X% of", "to N decimal places"?
4. Do wrong choices have a mix-up fix, and is it a slip, not random?

## Output
JSON only, no prose.

```json
{"checked":12,"violations":[{"file":"course/example/topic.yaml","id":"q3","stem":"What is 5% of 200?","why":"asks the Learner to compute a percentage"}]}
```

## Pass bar
0 violations (100 % of D2 and E6 output). A violation is high-stakes: 3 votes.

## Tier
sonnet, medium.
