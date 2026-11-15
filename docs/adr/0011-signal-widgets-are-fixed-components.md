# Each Signal widget is one fixed React component with two doors

Status: accepted, 2026-11-14. Ticket: [#5](https://github.com/SiddharthMuramkar/finance-agent/issues/5) (Widget engine for the 5 Signal widgets, option A: shared core, two doors). Narrows ADR 0009 for the five Signal widgets: they are fixed components, not compiled OpenUI Lang programs.

## Context

The Signal spec has five live widgets: Jackpot, Four levers, Compounding, Rates and WeWork. They show on public pages (an Example in full, the hero in compact form), where no Tutor runs. The Study Workspace opens Widgets only through recipes (ADR 0009): `show_widget`, then OpenUI Lang, then our parts. The rates widget was built both ways. Through OpenUI it bent the spec: it refused bad input instead of clamping it, moved in 0.01 steps, added Guided Tasks, had no modes and saved taps as a number. As a plain component it matched the spec, but it had no Tutor path, no save and no tests.

## Decision

- Each Signal widget is one fixed React component (the core). Its props are a state, a mode, a dataset and event callbacks. It takes its numbers only from the shared widget models in `src/finance/signal/` (and, for Four levers, the engine of ADR 0010).
- Site pages mount the core directly. No OpenUI runs on first paint.
- Later, the Study Workspace opens the same core through a thin, recipe-only OpenUI part (the Workbench pattern). The part turns `$variables` into props and sends events through `onAction` (ADR 0012).
- Verdicts, colours and ranges live in code, never with the Tutor.

## Consequences

- One drawing per widget, so the site and the Study Workspace look the same.
- The site does not wait for the Widget pipeline. The recipe doors can land after the beta.
- Core tests are plain React tests. Each door gets the generic recipe tests.
- Each widget has two adapters (site and recipe) to keep in step, and each door changes the Widget library, the checks and the prompt budget once.
- State that is not a number needs a number code in the door, or a change to saved Widget state.
- Look again if the Study Workspace stops using OpenUI, or if a widget needs a layout the Tutor writes.

## Alternatives considered

- **Fixed components only, no door:** the simplest build, but no widget event reaches the Tutor, and the app has two Amazon levers widgets unless one is retired.
- **Recipes only (OpenUI everywhere):** one path into the Study Workspace, but the public pages wait for the pipeline, and the OpenUI door bends the spec as the rates prototype showed.
