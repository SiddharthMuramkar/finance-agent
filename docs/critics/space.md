# Space critic (spec §8.2)

## Inputs
- `measureLayout()` JSON (Appendix C.2) at 1024, 1280, 1512 and 1920.
- Screenshots of the same four widths.

## Rubric
1. Is any large area empty that content could use?
2. Does the Widget panel dominate without cramping the chat?
3. Do wide screens use extra width for content, not only for margins?
4. Is prose still readable (no 120-character lines)?
5. Any clipped, overlapping or scrolling-inside-scrolling content?

## Output
JSON only, no prose. Scores are 0-5, one per question.

```json
{"measurements":{"gutterPx":0,"widgetPct":0,"chatPct":0},"scores":{"q1":4,"q2":5,"q3":4,"q4":5,"q5":4},"findings":[{"page":"/study","element":"chat column","problem":"lines run to 120 characters","severity":"low"}]}
```

`severity` is one of `low | med | high`.

## Pass bar
Metrics in §6.2 all met and every score ≥ 4.

## Tier
sonnet, medium.
