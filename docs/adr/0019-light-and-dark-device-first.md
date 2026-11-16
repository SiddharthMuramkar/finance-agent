# Light and Dark themes in the Signal colour language; the device chooses first

Status: accepted, 2026-11-16 (owner grilling session). Supersedes the "Dark deleted" part of ADR 0015. The rest of ADR 0015 holds: one colour language across the whole app.

## Context

ADR 0015 (14 November 2026) deleted Dark, so that the Signal colour language needed one checked set of values. On 16 November the owner asked for Dark, with a switch, now. Value It must look finished from its first Learner, and many people keep their phone or laptop in dark mode. The spec says a dark palette is "re-stepped and re-validated, never inverted" (§3.1).

## Decision

- Two themes, Light and Dark, across the whole site and the Study Workspace. Both use the Signal colour language: five colours and one pattern, each with one meaning.
- A first visit follows the device's light or dark setting. A switch in the site nav and in the app bar flips the theme and remembers the choice in a cookie. The theme is set before the first paint, so a page never flashes the wrong theme.
- Each signal colour and the hatch get their own dark value. The contrast and colour-blind separation checks of spec §2.4 must pass in both themes.
- Colour is still never the only signal (spec §1.1, rule 2).

## Consequences

- About 20 new colour values to design and measure.
- Every colour check and the visual tests run in both themes again.
- The theme code deleted in commit 950ccb2 can be a starting point, but its colours belong to the old colour language.

## Alternatives considered

- **Light only (ADR 0015):** one set of values to check, but the owner wants Dark now.
- **Dark on the public site only:** the site mounts the same widget code as the app, so it needs the dark colours anyway, and Learners would see two looks.
- **Light first, with a switch:** simpler, but it ignores the setting the person already chose on their device.
