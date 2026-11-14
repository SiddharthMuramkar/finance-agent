# Final two-axis code review (spec §8.8)

## Inputs
- The whole spec's merged changes since commit `9b8b6e4`.
- The spec file `docs/specs/2026-11-05-story-first-full-screen-google-sign-in.md`.
- The `/code-review` skill.

Axes: **Standards** (repo coding standards, CLAUDE.md, ADRs, glossary) and **Spec** (does the code do what each ticket's Done-when says).

## Rubric
Per ticket: is every Done-when met, with evidence? Any dead code, any duplicated logic, any test that asserts nothing?

## Output
JSON only, no prose. The `ReportFindings` shape.

```json
{"findings":[{"file":"src/example.ts","line":1,"summary":"the Done-when metric is not asserted","failure_scenario":"the metric regresses and no test fails","verdict":"CONFIRMED"}]}
```

`verdict` is one of `CONFIRMED | PLAUSIBLE`.

## Pass bar
0 confirmed `high`; the rest become one fix PR (F2).

## Tier
opus, medium (judge). At most 2 judges per workflow run.
