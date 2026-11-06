# Every reply comes with one Widget and two or three Choices; emoji live in Widgets and Choices

Status: accepted, 2026-11-05 (spec "story-first, full-screen, Google sign-in", tickets D3a and E4a). Amends ADR 0007 and ADR 0008 (V4).

Every Tutor reply shows exactly one Widget. The Tutor may still open one itself, with open_widget or show_widget. When it does not, and code has not opened one for the step, code adds a companion Widget after the reply passes its checks. Code takes the first that fits, in this order:

1. the step's story scene, written ahead in the Topic's file;
2. a Lingo card for the first Topic term in the reply;
3. the Topic's Running-example scene;
4. a one-line card for the Case and its date.

It never adds one that shows an open quiz's Blocked numbers. Each reply's record names where its Widget came from (tutor, step, scene, lingo, running example, or case).

Every reply also ends with two or three Choices: tap-to-answer chips such as "What happened next?" or "Quiz me". Code picks them from a fixed set for the Teaching Step. The Tutor may suggest one through an optional tool, which code checks and may drop; the tool is optional because forcing a tool call is refused on Opus 5.5. Typing stays open. Widgets and Choices use emoji from a vendored set of Microsoft Fluent Emoji 3D images (MIT), so every device shows the same picture; reply text stays free of emoji, as V3 requires. Widgets gain nine story parts drawn by code, such as StoryScene, LingoCard and WhoPaysWhom, each checked for emoji names, dates within the as-of rule, currency, and no sum.

We chose this because the owner wants "generative UI for every prompt", lively and story-based, and a Tutor that leads (5 Nov 2026). Under ADR 0007 only 2 of 95 Topics had written-ahead Widgets, so most replies were bare text.

## Considered Options

- Ask the Tutor to always open a Widget (a prompt rule): prompt-only rules were broken in live runs (ADR 0006, 0008), and a forced tool call is refused on Opus 5.5.
- Bring back free-form Widgets (compose_widget) for the gaps: this was rejected in ADR 0007 for slow, uneven pictures with the wrong currency.
- Choices written by the Tutor in its text: they cannot be checked, would break V2's one-ask rule, and would vanish on a fallback.

## Consequences

- D3a builds the Choices: code's set per Teaching Step (`src/tutor/choices.ts`), the optional suggest_choice tool, a `reply_choices` session item stored after every checked reply, and a press sent by its index so the server posts the stored words as a chip turn, never an Insight attempt. Reply check V8 (no sum asked) costs one retry; after a failed retry the fallback drops the asking line, and the Choices carry the next move. The companion Widget and V4's change come with E4a.
- E4a builds the companion (`src/tutor/companion.ts`, wired in `turn.ts`) in the order above, the fourth as a one-beat timeline of the Case's as-of date and title. A candidate whose title or params hold an open quiz's Blocked numbers (a date's parts included, as V5 reads a Widget) is skipped, and so is one its recipe refuses. `reply_checks.widget_source` (a new, additive column) records tutor, step, scene, lingo, running_example, case or none, and null in an engine-off Session; the record fails soft without the column.
- ADR 0008's V4 reads "a valid Widget, exactly one per reply; code fills a missing one". No Widget is not a Tutor problem; more than one is still refused.
- ADR 0007's "at most one Widget per reply" becomes "exactly one". Its "when no recipe fits, the Tutor teaches in words" now ends "and code adds a picture".
- The companion runs only in Sessions frozen with the widget engine on. The production switch is the owner's step (#248).
- A companion can be less apt than one the Tutor chose. The Delight eval's Widget-fit judge watches this.
- Every Topic needs at least a Case, which every Topic has, so the safety-net card always exists. Story scenes are written for the first 12 path Topics now and for the rest later.
- About 150 small WebP files (under 1.7 MB) ship in `public/emoji/` with their licence and a credit line in Settings. Course files name emoji, and lint L11 checks each name.
- "Show me in a widget." leaves the chips (old Sessions still read it as a chip).
- Glossary: Widget (one with every reply), Companion Widget (new), Choice (new), Story scene (new), Lingo card (new), Archetype (adds Story and Lingo).
