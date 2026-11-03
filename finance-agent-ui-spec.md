# UI Spec — Finance Agent ("Study Workspace" system)

Build every page from this file. It merges two sources:
- **A. Study Workspace** (your screenshots + the live site). This is the base. Values come from computed styles and 2× screenshots measured at 1104px content width. Values marked `~` are estimates.
- **B. Terrastack spec (navy)**. Only some patterns come from it: navy as the action color, eyebrows, pills, KPI tiles, labeled bars, key/value rows, the stepper, the blurred header and the landing layout.

Implementation: Tailwind v4 default palette (stone / teal / amber) plus one custom navy scale. Tailwind names are in [brackets]. Define tokens as CSS variables on `:root` and `.dark` (dark mode = `.dark` class on `<html>`). Don't hardcode hex values in components.

## 1. Principles
1. **Talk on the left, build on the right.** The conversation lives in the left column. Every generated UI lives in the right panel. Never render a big widget inline in the chat.
2. **Paper and ink.** Warm off-white page, near-black text, 1px stone borders, no shadows, small radii (4/6/8).
3. **Three colors, three meanings.** Navy = the app (actions, links, active states). Teal = *you* (assumptions you control, plus values computed from them). Amber = *the world* (sourced facts, always shown with source and date). Gray = neutral data. Nothing else gets color.
4. **Every number shows where it came from**, through a tag or a callout. No unlabeled numbers or bars.
5. **Quiet motion**: 150ms for data, 200ms for UI.

## 2. Tokens
### Color
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#FAFAF9` [stone-50] | `#0C0A09` [stone-950] | page, header, card fill (cards are transparent) |
| `--ink` | `#1C1917` [stone-900] | `#F5F5F4` [stone-100]~ | all text, titles, values |
| `--muted` | `#79716B` [stone-500] | `#A6A09B` [stone-400] | nav links, captions, legend, sources, chip text, placeholder |
| `--border` | `#D6D3D1` [stone-300] | `#44403B` [stone-700] | cards, inputs, chips |
| `--hairline` | `#E7E5E4` [stone-200] | `#292524` [stone-800] | dividers in cards, slider track, gridlines |
| `--bubble` | `#E7E5E4` [stone-200] | `#292524` [stone-800] | your chat message (the "prompt shade") |
| `--field` | `#FFFFFF` | `#1C1917` [stone-900] | inputs and tooltips (the only white surfaces) |
| `--brand` | `#002366` | `#6699FF` | primary buttons, links, focus ring, active nav/chip/step |
| `--brand-hover` | `#001E57` | `#85ADFF`~ | hover on brand fills |
| `--brand-tint` | `#F0F5FF` | `#6699FF` @12% (≈`#161B26`) | active chip/row bg, brand pill bg |
| `--brand-line` | `#C2CDE2` | `#6699FF` @35% (≈`#2B3B5E`) | active chip/pill border, stepper ring and connector |
| `--you` | `#00786F` [teal-700] | `#00D5BE` [teal-400] | slider, "worth today" bars, your value bar |
| `--you-line` | `#009689` [teal-600] | `#00D5BE` [teal-400] | assumption callout left border |
| `--you-tint` | teal-50 @50% (≈`#F5FCF9` on bg) | teal-950 @20% | assumption callout bg |
| `--you-tag` / `--you-tag-ink` | `#CBFBF1` / `#0B4F4A` [teal-100/900] | `#022F2E` / `#96F7E4` [teal-950/200] | YOUR ASSUMPTION tag |
| `--src` | `#E17100` [amber-600] | `#FFB900` [amber-400] | sourced value bars and markers (never small text) |
| `--src-line` | `#FE9A00` [amber-500] | `#FFB900` [amber-400] | sourced callout left border |
| `--src-tint` | amber-50 @50% (≈`#FDFBF2` on bg) | amber-950 @20% | sourced callout bg |
| `--src-tag` / `--src-tag-ink` | `#FEF3C6` / `#7B3306` [amber-100/900] | `#461901` / `#FEE685` [amber-950/200] | SOURCED tag, amber text labels |
| `--data` | `#D6D3D1` [stone-300] | `#44403B` [stone-700] | neutral series (e.g. "payment in its year") |
| `--danger` | `#C10007` [red-700]~ | `#FF6467` [red-400] | errors only |

Text on brand fills: white in light mode, `#0C0A09` in dark mode. Disabled controls use `opacity: .5` (the live disabled Send renders `#8A8988`).

### Type
Font: system stack (measured): `-apple-system, system-ui, "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans", Arial, sans-serif`. Every number uses `font-variant-numeric: tabular-nums`.

| Role | px size/line | Weight | Notes |
|---|---|---|---|
| Page title h1 | 18/28 | 600 | |
| Widget title h3 | 16/26 | 500 | mb 8 |
| Tutor text | 16/26 | 400 | `white-space: pre-wrap`; a blank line (26px) separates paragraphs |
| Your bubble | 16/24 | 400 | |
| UI text (buttons, status card, control rows, callouts, nav) | 14/20 | 400 | live values 500; key figures in callouts 700 |
| Caption (legend, source, date, chip) | 12/16 | 400 | `--muted` |
| Tag | 11/16 | 500 | UPPERCASE, letter-spacing .025em (0.275px) |
| Eyebrow (B) | 11/16 | 600 | UPPERCASE, .08em, `--muted` |
| KPI value (B) | 20/28 | 600 | |
| Landing only (B) | H1 56/60 700 −1.5px · H2 36/40 700 −0.9px · H3 20/28 600 | | |

### Shape and space
- Radius: **4** for buttons, inputs, chips, tags. **6** for callouts, KPI tiles, tooltips. **8** for cards and bubbles. **full** for pills and stepper dots. Nothing in the app goes above 8 (the landing mockup frame may use 12).
- Borders are 1px `--border`. Dividers are 1px `--hairline`. **No shadows anywhere** (the live CSS ships none).
- The spacing base is 4px. Inside widgets, step in 8px. Between the status card and the chat: 24. Between messages: 16. Column gap: 32.

## 3. App shell (Study Workspace)
- Full-height shell (`100dvh`). Container `max-width: 1152px` [max-w-6xl], centered, `padding: 24px 24px 12px`.
- **Header** (row, space-between, mb 24): h1 "Study Workspace" on the left. On the right, four text links 14px `--muted` with a 16px gap: Course Map · Progress · Past Sessions · Dark mode (the dark-mode toggle is the fourth link). On every page but the workspace, "Study Workspace" links to `/`. Hover is `--ink`. The current page is `--brand` with a 1px underline, offset 4px, and `aria-current="page"`.
- **Grid**: `grid-template-columns: 1fr 1fr; gap: 32px; align-items: start`, giving two 536px columns. Both columns start at the same y (76px from the top).
- **Left column** is a flex column: status card, then the message list (its own scroll, `min-height: 0`), then the composer pinned 12px above the viewport bottom. Add a 24px `--bg`→transparent fade above the composer so text never looks cut off. (The live page currently hides text behind the composer.)
- **Right column** is the widget panel: `position: sticky; top: 24px; overflow-y: auto`, with its max height capped at the column height (decided in #42: the earlier `calc(100dvh - 48px)` was about 40px too tall). The card hugs its content (live: 536×547).
- On pages that scroll the whole window (Past Sessions, Course Map, Landing), the header is sticky (B): `--bg` @90%, `backdrop-filter: blur(8px)`, and a 1px `--hairline` bottom border that appears after scrolling.

## 4. Conversation components (measured)
- **Spaced review** (decided in #42): folded into one row, "Spaced review · N due · Show", shown only when a review is due; Show opens it in place. An open quiz Check folds the same way ("Quiz Check open · Show").
- **Status card**: 1px `--border`, r8, p16, transparent, live size 536×105. The message is 14/20 `--ink`, with the primary button 16px below it. Optional (B) eyebrow above the message ("COURSE MAP").
- **Primary button** ("Continue"): `--brand` fill, white 14/20, weight 500~, padding 8×16, giving 90×36, r4. Hover `--brand-hover`. Focus: 2px `--brand` outline, offset 2. Disabled: opacity .5.
- **Secondary button** (B): transparent, 1px `--border`, `--ink` text, same size as primary. Hover bg is `--hairline`.
- **Your bubble**: `--bubble`, r8, padding 8×12, 16/24. Right-aligned, shrinks to fit, max-width 85% (live: 113×40 for one line).
- **Tutor message**: no bubble, full column width, 16/26 pre-wrap. Numbered steps are plain lines; give wrapped lines a hanging indent (live has none) or use the §5.6 stepper.
- **Widget chip** ("Widget 1 →"): inline-flex, 12/16 `--muted`, padding 2×8, 1px `--border`, r4, live size 81×22, 12px below its message. Hover, or active (its widget is showing): `--brand` text, `--brand-line` border, `--brand-tint` bg. Clicking it opens that widget in the panel, which flashes a `--brand` border for 1s.
- **Composer**: a row with gap 8.
  - Textarea flex-1 (live 459×42): `--field`, 1px `--border`, r4, padding 8×12, 16/24, one row that auto-grows to 6. Placeholder "Ask the Tutor" in `--muted` (live is ink @50%; `--muted` passes AA). Focus: `--brand` border plus a 1px `--brand` ring.
  - **Send**: a primary button stretched to the input height (69×42), 16px text, opacity .5 while the input is empty. Enter sends; Shift+Enter adds a new line.

## 5. Widget panel (the generative UI)
### 5.1 Card anatomy, top to bottom
`section`: 1px `--border`, r8, p16, transparent. Content width is 502px in the workspace.
1. (B) **Eyebrow** = the concept ("PRESENT VALUE").
2. **Title** h3 16/26 500, mb 8. It states what the widget answers ("Annuity present value vs cash option").
3. **Control row** (`<label>`, padding 8 0): tag, name 14/20, and the value in an `<output>` right-aligned at 14/20 500. The slider sits below it with mt 8.
4. **Figure** (padding 8 0): chart, then figcaption (mt 8): legend → summary line → callouts → comparison bars → (optional) guided tasks.

When there are 2+ widgets, a switcher row of chips (§4 chip style) sits above the card. The panel shows one widget at a time, and the newest one opens automatically.

### 5.2 Provenance
- **Tag**: inline, 11/16 500 UPPERCASE .025em, padding 2×6, r4, mr 4. YOUR ASSUMPTION uses `--you-tag` / `--you-tag-ink`. SOURCED uses `--src-tag` / `--src-tag-ink`.
- **Callout**: 14/20, padding 8, r6, mb 8, 4px left border. Assumption: `--you-tint` with `--you-line`. Sourced: `--src-tint` with `--src-line`.
  - Content: tag, label, **value 700**, then the date as 12px `--muted` "(2018-10-23)".
  - Sourced callouts add a new line: "Source: " plus a link (12/16 `--muted`, underlined in the same color, hover `--brand`). Link text: `Publisher, Title, D Month YYYY`.
- A value computed from an assumption carries the YOUR ASSUMPTION tag (as live: "Present value at 3.33%").

### 5.3 Slider
- Live: a native range input, 16px tall, full width, `accent-color: var(--you)` (rest track renders `#EFEFEF`; the fill and 16px thumb are teal).
- Cross-browser version: 6px track, r-full, `--hairline`; `--you` fill; 16px `--you` thumb with a 2px `--bg` ring.
- Upgrades:
  - Min/max labels (12px `--muted`) under the track ends.
  - If a sourced reference exists (e.g. the 30-yr Treasury at 3.33%), draw a 2px `--src` tick on the track with a SOURCED-tag label. Clicking it snaps the slider to that value.

### 5.4 Bar series chart (measured)
- SVG `viewBox="0 0 600 180"`, width 100%, so height = width × 0.3.
- One 20-unit slot per period: bar 18 wide, 2 gap, top padding 10, max height 170, square corners.
- Two layers per slot: the back layer is nominal (`--data`); the front layer is "worth today" (`--you`). `transition: all .15s`.
- Legend (12/16 `--muted`, gap 16, mb 8): an 8×8 square swatch, mr 4, then the label ("Payment in its year", "Worth today at 3.33%").
- Summary line 14/20 ("Sum of payments: $1.537 billion"), mb 8.
- Upgrades:
  - x labels at periods 1/10/20/30, plus 3 `--hairline` gridlines with 12px `--muted` $ labels.
  - Hover or focus on a slot darkens it and shows a tooltip: `--field`, 1px `--border`, r6, padding 6×8, 12/16, e.g. "Year 12 · Payment $X · Worth today $Y".
  - Arrow keys move focus between slots.

### 5.5 Comparison bars (measured, then upgraded)
- SVG `viewBox="0 0 600 44"`: two bars 18 tall with a 4 gap (≈15px tall at 502px), square ends, scaled to the larger value. Colors: `--you` vs `--src`.
- Live has no labels. **Add them** (B labeled-bar pattern): above each bar, a 12/16 row with the name in `--muted` on the left and the value (500) on the right.
- Below the bars, a 12px delta line, e.g. "Annuity is worth $6.3M more than cash at 3.33%".

### 5.6 Borrowed readouts (B)
- **KPI tiles**: 2–3 per row, gap 8. Each uses callout styling (tint plus a 4px line) and holds a tag, a value at 20/28 600 and a 12px `--muted` label.
- **Key/value rows**: 14/20. Label in `--muted` on the left, value in `--ink` 500 on the right, 8px vertical padding, 1px `--hairline` between rows. A tag per row is optional.
- **Stepper** (guided tasks such as "Try these in order"): the tutor writes the steps in chat as now, and the widget footer also shows them as a stepper.
  - Dots: 24px r-full with the number in 12/600. Connector: 1px `--brand-line`. Step text: 14/20.
  - States: todo = `--field` fill, 1px `--brand-line` ring, `--brand` number. Current = `--brand` fill, white number. Done = `--brand` fill with a check.
  - A step completes on its own when the widget reaches the state it asks for (e.g. rate = 0%).
- **Pill** (deltas, session tags): r-full, 12/16 500, padding 2×8.
  - Neutral: `--hairline` bg, `--ink` text.
  - Brand: `--brand-tint` bg, 1px `--brand-line` border, `--brand` text.

### 5.7 Widget kit (what the agent may generate)
| Widget | When | Parts |
|---|---|---|
| Cash-flow bars | payments over time | 5.3 + 5.4 + callouts + 5.5 |
| Comparison | 2–4 values head to head | 5.5 + delta |
| KPI tiles | 2–3 headline numbers | 5.6 |
| Line over time | rates, prices, balances | 2px line in `--you`/`--src`, no fill, 3 gridlines, 6px hover dot |
| Breakdown | assumptions → result | key/value rows |
| Formula card | show the math | 14/20 formula, symbols colored by provenance (teal = `--you`, amber = `--src-tag-ink`), numbers substituted live |
| Guided tasks | exercises | stepper |

Panel states:
- **Empty**: 1px dashed `--border`, r8, p24, 14px `--muted` "Widgets the Tutor builds appear here."
- **Loading**: `--hairline` blocks pulsing every 1.2s, plus a 12px "Building widget…".
- **Error**: 14px `--danger` text plus a secondary "Retry" button.

### 5.8 Chart rules
- Color only by meaning: `--data`, `--you`, `--src`. For 3+ series, use opacity steps (100/70/40) of the same color.
- No gradients, rounded bar tops, chart borders or 3D.
- SVG text is 12px in real CSS pixels.
- Formats: money "$884.1 million" / "$1.537 billion"; rates with 2 decimals (3.33%); ISO dates in captions.
- Every chart gets `role="img"` and an `aria-label` that summarizes it in one sentence.

## 6. Other pages (provisional, to be updated when I see them)
- **Session view** (`/sessions/:id`). Today it is a 672px single column with inline widgets, and that layout is retired. Use the §3 two-column layout in read-only mode: chips select widgets, controls start at their starting values, and a primary "Back to the workspace" button sits where the composer was. There is no "Resume session": Sessions are never resumed (decided in #42).
- **Past Sessions**: header as in §3. A single-column list (max-width 720) of cards: 1px `--border`, r8, p16, gap 12. Each card has:
  - an eyebrow "SESSION 3 · 24 OCT 2026",
  - a title at 16/26 500,
  - a 2-line summary at 14/20 `--muted`,
  - a row of pills (topic, widget count).

  Hover: `--brand-line` border and `--brand-tint` bg.
- **Course Map**: grouped by Stage (four groups in course order, each in default-path order), with no stepper (decided in #42). Each row has a todo/current/passed dot as in §5.6, and Foundation rows carry their Subject pill. Jumps, the prerequisite prompt and "Back to the default path" are unchanged. The workspace status card links here.
- **Landing** (decided in #42): a public page at `/` when signed out; signed in, `/` is the workspace. Every other page and API route still needs the passcode. It shows no Library text and no Learner data, only counts. It works on phones.
  - Sticky blurred header.
  - Hero on `--bg` with a faint 40px grid (`--hairline` @40%). In order: brand pill badge, H1 on two lines (line 2 in `--brand`), 18px `--muted` subtext, primary + secondary buttons (16px, padding 12×24, r8).
  - A workspace screenshot in a browser frame (1px `--border`, r12), with a stats card overlapping it: 3 columns, values 28px 700 `--brand`, 12px labels. Real counts from one function: Topics as "written of planned" (e.g. "90 of 95"), every Case in the outline, Library sources.
  - "How it works": the six Teaching Steps (story, concept, your turn, Check, reveal, principle).
  - One dark section `--navy-deep` (#001647) with `--navy-accent` (#6699FF) eyebrows and numbers, explaining "Every number has a source".
  - Footer `--navy-deeper` (#001034) with `--navy-muted` (#A6A09B) text.

## 7. Motion
- Data: 150ms ease-out (bars, values).
- UI: 200ms (hover colors; widget mount fades opacity 0→1, as measured live).
- Chip to widget: switch, then a 1s `--brand` border flash.
- Header blur appears on scroll over 300ms.
- `prefers-reduced-motion`: no transitions.

## 8. Responsive
- **≥1024px**: the §3 grid.
- **768–1023px**: same grid, gap 24, container padding 16.
- **<768px** (decided in #42): signed-in pages show only a one-line note, "The Study Workspace needs a bigger screen. Open it on a laptop or an iPad." There is no drawer and no phone layout. The landing page and Login stay fully responsive.

## 9. Don'ts
- No inline giant widgets in the conversation, and no centered single column for sessions.
- No shadows. No gradients, except the composer fade and the landing hero fade. No radius above 8 in the app.
- No hue outside navy / teal / amber / stone (plus `--danger` for errors). Never use teal or amber for buttons or links. Never use navy inside charts. Never use `--src` for small text.
- No pure-white page or cards. White is only for inputs and tooltips.
