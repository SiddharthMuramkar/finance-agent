# Handoff: paused work, 2026-11-19

Two streams were paused on 2026-11-19. Everything that passes CI is on `main`: batch 1 of the UI audit (#120), and the linear Course docs and research (this folder). Batch 2 of the UI audit fails browser tests, so it stays on branch `branch-1` (PR #121, kept up to date with `main`). Nothing is lost. This file says what is done, what is left, and where each piece lives. Read it before resuming either stream.

## Resume on any machine

1. Pull `main` for Stream B. For Stream A batch 2, check out `branch-1`. Then `npm ci`.
2. The workflow scripts in this folder hard-code a repo path (`REPO`, and `OUT` in `curriculum-workflow-v2.js`). Set them to your checkout and a scratch folder before running one.
3. Every merge, migration or production change still needs the owner's yes (root `CLAUDE.md`).

## Stream A: UI audit against modern-web-guidance

Was `feat/visual-polish-batch-1` (PR #120) and `branch-1`.

### Done

- **Batch 1, visual polish**: all of it, on `main` (#120; its PR body is the full list).
- **Batch 2, native overlays**, on `branch-1` only (PR #121), slices 1, 3 and 4:
  1. Site nav popovers: the phone Menu sheet and the site account menu are `popover="auto"`, with Esc, outside click and an opacity fade (`src/app/(site)/site-nav.tsx`).
  3. Start over in Settings opens a native modal `<dialog>` (`src/app/settings/settings-controls.tsx`).
  4. Every `<details>` slides open and shut (one block in `src/app/globals.css`).

### Left

1. **Slice 2, app menus: fix it. It breaks the browser tests.** It was mid-run at the first pause (`6546115`) and committed partial: `src/app/primitives/menu.tsx`, `popover.ts`, `account-menu.tsx`, `topic-options.tsx`, `workspace-parts.tsx`. Unit tests pass. In CI on PR #121 (2026-11-19), 22 browser tests failed; batch 1 alone (#120) passed them all:
   - `e2e/phone-pages.spec.ts` (8 tests) and `e2e/phone-workspace.spec.ts` (2 tests), at p360 and p390. "only the Settings gear steps aside" received `["Settings", "Settings", "Sign out"]`. The always-rendered account menu popover puts its hidden items in the header. Either the closed popover is not really hidden, or the `fitsThePhone` helper must skip closed popovers. Decide which is right. The same tests also report "no sideways scroll".
   - `e2e/message-row.spec.ts:106` at mbp14: "horizontal scroll at 768×1024". This is probably the same menu, positioned off-screen while closed. Check that the menu CSS does not override the UA rule `[popover]:not(:popover-open) { display: none }`.

   After the fix, open the account menu, Topic options and the All steps list by hand. Check keyboard (arrows, Home/End, Esc, focus return), position, light and dark, and the p360 phone layout. The brief is `SLICES[1]` in `batch2-workflow.js`.
2. **Slice 5, Widget tab strip and scroll fades: not started.** Make the strip a `role="tablist"` with roving tabindex, manual activation and Home/End. Add a reusable `scroll-fade-x` utility driven by a scroll-driven animation, and apply it to the tab strip, `.md pre`, `.md table` and the phone How-it-works rail. The full brief is `SLICES[4]` in `batch2-workflow.js`.
3. **Close out batch 2**: full `npm run check` and `ui:test`, the code-review skill, and a live keyboard and visual pass in both themes and on phone. Then get PR #121 green and merge it.

## Stream B: the linear Course redesign

Was `research-linear-course` and `branch-2`.

### Done (on `main`)

- ADRs 0021 to 0024 (one fixed Course built bottom-up, Lessons teach in Beats, the learner builds two Anchor valuations, no commentator names), plus the GLOSSARY and the ADR updates. The owner answered round 4 Q1 to Q8 "yes to all".
- The research, all in this folder:
  - `audit/`: the Value It course audit. `report.md` is the synthesis, `verify.md` holds the corrections to it, and the spine and off-spine files are the triage. `code-facts.md` covers code constraints.
  - `code-plan.md`: the code plan, with a 15-slice build order in §9 and questions for the owner at the end.
  - `anchor-data-2019.md`: a data check for Coca-Cola and DMart, mid-2019.
  - `spec-draft.md` and `spec-appendix-anchors.md`: the spec body without its curriculum parts.
  - `curriculum-workflow.js` (Linux paths) and `curriculum-workflow-v2.js` (Mac paths): the curriculum workflow.

### Left, in order

1. **Write the curriculum**: about 75 Lessons in about 11 Units. Run `curriculum-workflow-v2.js` after fixing `REPO` and `OUT`: draft, then 3 critics (a zero-knowledge reader, a valuation expert, decisions compliance), then a revision with a term ledger check. It stopped mid-draft with nothing written. The output becomes `docs/specs/linear-course-curriculum.md`.
2. **Finish the spec**: fill the placeholders in `spec-draft.md` (`<<UNITS>>`, `<<LADDER>>`, `<<BUILD>>`, `<<OPEN>>`, `<<APPENDIX>>`, the last from `spec-appendix-anchors.md`). Move it to `docs/specs/linear-course-spec.md` and update the Specs line in root `CLAUDE.md`.
3. **Open the issues**: one per slice in `code-plan.md` §9. Slice 1 (ADRs and glossary) is done, which leaves 2 to 15, labelled agent or human as the plan says. Slices 1, 10, 11 and 14 can start in parallel.
4. **Owner questions** at the end of `code-plan.md`: the flat-growth Shortcut, profit in the first Rough value, Library licences, the critics gate, Reviews, the Anchor as-of date, the bank and insurer Cases, and the Unit milestone name. ADRs 0021 to 0024 already settle some (for example, Units end on a "Can-do line"). Confirm the rest.

## Cleanup once both streams are done (owner's yes for each delete)

- Delete this `handoff/` folder.
- These are fully on `main` now and can be deleted: the branches `branch-2`, `research-linear-course` and `feat/visual-polish-batch-1` (local and remote), and the worktree `../finance-agent-branch-2`.
- Keep `branch-1` and the worktree `../finance-agent-branch-1` until PR #121 merges.
