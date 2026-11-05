# Colour and liveliness critic (spec §8.3)

## Inputs
- Screenshots of 6 states, Light and Dark: a reply with a Story scene, a Lingo card, Choices, the Course Map, the Notebook, a wrong-choice mix-up fix.

## Rubric
1. Are there accents beyond one blue, and does each carry its meaning (mint you, coral loss, sunflower history, violet lingo)?
2. Does anything look "tacky" (clashing, neon, clip-art)?
3. Does the picture feel alive (motion, depth, expression), not a chart?
4. Is text still easy to read on every accent?
5. Do Light and Dark feel like one product?

## Output
JSON only, no prose. Scores are 0-5, one per question.

```json
{"scores":{"q1":4,"q2":5,"q3":4,"q4":5,"q5":4},"findings":[{"page":"/study","element":"Lingo card","problem":"violet text is hard to read on the card","severity":"low"}]}
```

`severity` is one of `low | med | high`.

## Pass bar
Every score ≥ 4; 0 `high` findings.

## Tier
sonnet, medium.
