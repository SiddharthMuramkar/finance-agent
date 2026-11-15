# The Tutor chooses a Widget recipe; tested code draws it, and every number has a known origin

Status: accepted, 2026-11-14. Ticket: [#4](https://github.com/SiddharthMuramkar/finance-agent/issues/4) (Restore design docs from the archive?, start fresh: one new ADR for each decision the code still follows). Written new from the archived ADRs 0003, 0005 and 0007. Narrowed by ADR 0011 for the five Signal widgets. The as-of rule for Case Data is ADR 0013.

## Context

A Widget that the model writes as code arrives last (after its prose and hundreds of tokens of code). It is laid out from scratch each time, and it fails in the same few ways: a wrong currency, missing labels, invented numbers, and pictures the Learner must work out. In one Percent Session (4 November 2026) the Tutor drew four Illustrations, and one showed a dollar sign in a rupee Topic. The model is good at choosing what to show. Code is good at drawing it and at getting the numbers right.

## Decision

- The Tutor never writes Widget code and never draws a Widget of its own. The two older lanes that let it, `compose_widget` and the engine-off lane (the Tutor wrote the Widget into its reply), were deleted in [#19](https://github.com/SiddharthMuramkar/finance-agent/issues/19). Every Session freezes the widget engine.
- The Tutor names a Widget recipe and its params with `show_widget`, or opens a written-ahead Widget with `open_widget`, at a preset.
- Code parses the params against the recipe's schema, compiles the Widget, runs the Widget checks and stores it. A reply carries at most one Widget. A problem goes back to the Tutor as a tool error, so it can retry in the same turn.
- Every number on a Widget has a known origin, in one of three kinds of param:
  - **inputs**: ranges, starting values and calculator inputs. Tested code works out the numbers from them.
  - **refs**: Case Data references, checked under the as-of rule (ADR 0013).
  - **facts**: numbers the Tutor types. Any fact makes the Widget an Illustration, and code puts "Illustration:" before its title.
- When no recipe fits, the Tutor says so in one sentence and teaches in words.

## Consequences

- Widgets look the same each time, use the right currency and arrive fast, because code draws them.
- The Tutor can only show what a recipe or a Topic file covers. Topics without recipes teach in words until someone writes the recipes and presets.
- A Session frozen with an old lane could not resume a saved call. #19 deleted the lanes only after the #33 data wipe left no such Session.
- Each new recipe is code work: a schema, its checks, its tests and a line in the Tutor's instructions.

## Alternatives considered

- **The Tutor writes free-form Widgets (archived ADR 0003):** any idea can be drawn, but each Widget is slow, uneven and can carry invented numbers.
- **Free-form plus recipes:** covers the most ideas, but the free-form path is the one that drew the bad Illustrations.
- **Stricter prompt rules for free-form Widgets:** more rules made the prompt longer and the Widgets slower, and did not make them better.
