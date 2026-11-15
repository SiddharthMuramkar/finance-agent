# Colour and liveliness critic (spec §8.3)

## Inputs
- Screenshots of 6 states, Light and Dark: a reply with a Story scene, a Lingo card, Choices, the Course Map, the Notebook, a wrong-choice mix-up fix.

## Rubric
Families are thin marks (ADR 0015: saturated colour only in small marks). Until #32 lands, royal blue is only for what can be pressed, is selected or is current.
1. Is royal blue the only accent on what can be pressed, is selected or is current, in the chrome and inside Widgets?
2. Does any mint, coral, sunflower or violet appear as a fill, a tinted card, a tag background or a big coloured area? List each.
3. Does each family mark (a line, a dot, a thin edge, an Icon stroke) carry its meaning: mint the Learner and gains, coral losses and warnings, sunflower history and stories, violet lingo?
4. Does anything look like a toy: emoji, 3D, stickers, tilted shapes, drop shadows, pills, bounce?
5. Does each Widget still invite play (something to press, move, turn or step) while looking minimal and professional?
6. Is text easy to read, and is status never shown by colour alone?
7. Do Light and Dark feel like one product?

## Output
JSON only, no prose. Scores are 0-5, one per question.

```json
{"scores":{"q1":4,"q2":5,"q3":4,"q4":5,"q5":4,"q6":5,"q7":5},"findings":[{"page":"/study","element":"Lingo card","problem":"violet text is hard to read on the card","severity":"low"}]}
```

`severity` is one of `low | med | high`.

## Pass bar
Every score ≥ 4; 0 `high` findings.

## Tier
sonnet, medium.
