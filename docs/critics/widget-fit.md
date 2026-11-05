# Widget fit (spec §8.9)

## Inputs
- A Widget's screenshot and program, plus the reply it came with (or a fixture alone).
- Inside the Delight eval it runs as the judge in Appendix D.2.3.

## Rubric
1. match: does the Widget show the reply's one idea? (1 = unrelated, 3 = same Topic, different idea, 5 = the same idea, and it adds something the words do not)
2. lively: does it feel alive? (1 = a bare chart or form, 3 = clean but static, 5 = characters, motion or a story moment I want to tap)
3. emoji: are the emoji meaningful (each one stands for a person, object or idea in the story) or decorative? List each decorative one.
4. alone: would it make sense without the reply? (yes or no)
5. kind: one of `story | lingo | timeline | chart_only | other`. `chart_only` = its parts are only Chart, Slider, Stat or Waterfall.

## Output
JSON only, no prose. Any other output counts as a failed judgement and is re-asked once.

```json
{"id":"D03","match":5,"lively":4,"emoji":{"meaningful":["money-bag","bank"],"decorative":[]},"alone":true,"kind":"lingo","source":"lingo","why":"The Lingo card shows the same word the reply teaches."}
```

## Pass bar
Median match ≥ 4/5; 0 `chart_only` in the 20-prompt eval.

## Tier
sonnet on fixtures (E2a, E2b, E4a); opus inside the Delight eval.
