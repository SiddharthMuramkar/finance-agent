# Only the Learner's call in a widget starts a Tutor turn

Status: accepted, 2026-11-14. Ticket: #16 (Tutor-widget event contract: option B, with V1 and S1). Builds on ADR 0011 (events leave the component as typed callbacks).

## Context

A Signal widget sends five kinds of event (spec §8.3): `call` (the Learner commits to an answer), `state` (a slider moves), `layer2_open` (Go deeper opens), `milestone` (the Learner finds something) and `reveal`. Each event that starts a Tutor turn costs one model call. A turn can also start while the Learner types, and only one turn runs at a time. Spec §8.1 says that tested data, not the model, decides what is right. Today the Tutor types the answers on practice cards, and a browser save that fails one check is lost.

## Decision

- A widget's `call` reaches the Tutor as a `widgetCall` turn input (a typed callback through `onAction`) and starts one turn. Only the first call starts a turn. A later tap, or a call while a turn runs, rides along.
- `state`, `layer2_open` and `milestone` ride along with the Learner's next message. `reveal` uses the existing Next to the reveal Teaching Step.
- Signal verdicts come from the dataset by `optionId`, never from the Tutor or the browser. The browser sends only the `optionId`. Practice cards keep the answer the Tutor types.
- Bad input from the Tutor is rejected, with the reason, so its words always match the screen.
- Input from the browser loses unknown keys, and its numbers are clamped to range and step, so a Learner never loses a save.

## Consequences

- One model call per widget. The turn starts right after the Learner's own tap, when they wait for a reply.
- The Tutor stays silent at a milestone until the Learner speaks. Moving later to milestone turns only adds behaviour, because the milestones are already recorded.
- There are two input rules, one for the Tutor and one for the browser.
- Milestones need a "moved by hand" flag, so a scripted move by the Tutor does not count (§6.3.3).
- Saved Widget state grows (call, Go deeper, milestones), which needs a migration (expand-then-contract, ADR 0016).

## Alternatives considered

- **Every event starts a turn:** the Tutor reacts to every move, but it means many model calls and turns that collide with typing.
- **`call` and `milestone` start a turn:** the Tutor names a find at once, but costs 1 to 3 more calls per widget and needs the "moved by hand" rule first.
- **No event starts a turn, pre-written text only:** no extra calls, but the chat feels scripted.
- **All verdicts from data, practice cards too:** the rule holds everywhere, but every Topic then needs written-ahead questions.
- **Clamp everywhere, or reject everywhere:** one rule, but either the Tutor's words can differ from the screen, or a Learner loses a whole save over one bad key.
