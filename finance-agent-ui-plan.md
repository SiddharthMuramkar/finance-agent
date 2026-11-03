# Plan: the new look, built on prototype variant A

Everything `/to-spec` needs in one place: the problem, the chosen layout, every decision from the
grilling, what the prototype taught us, and the changes to the spec and glossary. The design system
itself (tokens, type, components) lives in `finance-agent-ui-spec.md`. This plan says what to build
with it.

## 1. Problem

The app works, but it has no design system. Pages use loose Tailwind stone classes, the only colour
with meaning is in the widgets (teal for the Learner's assumptions, amber for sourced facts), buttons
are near-black, and each page was styled on its own. The owner wants one calm, consistent look across
every page, built from `finance-agent-ui-spec.md`, and a public landing page to show the project to people.

## 2. Chosen layout: variant A, "Spec as written"

The owner compared three layouts in a working prototype (on the real `/` page, with real saved data)
and chose **A** because it is clean and minimal. A follows spec §3–§5 closely:

- **Shell.** Full height (100dvh), centred, max width 1152px. The header has "Study Workspace" on the
  left and four text links on the right. The grid is two equal columns, gap 32 (24 on an iPad).
- **Left column, top to bottom:**
  1. **Status card.** An eyebrow "COURSE MAP · <Stage> · <Topic>", the plain-text summary of where
     the Learner stands, and a navy Continue button.
  2. **Spaced review**, collapsed into one row ("Spaced review · N due · Show"), shown only when a
     review is due. It opens in place to show the question and its answer rows. (Changed from the
     prototype, where it was an open card, to give the chat about 150px more.)
  3. **Quiz Check**, collapsed into one row ("Quiz Check open · Show") so it doesn't push the
     conversation down. It opens in place.
  4. **Conversation** in its own scroll area. Learner messages are grey bubbles on the right. Tutor
     replies are plain 16/26 text with Citation numbers in navy and a Sources list at the end. Where a
     widget belongs there is a small "Widget N →" chip. "Under the hood" stays a quiet line under each reply.
  5. **Composer** pinned at the bottom, with a 24px fade above it so text never looks cut off.
- **Right column: the widget panel.** Sticky. When there are 2+ widgets, a row of chips (one per
  widget title) sits above one card. The card has an eyebrow naming the concept (e.g. "PRESENT VALUE",
  "CASE DATA", "CALCULATOR") and the widget. The newest widget opens by default. Picking a chip, in the
  chat or in the row, switches the widget, fades it in over 200ms and flashes the card border navy for 1s.
  With no widgets yet, a dashed box reads "Widgets the Tutor builds appear here."

**What the prototype taught us (fold these into the build):**
- The spec's panel height `calc(100dvh - 48px)` is about 40px taller than the space under the header.
  Cap the panel at the column height instead.
- The widget library's own frame draws a border, which doubles up inside the panel card. In the
  workspace the panel card is the only frame. The widget's title stays.
- The widget frame and the "could not be drawn" fallback still use palette classes. Move them to tokens.
- **Known cost of A:** as built, the status card, the open review card and the quiz row took about
  300px above the conversation, leaving roughly 250px for the chat on a laptop about 800px tall. The
  owner chose to fold the review into one row as well (see the left column above).

The prototype code is the primary source for these details. It is to be kept on the throwaway branch
`prototype/workspace-layouts` (variants A, B and C, the switcher and the sample conversation), never merged.

## 3. Decisions (all made by the owner)

**Devices**
1. Laptops/desktops and iPads only. On an upright iPad (768–1023px) the workspace keeps two columns,
   with gap 24 and padding 16. iPad has no hover, so a tap does what hover does (e.g. chart tooltips).
2. Phones (<768px): every signed-in page (Workspace, Course Map, Progress, Past Sessions, Passage view)
   shows one line: "The Study Workspace needs a bigger screen. Open it on a laptop or an iPad." This
   **replaces** today's phone view, where widgets sit inside the conversation and quizzes work one-handed.
   The landing page and Login still work fully on phones.

**Workspace**
3. Header links: Course Map · Progress · Past Sessions · Dark mode (all four kept).
4. The quiz panel, spaced reviews, Citation numbers, the Sources list and "Under the hood" all move to
   the new style.
5. Guided tasks (a stepper under a widget, e.g. "set the rate to 0%") are practice only. A step ticks
   itself when the widget reaches that state. Nothing is saved and nothing counts as a Check.
6. The spec's widget kit (cash-flow bars, comparison, KPI tiles, line over time, breakdown, formula
   card, guided tasks) stays as the list of widgets the Tutor may draw. Every one takes formula inputs
   or a Case Data reference, never numbers the model typed. Each is built in its own ticket. Today the
   Tutor can draw Slider, AnnuityChart, HistoryChart and Calculator.

**Other app pages**
7. Old Session page (`/sessions/:id`): the same two-column layout, read-only, with a "Back to the
   workspace" button where the composer was. There is no "Resume session": a Session is never resumed,
   and a new one starts.
8. Past Sessions: a list of cards. Each card has an eyebrow ("SESSION 3 · 24 OCT 2026"), a title made
   by code from the Topic name and the date (no summary written by the model), and pills (Topic, widget count).
9. Course Map: four groups, one per Stage (Foundation, Follow, Judge, Analyse), each a vertical list in
   default-path order with todo / current / passed dots. Foundation rows carry a **Subject** pill.
   Later Stages don't.
10. The nine Subjects for Foundation Topics, mapped from each Topic's ID:
    | Subject | Topics |
    |---|---|
    | Numbers & time value | num-*, present-value |
    | Financial statements | fs-* |
    | Economics & policy | eco-*, in-rbi-policy, in-economy, hist-macro-regimes |
    | Currencies & countries | fx-*, sov-default-country-risk |
    | Bonds & credit | bond-*, in-gsec, credit-analysis |
    | Markets & investing | eq-*, risk-*, mkt-*, funds-passive, real-assets |
    | Valuation & corporate finance | val-*, cf-* |
    | Derivatives | der-* |
    | Banks, crises & the system | bank-*, crisis-*, struct-*, private-credit, ins-risk-transfer, gov-ethics |
11. Progress, Passage view and Login keep their content and get the new style.

**Landing page (to be built)**
12. It's a showcase for people the owner shows it to. No sign-up and no accounts.
13. (Superseded by #77: the main address is now always Home and the workspace is at `/study`.) The main address depends on the passcode cookie. Signed out, it shows the landing page. Signed in,
    it goes straight to the workspace.
14. The stats card has real counts, made by code: Topics as "90 of 95" (written of planned), all Cases
    in the outline, and Library sources. Counts only: no private Library text and no Learner data on the
    public page.
15. "How it works" walks through the six Teaching Steps: story → concept → your turn → Check → reveal → principle.
16. The workspace appears as a screenshot in a browser frame, not a live widget.
17. The dark navy section: "Every number has a source". Code calculates the numbers, teal marks the
    Learner's assumptions, amber marks sourced facts, and every quote links to its passage.
18. Claude drafts the headline and text, marked DRAFT, for the owner to edit.
19. The landing page follows spec §6 Landing (sticky blurred header, hero with a faint grid, brand pill,
    two-line H1, buttons, the "How it works" stepper, the dark section and the footer). The stepper has
    the six Teaching Steps, not the spec's four words.

**Words (glossary)**
20. **Stage** has four values: Foundation (groundwork), then Follow, Judge and Analyse. The glossary
    currently lists three.
21. New term **Subject**: the field of finance or economics a Foundation Topic belongs to, e.g.
    Bonds & credit. _Avoid_: area, module, unit, track.
22. New term **Widget**: an interactive chart or calculator the Tutor puts beside the conversation.
    The Learner can change its assumptions at no cost. _Avoid_: artifact, card.

## 4. What changes, in plain words

- **Tokens.** The spec's colour variables (paper, ink, muted, border, hairline, navy brand, teal "you",
  amber "sourced", danger) become the app's own, on `:root` and `.dark`. Every page swaps its palette
  classes for them. Dark mode stays the existing cookie toggle.
- **Shared look pieces.** Small shared building blocks used everywhere: tag, eyebrow, pill, chip,
  primary and secondary buttons, card, callout. The prototype's versions show the exact sizes.
- **Workspace.** The real conversation component is rearranged to the variant A layout (section 2),
  keeping all of today's behaviour: streaming, resume after a cut-off, Retry, notices, the paste panel,
  the widget correction turn.
- **Widgets.** The widget frame and fallback use tokens. In the workspace panel the frame draws no border
  of its own.
- **Phone note.** Below 768px the signed-in pages show the note. Today's phone-only paths (widgets
  inline in the chat, thumb-sized answer rows) are no longer needed.
- **Course Map.** Stage groups, plus a Subject for each Foundation Topic. The Subject belongs to the
  course outline (one field per Topic, checked by `course:check`), so code and the page always agree.
- **Past Sessions and old Session.** Cards with code-made titles. The old Session page uses the
  two-column layout, read-only.
- **Landing.** A new public page. The passcode gate lets it through when signed out. Its stats come
  from the course outline and the database, as counts.
- **Architecture note.** Per CLAUDE.md, `docs/architecture.md` gets a section for each new layer: the
  design tokens, the phone note (replacing "Phone view"), Subjects in the outline, and the public landing page.

## 5. Testing

- Good tests check what the Learner sees, not how it is built. For example: the Course Map shows four
  Stage groups in order; a Foundation row shows its Subject; the phone width shows the note; a
  signed-out visit to `/` shows the landing page and a signed-in one shows the workspace (superseded by #77: signed in, `/` is still Home and the workspace is `/study`); the landing
  counts match the outline.
- Prior art: the page component tests next to the pages (course map view, old Session, phone view,
  widget view and calculator widget tests), the Course Navigator's tests for `courseOverview`, and
  `course:check` for the outline. The headless browser screenshot run used for the prototype (signed in,
  laptop and iPad, light and dark) is the model for a final visual check.
- `npm run check` must pass (typecheck, lint, course check, tests).

## 6. Out of scope

- Any phone design beyond the one-line note.
- Building the new widget kit pieces (each gets its own ticket later).
- Sign-up, accounts, a waitlist, or any Learner data on the landing page.
- The Market Workbench.
- Changing what the Tutor says or how teaching works.

## 7. Open questions

None. Every decision above was made by the owner.

## 8. Order of work (a suggestion for `/to-tickets`)

1. Tokens and shared look pieces, header and shell.
2. Workspace in the variant A layout (conversation, chips, composer, widget panel).
3. Quiz, spaced review, Citations, Sources and Under the hood in the new style.
4. Phone note on the signed-in pages.
5. Course Map with Stage groups and Subjects (plus glossary: Stage, Subject).
6. Past Sessions cards and the read-only old Session page.
7. Progress, Passage view and Login restyle.
8. Landing page, public route and stats.
9. Spec and glossary updates (`finance-agent-ui-spec.md`: four header links, phone note instead of the
   drawer, Course Map in Stage groups, old Session without "Resume", landing as decided, panel height
   fix). Glossary: Widget.
