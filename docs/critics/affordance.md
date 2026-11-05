# Affordance critic (spec §8.1)

## Inputs
- Screenshots at 1512×982, Light and Dark, of `/study`, `/course`, `/notebook`, `/settings`, `/login`.
- The `auditAffordances()` report (Appendix C.3).

## Rubric
1. Can you tell, without hovering, which things are buttons? List any that look like plain text.
2. Does any static label (pill, tag, badge) look pressable?
3. Is the primary action on each page obvious in two seconds?
4. Does every icon-only button have a visible edge or face?
5. Do pressed, hover, focus and disabled states look different from each other?

## Output
JSON only, no prose. Scores are 0-5, one per question.

```json
{"scores":{"q1":4,"q2":5,"q3":4,"q4":5,"q5":4},"findings":[{"page":"/study","element":"Next","problem":"looks like plain text","severity":"low"}]}
```

`severity` is one of `low | med | high`.

## Pass bar
Every score ≥ 4; 0 `high` findings.

## Tier
sonnet, medium.
