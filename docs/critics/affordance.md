# Affordance critic (spec §8.1)

## Inputs
- Screenshots at 1512×982, Light and Dark, of `/study`, `/course`, `/notebook`, `/settings`, `/login`, and of every part fixture in `src/widgets/fixtures/parts` (28 today, each drawn by `/dev/widgets` at 860 px).
- The `auditAffordances()` report (Appendix C.3).

## Rubric
Controls are flat. A button shows a face, an edge or a ghost label at 4.5:1 or better; there is no lip or raised face. Pressing is a colour step, with no movement.
1. Can you tell, without hovering, which things are buttons? Each needs a face, an edge or a ≥4.5:1 ghost label. List any that look like plain text.
2. Does any static label (tag, badge) look pressable? Tags are flat 6px labels with a dot, no pointer.
3. Is the primary action on each page obvious in two seconds? There is one filled primary per pane.
4. Does every icon-only button have a visible edge or face, or a ≥4.5:1 icon, and a tooltip?
5. Do hover, pressed, focus and disabled states look different from each other, inside Widgets too? Hover and press are colour steps; nothing lifts, sinks or moves; focus is a 2px ring.
6. Are targets big enough? Buttons and icon buttons ≥32px, chips, nav links and xs buttons ≥28px, answer options and a Widget's option rows ≥44px.

## Output
JSON only, no prose. Scores are 0-5, one per question.

```json
{"scores":{"q1":4,"q2":5,"q3":4,"q4":5,"q5":4,"q6":5},"findings":[{"page":"/study","element":"Next","problem":"looks like plain text","severity":"low"}]}
```

`severity` is one of `low | med | high`.

## Pass bar
Every score ≥ 4; 0 `high` findings.

## Tier
sonnet, medium.
