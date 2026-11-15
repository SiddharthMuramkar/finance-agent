# One Light theme across the whole app, in the Signal colour language

Status: accepted, 2026-11-14. Ticket: [#17](https://github.com/SiddharthMuramkar/finance-agent/issues/17) (Colour language and theme scope, option C: whole app, one Light theme). Supersedes the archived "two modes" ADR (old 0013, "Flat controls, one accent, two modes"), and with it old 0012 ("Two themes, Light and Dark"). Also replaces the accent families of old 0014 ("Flat, icon-only Widgets") and the royal-blue Band of old 0022. The archived ADRs are not in this repo.

## Context

The old app had two Themes, Light and Dark, one royal-blue accent and four accent families (mint, coral, sunflower, violet). Mint meant "the Learner's own". The Signal spec (§2, §3.1) gives colour a meaning: blue is "You", green is gain, red is loss, orange is careful, black is the record. That is five colours and one pattern. One colour has one meaning, and colour is never the only signal. The spec has one Light theme and no dark values ("re-step and re-validate, never invert"). If the site uses the spec colours and the app keeps the old ones, blue means "you" on one screen and green means "you" on the next.

## Decision

- The whole app uses the Signal colour language in one Light theme.
- It is built token-first: each old token in `globals.css` points at its new meaning (for example `--you` → blue, `--mint` → gain, `--coral` → loss). Then the files that choose a colour by name, not by meaning, are fixed. No sixth colour: sunflower and violet become neutral or black.
- Dark mode, the theme toggle, `readTheme()` and the dark-only tests are deleted.
- A Learner who chose Dark gets Light. The choice was only a cookie, so no data moves.
- `CHART_SERIES` changes last, because the Signal widgets are fixed components (ADR 0011).

## Consequences

- One colour language everywhere, and one set of values to check for contrast.
- The test suite gets smaller: the dark Playwright projects and specs go.
- Learners lose the Dark choice.
- Adding Dark later means designing a second set of every signal colour and checking each one again.
- The critics' guide (`docs/critics/README.md`) must judge the look by this ADR, not old 0013.

## Alternatives considered

- **Site only:** the smallest change, but two colour languages, and the site already mounts app widget code.
- **Whole app, keep Dark:** Learners keep Dark, but every signal colour needs a second, untested dark value, and every check runs twice.
- **Phased (site and Signal widgets first, the rest after the beta):** less before the deadline, but beta Learners see two languages for about a month.
