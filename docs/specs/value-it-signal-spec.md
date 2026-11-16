# Value It — Signal (Prototype B) — Build Specification

| | |
|---|---|
| Status | Design and behaviour spec for the published prototype "Value It Signal" (Prototype B) |
| Date | 14 November 2026 |
| Supersedes | "Value It Ledger" (Prototype A) |
| Reference build | The published artifact "Value It Signal". Where this document and the build disagree, the build is a bug unless the section is marked **Proposed**. |
| Scope | Marketing site (home, how it works, examples, case pages, about, join flow), the five live widgets, the colour language, and the contract between the Tutor and a widget |
| Out of scope | The real Study Workspace, authentication, payments, the Tutor's model and prompts, the checked datasets |

How to read this document: sections 1 to 5 are the system (rules, tokens, components). Section 6 specifies each widget down to formulas, strings and acceptance numbers. Section 7 specifies each page and flow. Sections 8 to 13 cover the Tutor contract, accessibility, motion, responsive behaviour, voice and QA. The appendices hold the full copy deck.

---

## 1. Product in one paragraph

Value It teaches money, markets and valuation through real past events. A learner asks a question, the Tutor (a chatbot) answers and opens a live widget, and the learner moves the numbers until the idea makes sense. The Tutor chooses which widget to open and at which numbers. Tested code draws it. The site sells a waitlist ("early access"), is free during early access, and speaks to one person: a beginner with no finance background (#68). Home asks a Visitor to learn only four product words: AI Tutor, Example, Topic, move the numbers. Published valuations are "one published valuation"; their authors are named only in source lines and the About credit.

### 1.1 Design principles (non-negotiable)

1. **One colour, one meaning.** Five colours and one pattern make the whole visual language (section 2). A colour never means two things, and two colours never mean the same thing.
2. **Colour never works alone.** Every colour signal also carries an icon, a sign, a word or a pattern.
3. **Call first, answer second.** A widget never shows its own answer before the learner has committed to one. Controls unlock after the call. The Tutor explains after the call.
4. **Depth means you can touch it.** Only live widgets are raised (shadow). Everything else is flat with hairlines.
5. **Every step pays.** A scroll step, a tap or a drag must change something meaningful on screen. No step exists only to pace the copy.
6. **Charts are drawn at real size.** A chart is rendered at the pixel width of its box and redrawn on resize. Chart text is never scaled down.
7. **Never advice.** No colour, word or layout implies buy or sell. Price against value is never coloured red or green.
8. **Honest demo.** Anything recorded or simulated says so on screen.

---

## 2. The colour language

### 2.1 The five colours and one pattern

| Colour | Name on site | Means | Use for | Never use for |
|---|---|---|---|---|
| Royal blue `#1F3FAE` | "You" | The learner's own hand and own number; the interface speaking | Buttons, links, slider thumbs, lever knobs, the learner's chat bubble, "Your call" tag, the learner's value (big number, ruler dot, bridge total), the Tutor avatar, focus rings | Data that is not the learner's. Bars, fills, reported figures. |
| Green `#0FAA7B` | "Gain" | Money coming in, value added, a right answer | Cash a business makes, growth earned, money in today's terms, value added to a reference story, correct-answer chips and pills, "Worth more" | Direction alone ("up"). Value above price. Decoration. |
| Red `#BE1E3A` | "Loss" | Cash burned, value taken away, a wrong answer | Losses, cash-burn years, value removed from a reference story, wrong-answer chips and pills, missed reviews, form errors | Direction alone ("down"). Value below price. |
| Orange `#F97316` | "Careful" | Wait: a claim not yet earned, a break-even, a shaky assumption | Claimed or annualised figures (hatched), "about the same" states, ambiguous readings, assumption warnings, pending status | Anything simply negative (that is red) |
| Black `#0B0D12` | "The record" | Prices paid, figures reported, what the learner put in | Market price pin, recorded revenue, old rate, principal, axis baselines that mark a fact | The learner's own estimate (that is blue) |
| Hatched grey (pattern) | "Not real yet" | Advertised, projected, or lost by waiting | The part of a future payment that discounting removes; any quantity that exists only on paper | Recorded facts |

Green also has one deeper step, `#087F5B` ("gain-deep"), used only inside the compounding widget for growth earned on earlier growth. It is the same meaning (gain) at a second level, never a new meaning.

Gold was tried for "money in hand" and removed: in the jackpot and deposit widgets it said the same thing as green. Do not reintroduce a sixth colour.

### 2.2 Rules

1. **Redundancy.** A colour signal is always paired with at least one of: an icon (check, cross, exclamation, approximately-equal, up arrow, down arrow), a sign (+ or −), a word ("Right", "Not quite", "Careful", "Worth more", "Same"), a position (above or below a reference line), or a pattern (hatching).
2. **Direction is not polarity.** A rate going up is not green and a rate going down is not red. Direction is said in words ("up 1 point", "−50 bp").
3. **Price against value is neutral.** The price is black. The learner's value is blue. The gap between them is never red or green, because neither number proves the other wrong.
4. **Adds or removes value is the only meaning of green and red on a lever.** A lever change is green when it raises the value compared with the reference story and red when it lowers it. Pushing "How risky" up paints red.
5. **Text does not wear data colour.** Numbers and labels use ink tokens. Exceptions: text inside a pill or verdict chip (uses the matching `-ink` token on the matching `-tint`), and the learner's own value (blue).
6. **Saturated colour is for small marks.** Large areas use tints (`-tint`, `-line`) or the neutral wash.
7. **At most three signal colours per widget**, plus blue and black.
8. **A status pill is the only place a signal colour appears as a background behind text.**

### 2.3 Colour use by widget

| Widget | Blue | Green | Red | Orange | Black | Hatch |
|---|---|---|---|---|---|---|
| Jackpot | Slider thumb, buttons | Payment worth today, cash, "Worth more", right chip | Wrong chip | "Same", "Break-even found", "Close" chip | — | Part of each payment lost by waiting |
| Four levers | Knobs, your value, ruler dot, bridge total, "You reached the price" | Lever change that adds value, net gain segment, cash-making years, bridge up-steps | Lever change that removes value, net loss segment, cash-burn years, bridge down-steps | "Careful" far-future warning | Price pin, reference notch, price line in bridge | — |
| Compounding | Slider thumb, buttons | Growth; deep green for growth on growth; right chip | Wrong chips | — | What you put in | — |
| Rates | New-rate dot, the gap band (blue-line tint), slider thumbs | Right chips | — | "Up 1%" chip (careful), literal-reading bar and sentence | Old-rate ring, rulers | — |
| WeWork | Buttons, progress dots | Right chip | Net loss bar, wrong chip | Run-rate bar (hatched orange) | Recorded revenue bar | Orange hatch on the claim |

### 2.4 Measured separation and contrast

Colour difference is Euclidean distance in OKLab × 100. Colour-blind figures use the Machado 2009 simulation at full severity. Target: at least 8 under colour blindness, at least 15 under normal vision.

| Pair | Normal | Deuteranopia | Protanopia | Tritanopia |
|---|---|---|---|---|
| Green ↔ Red | 34.1 | 13.0 | 27.7 | 35.4 |
| Green ↔ Orange | 28.1 | 13.8 | 10.6 | 32.2 |
| Red ↔ Orange | 20.8 | 19.9 | 22.7 | 14.0 |
| Blue ↔ Green | 33.9 | 30.8 | 32.3 | 23.5 |
| Blue ↔ Red | 32.5 | 27.7 | 20.1 | 31.4 |
| Blue ↔ Orange | 44.8 | 43.8 | 33.6 | 37.3 |
| Green ↔ Deep green | 12.8 | 12.6 | 13.3 | 12.9 |
| Red ↔ Deep green | 28.9 | **5.7** | 14.4 | 31.1 |

Red and deep green fall below the floor for deuteranopia. They must never be adjacent data marks. In the build they only meet as a wrong-answer chip (with a cross icon) far from the deep-green bars.

Contrast ratios (WCAG 2):

| Use | Pair | Ratio |
|---|---|---|
| Body text | ink-2 `#30353F` on paper | 12.30 |
| Headings | ink `#0B0D12` on paper | 19.43 |
| Muted text | muted `#5F6571` on paper / on wash | 5.86 / 5.46 |
| Faint text (axis ends only) | faint `#8B919B` on paper | 3.17 |
| Blue text | blue on paper / on blue-tint | 8.82 / 7.87 |
| Pill text | gain-ink on gain-tint | 4.81 |
| Pill text | loss-ink on loss-tint | 6.75 |
| Pill text | wait-ink on wait-tint | 5.16 |
| White on fills | on blue / red / deep green / black | 8.82 / 6.11 / 5.00 / 19.43 |
| Ink on green fill | segmented-bar label | 6.53 |
| Green mark on wash | bars | 2.77 (below 3:1: direct labels, tooltip and table view are required) |
| Orange mark on wash | claim bar | 2.61 (below 3:1: always hatched with a 1.5px orange outline and a label) |
| Red mark on wash | bars | 5.70 |

**Dark (ADR 0019).** The same pairs, measured on the Dark tokens of §3.1 by `scripts/check-theme-contrast.mjs`. In Dark the fills are light, so the text on a fill (`--on-blue`) is the dark `#0B0D12`; the table keeps the Light names.

| Pair | Normal | Deuteranopia | Protanopia | Tritanopia |
|---|---|---|---|---|
| Green ↔ Red | 34.4 | 23.7 | 12.6 | 33.5 |
| Green ↔ Orange | 37.6 | 36.9 | 29.1 | 36.0 |
| Red ↔ Orange | 20.9 | 15.2 | 20.9 | 14.8 |
| Blue ↔ Green | 29.6 | 26.5 | 26.7 | 21.2 |
| Blue ↔ Red | 23.1 | 18.8 | 15.9 | 26.8 |
| Blue ↔ Orange | 30.6 | 31.9 | 28.4 | 20.8 |
| Green ↔ Deep green | 26.3 | 26.1 | 27.1 | 25.8 |
| Red ↔ Deep green | 29.1 | **3.4** | 15.7 | 32.3 |

Red and deep green stay below the floor for deuteranopia in Dark too, under the same rule: never adjacent data marks.

| Use | Pair | Ratio |
|---|---|---|
| Body text | ink-2 `#D3D7DF` on paper `#0E1117` | 13.10 |
| Headings | ink `#F2F4F8` on paper | 17.16 |
| Muted text | muted `#9BA2AE` on paper / on wash | 7.35 / 6.78 |
| Faint text (axis ends only) | faint `#7A818D` on paper | 4.82 |
| Blue text | blue on paper / on blue-tint | 7.95 / 6.56 |
| Pill text | gain-ink on gain-tint | 7.66 |
| Pill text | loss-ink on loss-tint | 8.55 |
| Pill text | wait-ink on wait-tint | 11.04 |
| Dark text on fills | on blue / red / deep green / ink | 8.18 / 7.80 / 10.15 / 17.65 |
| Ink on green fill | segmented-bar label | 4.84 |
| Green mark on wash | bars | 3.27 (direct labels, tooltip and table view stay required) |
| Orange mark on wash | claim bar | 10.84 (always hatched with an outline and a label, as in Light) |
| Red mark on wash | bars | 7.00 |

---

## 3. Design tokens

### 3.1 Colour tokens (Light and Dark; ADR 0019)

```css
:root{
  /* canvas and ink: neutrals lean slightly toward the brand blue */
  --paper:#FFFFFF; --wash:#F5F7FB; --wash-2:#E9EDF5; --grid:#E9EDF4;
  --ink:#0B0D12; --ink-2:#30353F; --muted:#5F6571; --faint:#8B919B;
  --rule:#E2E5EA; --line:#C6CAD2;
  /* royal blue: you */
  --blue:#1F3FAE; --blue-hover:#1A3596; --blue-pressed:#152B7A; --on-blue:#FFFFFF;
  --blue-tint:#EEF2FC; --blue-tint-2:#E3E9FA; --blue-line:#A9B8EC;
  /* green: gain */
  --gain:#0FAA7B; --gain-deep:#087F5B; --gain-ink:#0B7A5A; --gain-tint:#E7F7F0; --gain-line:#9EE0C6;
  /* red: loss */
  --loss:#BE1E3A; --loss-ink:#A3152E; --loss-tint:#FCEBEE; --loss-line:#F0A9B5;
  /* orange: careful */
  --wait:#F97316; --wait-ink:#A84B00; --wait-tint:#FFF1E3; --wait-line:#FBC592;
  --overlay:rgba(255,255,255,.9);
  color-scheme:light;
}
```

Each signal colour ships as a family of four or five steps with fixed jobs:

| Step | Job |
|---|---|
| base (`--gain`, `--loss`, `--wait`) | Small marks: bars, segments, dots, chip borders |
| `-ink` | Text on the matching tint |
| `-tint` | Pill and chip background, soft zones |
| `-line` | Pill inner border, soft bands on the ruler |
| `--gain-deep` | Second level of gain (compounding only) |

There are two themes, Light (above) and Dark (below), in one colour language (ADR 0019). A first visit follows the device's light or dark setting. A sun/moon switch in the site nav (and the Menu sheet on a phone) flips the theme and a `theme` cookie remembers the choice. A script at the top of `<head>` sets `data-theme` on `<html>` before the first paint, so a page never flashes the wrong theme. `body` sets an explicit `background: var(--paper)`, and each block sets its own `color-scheme`.

Every signal colour and the hatch is re-stepped and re-validated against the dark surface, never inverted. The hatch is drawn in `--line`, so it takes `--line`'s dark value. On a dark page the fills are light, so the text on a fill, and on a Band, is dark. The §2.4 contrast and colour-blind checks pass in both themes (`scripts/check-theme-contrast.mjs` measures each block).

```css
:root[data-theme="dark"]{
  --paper:#0E1117; --wash:#161A22; --wash-2:#1F2430; --grid:#1B2029;
  --ink:#F2F4F8; --ink-2:#D3D7DF; --muted:#9BA2AE; --faint:#7A818D;
  --rule:#272C37; --line:#3A404D;
  --blue:#8AA4FF; --blue-hover:#9FB5FF; --blue-pressed:#B3C4FF; --on-blue:#0B0D12;
  --blue-tint:#1A2240; --blue-tint-2:#222B4E; --blue-line:#3A4B8C;
  --gain:#0F7A56; --gain-deep:#4FD1A1; --gain-ink:#4CC996; --gain-tint:#10261E; --gain-line:#1E5A44;
  --loss:#FF7A8F; --loss-ink:#FF9AA8; --loss-tint:#2C1418; --loss-line:#6E2A35;
  --wait:#FFC247; --wait-ink:#FFCC66; --wait-tint:#2B1C0E; --wait-line:#6B5221;
  --overlay:rgba(14,17,23,.9);
  color-scheme:dark;
}
```

### 3.2 Typography

| Token | Value |
|---|---|
| `--font-display` | `"Inter Tight","Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif` |
| `--font-body` | `"Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif` |
| Source | Google Fonts: Inter 400/500/600/700, Inter Tight 500/600/700, `display=swap` |

| Role | Font | Size / line-height | Weight | Tracking | Colour |
|---|---|---|---|---|---|
| Body | body | 17px / 1.65 | 400 | 0 | ink-2 |
| Display (home H1) | display | clamp(44px, 5.4vw, 68px) / 1.02 | 600 | −0.035em | ink |
| Display 2 (page H1) | display | clamp(38px, 4.4vw, 56px) / 1.05 | 600 | −0.03em | ink |
| H2 | display | clamp(30px, 3.4vw, 40px) / 1.1 | 600 | −0.02em | ink |
| H3 | display | clamp(20px, 1.8vw, 22px) / 1.25 | 600 | −0.02em | ink |
| Closing headline | display | clamp(36px, 4.6vw, 58px) / 1.04 | 600 | −0.035em | ink, second line blue |
| Lede | body | 20px / 1.6, max-width 34em | 400 | 0 | ink-2 |
| Story text | body | 18px / 1.7 | 400 | 0 | ink-2 |
| Small | body | 14px / 1.5 | 400 | 0 | muted |
| Fine | body | 13px / 1.5 | 400 | 0 | muted |
| Eyebrow | body | 13px / 16px | 600 | 0.04em | blue |
| Uppercase label | body | 12px / 16px, uppercase | 600 | 0.06em | muted (blue for "Live widget") |
| Widget title | display | 20px / 1.3 | 600 | −0.01em | ink |
| Widget sub | body | 15px / 1.55 | 400 | 0 | ink-2 |
| Verdict line | body | 15.5px / 1.55 | 400 | 0 | ink-2, numbers bold ink |
| Big number | display | clamp(32px, 3.6vw, 40px) / 1.05 | 600 | −0.02em | ink (blue when it is the learner's value) |
| Lever-lab number | display | clamp(40px, 5vw, 60px) / 1.05 | 600 | −0.02em | blue |
| Caption | body | 13px / 1.5 | 400 | 0 | muted |
| Source line | body | 12.5px / 1.5 | 400 | 0 | muted |
| Chart text | body | 12px (labels), 14px 600 (values) | — | tabular numerals | muted / ink |

Rules: headings use `text-wrap: balance`. `strong` and `b` are weight 600 in ink. Columns of numbers and all chart text use `font-variant-numeric: tabular-nums`. Large standalone numbers use proportional figures. Running text stays under about 65 characters per line (`.measure` 38em, `.lede` 34em).

The key sentence in a block is marked with `mark.key`: a `--blue-tint-2` highlight on the lower 42% of the line, weight 600, ink.

### 3.3 Space, radius, elevation

| Token | Value | Use |
|---|---|---|
| Page measure | max-width 1200px | `.wrap` |
| Side gutter | `max(clamp(16px, 4vw, 32px), env(safe-area-inset-left/right))` | `.wrap` padding |
| Section padding | `padding-block: clamp(64px, 8vw, 112px)`; tight: `clamp(48px, 6vw, 80px)` | `.section`, `.section.tight` |
| Section head | grid gap 12px, margin-bottom clamp(28px, 4vw, 48px), max-width 44em | `.sec-head` |
| `--r-btn` | 10px | Buttons, chips, inputs |
| `--r-card` | 14px | Flat cards |
| `--r-w` | 18px | Widgets |
| Stage radius | 12px | Chart stage, layer 2, locked boxes |
| Pill radius | 999px | Pills, status, hero question chips |
| `--lift` | `0 8px 24px rgba(11,13,18,.07)` | Hover on link cards, menus, toast, prototype pill |
| `--lift-w` | `0 1px 2px rgba(11,13,18,.05), 0 18px 44px -18px rgba(31,63,174,.28)` | Live widgets only |
| `--nav-h` | 64px | Sticky nav height |
| Hairline | 1px `--rule` | Section rules, card borders |

### 3.4 Motion tokens

| Token | Value |
|---|---|
| `--ease` | `cubic-bezier(.2,.8,.2,1)` |
| Hover and state | 0.15s to 0.2s |
| Bars, positions, widths | 0.42s `--ease` |
| WeWork bar fill | 0.6s `--ease` |
| Closing bars | 0.7s `--ease`, staggered 0.06s |
| `rise` keyframe | opacity 0 → 1, translateY 8px → 0, 0.35s to 0.45s |
| Scripted value runs | ease-in-out quadratic, 900ms (jackpot), 1200ms (compounding) |

### 3.5 Z-index

| Layer | z-index |
|---|---|
| Sticky sub-rails (levers stage on mobile, moves rail) | 5 |
| Nav | 50 |
| Safe-area top band | 70 |
| Prototype pill | 80 |
| Toast | 90 |
| Tooltip | 95 |
| Skip link | 100 |

### 3.6 Breakpoints (max-width)

| Width | What changes |
|---|---|
| 1500px | Prototype pill hides its label |
| 980px | Hero becomes one column. Case page becomes one column and the widget stops being sticky. |
| 960px | Trust section becomes one column |
| 900px | Levers story: stage becomes a full-bleed sticky strip under the nav. Moves rail becomes a sticky strip. Reviews and About grids stack. |
| 860px | Nav links collapse to a Menu sheet. Four moves become 2 × 2. Colour language becomes 2 columns. Path, FAQ and flow grids stack. |
| 760px | Question list drops the mini chart and wraps. Proof, promise, closing and early-access grids stack. |
| 700px | Workspace mock and review notes stack |
| 640px | Case previous/next links go full width |
| 560px | Colour language 1 column. Bridge rows put the label above the bar. Definition lists stack. |
| 520px | Four moves 1 column |
| 480px | Inline join form stacks |
| 420px | Nav button shrinks to 40px |

---

## 4. Global layout and chrome

### 4.1 Page skeleton

Single page application with a hash router (section 7.1). `#app` is re-rendered on each route change as: skip link, sticky nav, `<main id="main" tabindex="-1" data-page="…">`, footer. A fixed prototype pill sits bottom-right (prototype only).

### 4.2 Navigation

- Sticky at `top: env(safe-area-inset-top)`, height 64px, background `--overlay` with `backdrop-filter: saturate(1.4) blur(10px)`. A 1px `--rule` bottom border appears once `scrollY > 4`.
- Left: brand (four-bar glyph in blue + "Value It", display 600 19px). Links: How it works, Examples, About. The current page link is weight 600 with a 2px blue underline 12px below.
- Right, by state:

| State | Nav right side |
|---|---|
| Visitor | "Sign in" text link + primary button "Join the waitlist" |
| Applicant | Orange status pill "Request in review" (wait-tint background, wait dot) linking to `#pending` |
| Member | Primary button "Continue" with a glyph showing moves done + avatar button opening a menu (Course map, Notebook, Account settings, Sign out) |

- At 860px and below the links are replaced by a "Menu" button that toggles a sheet with Home, How it works, Examples, About and, for visitors, Sign in. The button label switches between "Menu" and "Close" and sets `aria-expanded`.

### 4.3 Footer

Brand, links (How it works, Examples, About, and Sign in for visitors) and the line: "Past events only. Nothing here is investment advice. © 2026 Value It." Bottom padding 72px so the prototype pill never covers it.

### 4.4 The four-bar glyph

`viewBox="0 0 20 20"`, four `rect`s at `x = 1 + 5i`, width 3.4, `rx 1`, heights 8, 11, 14, 17, each sitting on `y = 19 − height`, `fill: currentColor`. `glyph(n)` lights the first `n` bars and sets the rest to opacity 0.28.

The glyph is allowed in exactly these places: the brand (nav, footer), the Tutor avatar, the "Live widget" tag, the "The Tutor picked this widget" caption, the four moves (bars lit = move number), the moves rail, the closing bars and the member Continue button. It is not a generic bullet. Section eyebrows carry no glyph.

On first load in a session the brand glyph grows in (each bar scales from 0, 0.5s, staggered 0.06s). The flag is `sessionStorage["vi-grown"]`.

### 4.5 Depth rule

| Surface | Treatment |
|---|---|
| Live widget (`.w`) | White, 1px `--rule` border, radius 18px, `--lift-w` shadow |
| Chart stage inside a widget | `--wash` with a 24px ledger grid: two 1px `--grid` linear gradients, `background-position: -1px -1px` |
| Flat card (`.card`, `.mcard`) | White, 1px `--rule` border, radius 14px, no shadow |
| Link card hover | `--lift` shadow, border `--line` |
| Band section (`.band`) | `--wash` background, full width |

---

## 5. Components

Each component lists anatomy, states and behaviour. Sizes are CSS pixels.

### 5.1 Button (`.btn`)

| Variant | Background | Text | Border | Use |
|---|---|---|---|---|
| `primary` | blue → blue-hover on hover → blue-pressed on active | white | none | One per screen: the main action |
| `secondary` | blue-tint → blue-tint-2 on hover | blue | none | Second action, "next" steps |
| `quiet` | paper → wash on hover | ink | 1px rule | Presets, reset, low-weight actions |
| `[disabled]` | wash-2 (quiet: paper) | faint | — | `cursor: not-allowed` |

Sizes: default 44px high, 0 18px padding, 600 15px; `lg` 52px, 0 22px, 16px; `sm` 36px, 0 12px, 14px. Radius 10px. `white-space: nowrap`. The member "Continue" button is a two-line variant (`.continue`): main line 600 16px, sub line 500 13px at 86% opacity, auto height with min 52px.

### 5.2 Text link (`.tlink`)

Blue, weight 600, no underline, underline on hover with 3px offset. May carry a 1em arrow icon after the label. `.tlink.ink` is the ink-coloured variant (nav "Sign in").

### 5.3 Chip (`.chip`)

Anatomy: min-height 40px, padding 8px 14px, 1px rule border, radius 10px, 600 14px/20px, left aligned.

| State | Background | Border | Text | Extra |
|---|---|---|---|---|
| Rest | paper | rule | ink | |
| Hover | wash | line | ink | |
| Selected (`aria-pressed="true"`, neutral) | blue-tint | blue-line | blue | Presets, filters, toggles |
| Right (`.is-right`) | gain-tint | gain | gain-ink | Check icon inserted at the start |
| Wrong (`.is-wrong`) | loss-tint | loss | loss-ink | Cross icon |
| Careful (`.is-careful`) | wait-tint | wait | wait-ink | Exclamation icon |

Chips are `<button type="button">` with `aria-pressed`. Verdict icons are 15px, margin-right 7px.

### 5.4 Pill (`.pill`)

Inline status marker: min-height 24px, padding 3px 10px 3px 8px, radius 999px, 600 12.5px, optional 13px icon, 5px gap.

| Class | Background | Text | Inner border |
|---|---|---|---|
| `pill-gain` | gain-tint | gain-ink | gain-line |
| `pill-loss` | loss-tint | loss-ink | loss-line |
| `pill-wait` | wait-tint | wait-ink | wait-line |
| `pill-blue` | blue-tint | blue | blue-line |
| `pill-plain` | wash | muted | rule |

Fixed vocabulary:

| Pill | Class | Icon |
|---|---|---|
| Right | gain | check |
| Not quite | loss | cross |
| Careful | wait | exclamation |
| Close | wait | exclamation |
| Worth more | gain | check |
| Same | wait | approximately-equal |
| Break-even found | wait | approximately-equal |
| You reached the price | blue | check |
| +$N (lever effect) | gain | up arrow |
| −$N (lever effect) | loss | down arrow |
| In progress | wait | none |
| Paused | wait | exclamation |

### 5.5 Icons

Inline SVG, `viewBox="0 0 16 16"`, `fill="none"`, `stroke="currentColor"`, stroke-width 2, round caps and joins, `aria-hidden="true"`.

| Name | Path data |
|---|---|
| check | `M3 8.5l3.2 3.2L13 5` |
| cross | `M4 4l8 8M12 4l-8 8` |
| alert | `M8 3v6.2M8 12.6v.2` |
| approx | `M2.5 6.2c1.7-1.7 3.5-1.7 5.5 0s3.8 1.7 5.5 0M2.5 10.6c1.7-1.7 3.5-1.7 5.5 0s3.8 1.7 5.5 0` |
| up | `M8 13V3.5M4 7.5l4-4 4 4` |
| down | `M8 3v9.5M4 8.5l4 4 4-4` |
| lock | `rect x=3.5 y=7 w=9 h=6.5 rx=1.5` + `M5.5 7V5.2a2.5 2.5 0 015 0V7` |
| arrow | `M3 8h10M9 4l4 4-4 4` |
| back | `M13 8H3M7 4L3 8l4 4` |

### 5.6 Widget shell (`.w`)

Order of parts, top to bottom. Every widget uses this order and omits parts it does not need.

1. **Head** (`.w-head`, full mode only): left "Live widget" (blue uppercase label with glyph), right a date or category (muted uppercase label).
2. **Title** (`.w-title`, full mode only) and optional **sub** (`.w-sub`). The sub states the facts and never the answer.
3. **Your call** (5.7).
4. **Stage** (5.8): the picture.
5. **Controls** (5.9), locked until the call.
6. **Reading**: the numbers and a verdict line that changes with the picture.
7. **Go deeper** (5.10): the second layer, locked until the call.
8. **Foot** (`.w-foot`): 1px rule above, then the colour key, the source line and the table view.

Grid gap 16px, padding clamp(16px, 2vw, 24px). **Compact mode** (used inside the hero conversation) drops the head, title, sub and table view.

Widget API (JavaScript):

```js
const w = VI.WIDGETS[kind](hostElement, { compact?: boolean, onCall?: (option) => void });
// returns { card: HTMLElement, destroy(): void }
```

`onCall` fires once, the first time the learner commits (first chip tap, or first lever change in the levers widget). Its argument is the chosen option `{ id, label, verdict, fb }`. Hosts use it to unlock the Tutor's answer and the ending.

### 5.7 Your call (`.call`)

A `fieldset` with a `legend` and a row of chips, then a feedback paragraph (`aria-live="polite"`).

- Legend: a "YOUR CALL" tag (blue-tint background, blue 700 11px uppercase, radius 6px) followed by the question in 600 15px ink.
- Single-select calls clear the previous verdict before marking the new chip. Multi-select calls (rates) keep every tapped chip marked.
- On tap: the chip takes its verdict state and icon, and the feedback paragraph becomes `[pill] feedback sentence`. The pill word is "Right", "Not quite" or "Careful" unless the option overrides it (the jackpot's "About the same" option uses "Close").
- `reset()` clears chips and feedback.

### 5.8 Stage (`.stage`)

Wash background with the ledger grid, radius 12px, padding 14px 14px 10px. Holds an SVG drawn at the real width of its inner plot box.

Chart rules:

- A `ResizeObserver` on the plot box calls `draw(width)` whenever the rounded width changes. `viewBox` is `0 0 width height`.
- Bars: width `clamp(3, slot × 0.62, 14)` px, top corners rounded 3px, square at the baseline, drawn as a path.
- Baseline and top gridline: 1px solid `--line`. No dashed gridlines.
- Axis text 12px muted. Value text 14px weight 600 ink.
- Each column has a transparent hit rectangle the full height of the plot carrying `data-tip`.

### 5.9 Controls

**Range slider (`input.range`)**: native `input type="range"`, 28px tall hit area. Track 4px, radius 2px: blue up to the thumb, `--line` after it (WebKit uses a `--p` custom property set from the value; Firefox uses `::-moz-range-progress`). Thumb: 24px circle, white, 2px blue border, soft shadow, with a 5px `--blue-tint-2` halo on keyboard focus. Label on the left (600 14px ink), current value on the right in an `output` (600 16px ink, tabular).

**Lockable group (`.lockable`)**: wraps controls. `data-locked="true"` sets opacity 0.5 and the inputs and buttons inside are `disabled`. A lock note (lock icon + sentence, 13.5px muted) explains what unlocks it and is removed on unlock.

**Presets**: a wrapping row of `btn quiet sm` buttons that animate the slider to a fixed value.

### 5.10 Go deeper (`.layer2`)

| State | Look | Content |
|---|---|---|
| Locked | wash background, muted text | "GO DEEPER" tag + lock icon + "Opens after your call." (levers: "Opens after you move a lever.") |
| Open | blue-tint background, radius 12px, padding 14px 16px | "GO DEEPER" tag (paper background, blue text) + a bold title, then the layer's body (grid, 12px gap) |

Every widget has exactly one second layer, and it always opens as a result of the learner's own action.

### 5.11 Colour key (`.wkey`)

A wrapping list of swatch + label pairs (13px muted), labelled for assistive tech "How to read the colours". Swatches are 12px squares, radius 3px.

| Swatch | Look |
|---|---|
| `sw-gain`, `sw-deep`, `sw-loss`, `sw-wait`, `sw-ink` | Solid fill |
| `sw-hatch` | 135° stripes of `--line`, 1.5px on a 4.5px pitch, 1px `--line` outline |
| `sw-claim` | 135° stripes of `--wait` on `--wait-tint`, 1px `--wait` outline |
| `sw-blue` | White circle with a 3px blue ring (a knob) |
| `sw-ref` | A 14px, 2px ink-2 line (the reference notch) |
| `sw-pin` | A 2px × 14px ink line (the price pin) |

### 5.12 Table view (`details.wtable`)

Summary "Show the numbers" (blue 600 13px, with + / −). Opens a scroll box (max-height 240px, 1px rule border, radius 10px, focusable) holding a real `<table>` with a sticky header row. The first column is left aligned, the rest right aligned, 13px tabular. Full mode only.

### 5.13 Tooltip (`.tip`)

One shared element, `position: fixed`, ink background, white 500 12.5px text, radius 8px, padding 7px 10px, max-width 240px, `white-space: pre-line`, `pointer-events: none`. Shown on `pointermove` and `pointerdown` over any `[data-tip]` inside a registered stage, placed 14px right of and above the pointer, flipped at viewport edges, hidden on `pointerleave`, on scroll and on route change. Text is set with `textContent`. Every tooltip value is also available in the table view or a readout.

### 5.14 Meter (`.meter`)

Rows that compare amounts on one scale. Each row: a top line (label with optional pill on the left, value 600 16px on the right) and a 12px track (radius 6px, `--wash-2`). The fill is green. An optional hatched ghost segment continues from the end of the fill. Widths transition over 0.42s, except while dragging (the card gets a `dragging` class that turns transitions off).

### 5.15 Segmented bar (`.seg-bar`)

One whole split into parts. Height 28px, parts separated by 2px gaps, each part radius 4px with `flex: <share × 1000> 1 0`. The amount is printed inside a part at the leading edge (600 12.5px) only when the part is wide enough: `share × barWidthPx ≥ labelLength × 8 + 18`. Otherwise the label is dropped (the value stays in the `title` attribute and the verdict sentence).

| Part class | Fill | Label colour |
|---|---|---|
| `ink` | ink | white |
| `gain` | gain | ink |
| `deep` | gain-deep | white |
| `loss` | loss | white |

### 5.16 Chat bubbles

| Bubble | Look |
|---|---|
| Learner (`.bubble.you`) | Blue background, white text, radius 14px with a 4px bottom-right corner, right aligned, max-width 34em |
| Tutor (`.bubble.tutor`) | White, 1px rule border, radius 14px with a 4px bottom-left corner, max-width 40em |
| Tutor waiting (`.bubble.tutor.wait`) | Wash background, dashed border, muted text, lock icon |
| Speaker label (`.who`) | Uppercase 12px muted label above a bubble ("You ask", "Tutor") |
| Typing indicator (`.typing`) | Three 7px dots blinking in sequence inside a tutor-shaped bubble; `role="img"`, label "The Tutor is typing" |
| Skeleton (`.skel`) | 220px block with a moving blue-tint shimmer and the text "Opening a widget…" |

### 5.17 Other components

| Component | Spec |
|---|---|
| Stamp (`.stamp`) | 24px high, padding 0 8px, radius 6px, wash background with a 1px rule inner border, ink 700 12px uppercase. Holds a date or category. |
| Facts grid (`.facts`) | Auto-fit columns of at least 150px inside a 1px rule border, radius 12px. Each cell: label (13px muted) over value (display 600 20px). Cells are separated by 1px lines drawn with `box-shadow` so an empty trailing cell stays white. A learner's own value uses blue. |
| Dateline (`.dateline`) | Blue, weight 700, uppercase, 0.82em, 0.04em tracking. Opens a story paragraph. |
| Locked box (`.locked`) | Dashed 1px `--line` border, wash background, radius 14px, padding 18px 20px. |
| Progress steps (`.prog`) | Pill-shaped list items with an 18px numbered dot. `now`: blue-tint and blue. `done`: gain-tint and gain-ink with a check in the dot. Otherwise wash and faint. |
| FAQ (`.faq`) | `details` rows with a 1px rule beneath. Summary 600 17px with a blue "+" that rotates 45° when open. Opening one closes the others. |
| Input (`.input`) | 48px high, 1px `--line` border, radius 10px, 16px text. Focus: 2px blue outline. Error text uses `loss-ink`. |
| Status list (`.status`) | Rows with a 22px state dot: done (green with check), now (orange ring with an orange centre and a 4px wait-tint halo), upcoming (empty ring). |
| Toast (`.toast`) | Ink background, white 600 14px, radius 10px, bottom centre, `role="status"`, auto-hides after 2.6s. |
| Prototype pill (`.proto`) | Fixed bottom-right. A `select` (visitor, applicant, member) and a "Review notes" link. Prototype only. |

---

## 6. Widgets

### 6.1 Shared behaviour

All five widgets share the five beats in principle 3 and section 5.6. Shared rules:

- A widget is fully keyboard operable. Every pointer interaction has a native control behind it.
- Scripted runs (the slider moving by itself after the call) are cancelled the moment the learner touches the control.
- Each widget returns `destroy()`, which cancels running animations and disconnects observers. Hosts call it on route change or when replacing the widget.
- Number formats:

| Formatter | Rule | Examples |
|---|---|---|
| `inrCr(c)` | c in ₹ crore, in words with `en-IN` grouping; under 1 crore in lakh | `₹25 crore`, `₹11.29 crore`, `₹37.63 lakh` |
| `usdM(m)` | m in $ millions. `m ≥ 999.95` → `$` + (m/1000) to 3 decimals + `B`. Else `$` + 1 decimal + `M`. | `$1.537B`, `$694.0M` |
| `inr(x)` | `₹` + rounded, `en-IN` grouping | `₹17,449` |
| `share(v)` | `v ≤ 0` → `$0`. Else `$` + rounded. | `$35` |
| `d$(v)` | Signed whole dollars with a true minus sign | `+$28`, `−$17` |
| `trim(x, d)` | Up to `d` decimals, trailing zeros removed | `1`, `0.04`, `12.5` |

---

### 6.2 Four levers (Amazon, February 2000)

**Lesson.** A value is a story told in four numbers. Each lever adds to or takes from the value. A price is what buyers paid. Neither proves the other wrong.

#### 6.2.1 Model (the valuation engine on Damodaran's sourced inputs)

The widget has no maths of its own (decision #18, option C). It runs the course's tested valuation engine (`src/finance/dcf-engine.ts`) through `applyLevers` (`src/finance/valuation-case.ts`) on Case `amazon-dcf-2000`: Damodaran's own inputs for Amazon in February 2000, each with a source, as the val-dcf Topic holds them (revenue $1,117M, an operating loss of $410M, $500M of losses carried, $3 of sales for each $1 invested, costs of capital from 12.84% down to 9.61%, debt $349M, options $2,892M, cash $26M, 340.79M shares, price $84 on 3 Feb 2000). The engine gives **$35.04** a share against his published $35.08: the paper prints its costs of capital to two decimals. The Signal widget, the Topic Workbench and the Tutor all show the same numbers. The module is `src/finance/signal/levers.ts`.

How the four levers move the Case's story (Appendix B.2 of the valuation spec):

| Lever | What `applyLevers` does |
|---|---|
| `rev` | Scales every year's growth rate by one factor so revenue in year 10 is the lever's figure, keeping the Case's shape |
| `margin` | Becomes the target of the margin path (closing half the gap each year from −36.71%) and the margin after year 10 |
| `s2c` | Replaces the Case's sales to capital |
| `wacc` | Moves year 1's cost of capital to the lever and scales the years between, keeping year 10 (9.61%) |

A lever at its reference value leaves the Case's own figure alone, so his story is exactly the Case ($35.04; a flat $39bn on the revenue lever would give $35.03).

Inputs (the four levers):

| Key | Name | Label | Min | Max | Step | Display |
|---|---|---|---|---|---|---|
| `rev` | How big it gets | Revenue in year 10 | 5 | 80 | 1 | `$39bn` |
| `margin` | What it keeps | Operating margin once mature | 0 | 20 | 0.5 | `10%` or `12.5%` |
| `s2c` | What growth costs | Sales for each $1 invested | 1 | 6 | 0.25 | `$3.00` |
| `wacc` | How risky | Cost of capital while it grows | 8.04 | 17.84 | 0.2 | `12.84%` |

Read-outs from the engine's result, with `SH` = 340.79M shares: `flows[t] = pv of year t`, `flows[t] / SH`, `yrs = sumPv / SH`, `after = pvTerminal / SH`, `firm = sumPv + pvTerminal`, `perShare = valuePerShare`, `tvShare = pvTerminal / firm` (null when firm ≤ 0), `owes = (debt + options − cash) / SH = 9.43`. The bridge adds up: `yrs + after − owes = perShare`.

Presets:

| Key | Chip label | rev | margin | s2c | wacc | Value |
|---|---|---|---|---|---|---|
| `damodaran` (the reference, "his story") | The published Story | 39 | 10 | 3 | 12.84 | 35.04 → `$35` |
| `grocer` | A grocer’s margins | 39 | 5 | 3 | 12.84 | 1.30 → `$1` |
| `price` | One story worth $84 | 59 | 12 | 3 | 11.84 | 83.69 → `$84` |

The "$84 story" uses $59bn of revenue: on the engine $60bn gives 85.24 → `$85`.

**Effects.** What each lever adds to or takes from the reference story, in dollars a share. Computed as a Shapley value so the four parts always add up to the whole difference, whatever order the levers were moved in:

```text
for each subset S of the four levers:  val[S] = perShare(levers in S at current values, others at reference)
effect_i = Σ over S not containing i of  |S|! × (3 − |S|)! / 4!  × ( val[S ∪ {i}] − val[S] )
effect_i = 0 exactly when lever i is at its reference value
Σ effect_i = perShare(current) − perShare(reference)
```

Sixteen model runs per update. No throttling is needed.

**Band.** What one lever can do on its own, the other three at reference: `atMin`, `atMax`, `lo = min`, `hi = max`, and `reach` = the first setting (stepping up from min) at which the value is at least 84, or null.

| Lever | Value at min | Value at max | Reaches $84 alone |
|---|---|---|---|
| How big it gets | −3.19 | 81.09 | No |
| What it keeps | −34.02 | 102.30 | Yes, at 17.5% |
| What growth costs | −4.55 | 44.94 | No |
| How risky | 53.37 (safest) | 21.71 (riskiest) | No |

#### 6.2.2 Lever lab (the shared stage)

Used by the levers widget and by the home scroll story.

**Top line.** Left: label "This Story is worth" over the value in blue (`share(v)`). Right: a sub-line.

| Condition | Sub-line |
|---|---|
| `round(v) ≥ 84` | Worth the $84 price, on this story. |
| `v ≤ 0` | Less than it owes, on this story. |
| otherwise | `{round(v / 84 × 100)}% of the $84 price.` |

**Value ruler.** One horizontal scale from $0 to $168 (twice the price, so the price sits dead centre). `pos(v) = clamp(v / 168, 0, 1) × 100%`.

| Element | Spec |
|---|---|
| Track | 10px high, radius 5px, `--wash-2` |
| Price pin | 2px ink line at 50%, extending 6px above and below the track. Label above: "$84" (display 600 17px) over "Price paid, 3 Feb 2000" (12px muted). |
| Reference notch | 2px ink-2 line at 55% opacity at `pos(35.04)`. Label below: "Published $35". |
| Your dot | 20px blue circle with a 3px white border and shadow at `pos(v)`. When `v > 168` it pins to the right end and shows a "›". |
| Net segment (free mode) | From the notch to the dot. Green when `v ≥ reference`, red when below. |
| Band (band mode) | Soft red (`--loss-line`) from `pos(lo)` to the notch and soft green (`--gain-line`) from the notch to `pos(hi)` for one lever. |
| End labels | "$0" left, "$168" right, 12px faint |

The ruler container reserves 40px above the track and 30px below (32px and 24px in the mobile sticky strip).

**Lever.** A vertical track per lever, four in a row, sharing a subgrid so labels line up.

| Part | Spec |
|---|---|
| Value | Display 600 19px ink over the unit label (12px muted) |
| Track | Height `--lv-h` (default 200px), white, 1px rule inner border, radius 8px |
| Base fill | `--wash-2` from the bottom to `min(handle, reference)` |
| Delta band | Between reference and handle. Green if the lever's effect ≥ +0.5, red if ≤ −0.5. When the handle is below the reference the band is drawn at 34% opacity (the "missing" part). |
| Reference notch | 2px ink-2 line across the track, overhanging 4px each side |
| Knob | 30px white circle, 2px blue border, 14px blue centre, shadow. Visible only on enabled levers. Hover adds a 6px `--blue-tint-2` halo. |
| Name | 600 14px ink, a `<label>` for the hidden range input |
| Effect pill | `+$N` green with up arrow, `−$N` red with down arrow, or an invisible placeholder that keeps the row height when the effect is under 50 cents |

Geometry: `n = (value − min) / (max − min)`; position from the bottom `P(n) = 0.08 + 0.84 × n` of track height. CSS variables per lever: `--h` handle, `--r` reference, `--b = min(h, r)`, `--d = |h − r|`.

Pointer to value: `n = clamp(((trackBottom − y) / trackHeight − 0.08) / 0.84, 0, 1)`, `raw = min + n × (max − min)`, snapped to `round((raw − min) / step) × step + min` at 2 decimals.

Interaction:

| Input | Behaviour |
|---|---|
| Mouse | Press anywhere on the track and drag. Pointer capture on the track. |
| Touch | Drag only from the knob (`touch-action: none` on the knob, `pan-y` on the track, so the page still scrolls over a lever). A tap on the track (moved ≤ 8px) sets the value. |
| Keyboard | A visually hidden native range input per lever. Arrow keys move one step. Focus draws a 2px blue outline around the track. |
| Screen reader | `aria-valuetext`: e.g. "Operating margin 12 percent, adds 17 dollars a share". A polite live region announces "This Story is worth $84 a share." on commit (pointer up, tap, `change`). |

While dragging, the lab gets a `dragging` class that removes position transitions so marks track the pointer exactly.

API: `set(values, silent)`, `setLive(bool)`, `focus(index | 'all')` (dims and disables the other levers), `band(index | null)`, `vals`, `res` (last model result).

#### 6.2.3 The widget card

Parts: head ("Live widget", "Feb 2000"), title "Four levers. What is Amazon worth?", lever lab, presets, reading line, Go deeper, foot.

Reading line:

| Condition | Text |
|---|---|
| `|v − 35.04| < 0.5` | This is one published valuation: **$35** a share, against a price of **$84**. Drag any lever to test it. |
| `round(v) ≥ 84` | [pill blue ✓ You reached the price] To reach the $84 price, Amazon needs `{rev}` of sales in year 10 and a margin of `{margin}`. Would you have believed that in 2000? |
| otherwise | This Story is worth **$N more / less** than the published one. The pills under each lever show where that came from. |

The call: this widget has no right answer, so the call is the first lever change or preset tap. That opens Go deeper and fires `onCall`.

Go deeper, "Where the value comes from":

1. **Year strip.** Caption "Cash each year, in today’s money. Red years burn it, green years make it." Ten bars around a zero line (SVG 300 × 56, zero at y = 28). Bar height `max(1, |flow| / max(0.2, max|flow|) × 26)`, width 56% of its slot, green when ≥ 0 and red when below. Each bar has a `<title>` "Year t: ±$N a share". Axis labels "Year 1" and "Year 10".
2. **Bridge.** A horizontal waterfall in dollars a share:

| Row | From → to | Colour | Label |
|---|---|---|---|
| Cash from years 1 to 10 | 0 → yrs | Green if positive, red if negative | `d$(yrs)` |
| Everything after year 10 | yrs → yrs + after | Green | `d$(after)` |
| What it owes others | previous → previous − owes | Red | `d$(−owes)` |
| This Story, a share (total, bold, ruled above) | 0 → total | Blue | `share(total)` |

Scale: `lo = min(0, total, every segment low)`, `hi = max(84 × 1.1, total, every segment high)`, `X(v) = (v − lo) / (hi − lo) × 100%`. A 1px `--line` marks zero and a 2px ink line marks the $84 price through every row. Minimum bar width 0.6%. Row grid: label 11.5em, bar flexible, value 4.2em. At 560px and below the label and value sit above the bar.

3. Caption "The thin black line is the $84 price."
4. Note on the far future:

| Condition | Text |
|---|---|
| `tvShare > 1` | [pill orange ! Careful] **N%** of this business’s value arrives after year 10. The first ten years burn cash, so the far future carries the whole number. |
| `0 < tvShare ≤ 1` | **N%** of this business’s value arrives after year 10. |
| `tvShare` null | (nothing) |

Foot key: blue knob "You: drag these", green "Adds value to the published Story", red "Takes value away", notch "The published Story", pin "Price paid". Source: "Damodaran’s valuation of Amazon, Feb 2000, on the course’s tested valuation engine. It reproduces his $35.08 within 2%."

#### 6.2.4 Acceptance values

| Story | Value | Years 1–10 | After year 10 | Owes | After-year-10 share | Effects (big / keeps / costs / risky) |
|---|---|---|---|---|---|---|
Every value is the engine's output on Case `amazon-dcf-2000` (decision #18). The tests in `src/finance/signal/levers.test.ts` pin each row to the cent and check that the effects add up to the whole change.

| Story | Value | Years 1–10 | After year 10 | Owes | After-year-10 share | Effects (big / keeps / costs / risky) |
|---|---|---|---|---|---|---|
| His story | 35.04 | −5.19 | +49.66 | −9.43 | 111.7% | 0 / 0 / 0 / 0 |
| Grocer | 1.30 | −14.10 | +24.83 | −9.43 | 231.4% | 0 / −33.75 / 0 / 0 |
| One story worth $84 (59 / 12 / 3 / 11.84) | 83.69 | −2.93 | +96.06 | −9.43 | 103.2% | +26.69 / +17.30 / 0 / +4.66 |
| That story with risk at 17.44% | 54.30 | −3.98 | +67.71 | −9.43 | 106.2% | +22.21 / +14.63 / 0 / −17.57 |
| All four at maximum value | 322.34 | +54.12 | +277.65 | −9.43 | 83.7% | +101.99 / +119.96 / +16.69 / +48.66 |
| All four at minimum value | −17.37 → `$0` | −7.93 | 0.00 | −9.43 | — | +7.04 / −36.06 / −20.82 / −2.57 |

His story, cash by year in dollars a share: −2.42, −2.36, −2.02, −1.37, −0.65, −0.23, +0.23, +0.72, +1.23, +1.70.

---

### 6.3 Jackpot (money later is worth less)

**Lesson.** The same total paid later is worth less than that sum today.

**The Moment (#116).** Kerala's Thiruvonam Bumper lottery, BR-99, drawn on 9 October 2024: a first prize of ₹25 crore on ticket TG 434222, sold in Wayanad for ₹500. Kerala pays a prize at once, into the winner's bank account, after the agent's 10% commission and tax (about ₹12.88 crore in hand). The 30 yearly payments are a what-if: the same ₹25 crore paid the way US lotteries pay their advertised jackpots. Case Data as of 9 Oct 2024; Sources: [The Hindu, 9 Oct 2024](https://www.thehindu.com/news/national/kerala/keralas-25-crore-thiruvonam-bumper-lottery-announced-jackpot-goes-to-ticket-sold-in-wayanad/article68735952.ece), [Mathrubhumi, 9 Oct 2024](https://english.mathrubhumi.com/news/kerala/kerala-thiruvonam-bumper-lottery-result-first-prize-winner-47fe5126), [The New Indian Express, 11 Oct 2024](https://www.newindianexpress.com/states/karnataka/2024/Oct/11/mandya-bike-mechanic-wins-rs-25-crore-thiruvonam-bumper-lottery); the American annuity (one payment now and 29 yearly, each 5% bigger): [Mega Millions](https://www.megamillions.com/difference-between-cash-value-and-annuity). It replaced the 2018 Mega Millions prize on the site; the course's own Case `mega-millions-2018` is unchanged.

#### 6.3.1 Model

| Name | Value |
|---|---|
| Prize, and the plain sum of the 30 payments | ₹25 crore |
| Cash, paid at once | ₹25 crore |
| Payment growth | 5% a year, first payment at once (t = 0), 2024 to 2053 |
| First payment `p0` | `25 / Σ_{t=0..29} 1.05^t` = ₹0.3763 crore (₹37.63 lakh) |
| Payment `t` | `p0 × 1.05^t` (last, t = 29: ₹1.5488 crore) |
| Worth today at rate `r` | `pay_t / (1 + r)^t` |

Money is in ₹ crore and shown with `inrCr` (§6.1).

#### 6.3.2 Parts

- Head: "Live widget", "Oct 2024". Title: "Is ₹25 crore over 30 years worth ₹25 crore?" Sub: "Kerala paid its 2024 Thiruvonam Bumper prize of **₹25 crore** at once. Paid the American way, the same **₹25 crore** would come as 30 yearly payments."
- Your call: "At an ordinary interest rate, which is worth more?"

| Option | Verdict | Pill | Feedback |
|---|---|---|---|
| The 30 payments | wrong | Not quite | Only if money earned nothing. At an ordinary 5% a year the 30 payments are worth about ₹11.29 crore today, less than half the ₹25 crore paid at once. |
| The cash | right | Right | At an ordinary 5% a year the 30 payments are worth about ₹11.29 crore today. That is ₹13.71 crore less than the cash. |
| About the same | careful | Close | They match only at 0%, when money earns nothing. At an ordinary 5%, the cash is worth more. |

- Chart: 30 columns. Plot height 150px (116px compact), top margin 22px, 22px below for labels. Scale: ₹2 crore = full plot height. Per column: a hatched ghost bar at the payment as paid (pattern 5 × 5 rotated 45°, a 2px `--line` stripe on paper, 1px `--line` outline) and a solid green bar at its worth today. Top gridline labelled "₹2 crore a year". X labels "2024" (left), "2038" (centre), "2053" (right). Tooltip per column: `{year}` / `Paid: ₹X` / `Worth today: ₹Y`.
- Controls (locked): "Interest rate" slider 0 to 10, step 0.05, start 0, output `0.00%`. Presets 0%, 5%, 10%. Lock note: "Make your call to unlock the rate."
- Meter, scale 0 to ₹25 crore:

| Row | Fill | Ghost | Value |
|---|---|---|---|
| 30 payments, worth today | `sum / 25` green | `(25 − sum) / 25` hatched | `inrCr(sum)` |
| Cash today | `25 / 25` green | none | `₹25 crore` |

- Verdict line, Go deeper, foot. Key: green "Worth in today’s money", hatch "Lost by waiting", orange "About the same". Source: "Source: The Hindu, 9 Oct 2024. The 30 payments are a what-if: they rise 5% a year and the first is paid at once." Table (full mode): Year, Paid, Worth today at 5%.

#### 6.3.3 States

| State | Trigger | Screen |
|---|---|---|
| Idle | Load | Rate 0. All bars solid. Controls locked. No pills. Verdict: "Added up as paid, the 30 payments come to **₹25 crore**, the same as the prize paid at once." Go deeper locked: "Opens after your call." |
| Called | Any chip tapped | Chip takes its verdict and feedback. First time only: controls unlock, lock note removed, Go deeper opens titled "Find the rate where the two are worth the same.", `onCall(option)` fires. Every time: the rate runs to 5% over 900ms. |
| Exploring | Slider or preset | With `d = sum − 25` and `same = |d| < 0.1` (₹10 lakh): pills and verdict from the table below. Go deeper: "You are **₹X** away. Try a lower rate." (when `d < 0`) or "Try a higher rate." (when `d > 0`). |
| Found | `same` while the learner is moving the slider or a preset by hand | Go deeper: [pill orange ≈ Break-even found] "At **0%** a year the two are worth the same. At any rate above it, the cash is worth more." Stays for the session. |

The scripted run starts at the same-valued 0% and must not count as finding it. Only a hand-set rate does.

| Condition | Payments row pill | Cash row pill | Verdict |
|---|---|---|---|
| `same` | ≈ Same (orange) | ≈ Same (orange) | At `{rate}`%, the payments and the cash are worth about the same today. |
| `d > 0` | ✓ Worth more (green) | — | At `{rate}`%, the payments are worth **₹X more** than the cash. |
| `d < 0` | — | ✓ Worth more (green) | At `{rate}`%, the payments are worth **₹X less** than the cash. |

#### 6.3.4 Acceptance values

| Rate | Payments worth today |
|---|---|
| 0% | ₹25 crore (same) |
| 0.05% | ₹24.78 crore |
| 1% | ₹20.96 crore |
| 2% | ₹17.73 crore |
| 3% | ₹15.13 crore |
| 4% | ₹13.01 crore |
| 5% | ₹11.29 crore (every payment is worth ₹37.63 lakh) |
| 7.5% | ₹8.19 crore |
| 10% | ₹6.23 crore (the 2053 payment is worth ₹9.76 lakh) |

True break-even: 0%. With a 0.05 step, "same" is reachable at 0% only.

---

### 6.4 Compounding (₹1,000 at 10% a year)

**Lesson.** Each year grows on the new total, not on the start.

#### 6.4.1 Model

`TOT(t) = 1000 × 1.1^t` for year `t` from 1 to 30. `added(t) = TOT(t − 1) × 0.1`. `simple(t) = min(100 × t, TOT(t) − 1000)` (earned on the ₹1,000). `onGrowth(t) = TOT(t) − 1000 − simple(t)` (earned on earlier growth). Chart maximum `TOT(30) = 17,449.40`.

#### 6.4.2 Parts

- Head: "Live widget", "Everyday money". Title: "What ₹1,000 grows to at 10% a year".
- Your call: "Does it grow by the same amount every year?"

| Option | Verdict | Feedback |
|---|---|---|
| Yes, ₹100 every year | wrong | Year one adds ₹100. Year two adds ₹110, because it earns 10% on the new total of ₹1,100. |
| No, more each year | right | Year one adds ₹100, year two ₹110, year three ₹121. Each year’s gain is earned on a bigger total. |
| No, less each year | wrong | It adds more each year: ₹100, then ₹110, then ₹121. Each gain is earned on a bigger total. |

- Chart: 30 columns, same geometry as the jackpot. Per column: a black base of height `1000 / MAX` (what you put in), then the growth. Unsplit: one green bar with a rounded top. Split: a green block for `simple(t)` and a deep-green bar with a rounded top for `onGrowth(t)`. 1px gaps between stacked parts. Columns after the chosen year are at 16% opacity. Doubling marks above columns 8, 15, 22 and 30: "2×", "4×", "8×", "16×" (11.5px, 600, ink-2). X labels "Year 1", "Year 15", "Year 30". Tooltip: `Year t` / `Balance: ₹X` / `Added this year: ₹Y`.
- Controls (locked): "Years it grows" slider 1 to 30, step 1, start 3, output "3 years" ("1 year" when 1). Presets 3, 10, 30 years. Lock note: "Make your call to unlock the years."
- Reading: big number `inr(TOT(n))`. A segmented bar of the whole: black ₹1,000 + green growth, or when split black + green `simple` + deep-green `onGrowth`. Then the sentence: "after `n` years. Growth added **₹X**, and year `n` alone added **₹Y**." When split, add: "Of that growth, **₹A** was earned on your ₹1,000 and **₹B** on earlier growth."
- Go deeper: title "Split the growth in two." Body: "Some of the growth is earned on the ₹1,000 you put in. The rest is earned on growth you already had." A toggle chip "Split the growth" that becomes "Growth is split" with `aria-pressed="true"`. Toggling redraws the chart, the segmented bar, the sentence and the key.
- Foot key, unsplit: black "What you put in", green "Growth". Split: black "What you put in", green "Earned on your ₹1,000", deep green "Earned on earlier growth". Source: "Worked example from the Topic. No outside figures." Table (full mode): Year, Balance, Added that year.

#### 6.4.3 States

| State | Trigger | Screen |
|---|---|---|
| Idle | Load | 3 years lit. Controls locked. Go deeper locked. |
| Called | Any chip | Verdict and feedback. First time: unlock, open Go deeper, fire `onCall`. Every time: years run to 30 over 1200ms. |
| Exploring | Slider, presets, split toggle | Everything redraws from `n` and `split`. |

#### 6.4.4 Acceptance values

| Years | Balance | Growth | Added that year | On your ₹1,000 | On earlier growth |
|---|---|---|---|---|---|
| 1 | ₹1,100 | ₹100 | ₹100 | ₹100 | ₹0 |
| 3 | ₹1,331 | ₹331 | ₹121 | ₹300 | ₹31 |
| 8 | ₹2,144 | ₹1,144 | ₹195 | ₹800 | ₹344 |
| 10 | ₹2,594 | ₹1,594 | ₹236 | ₹1,000 | ₹594 |
| 15 | ₹4,177 | ₹3,177 | ₹380 | ₹1,500 | ₹1,677 |
| 22 | ₹8,140 | ₹7,140 | ₹740 | ₹2,200 | ₹4,940 |
| 30 | ₹17,449 | ₹16,449 | ₹1,586 | ₹3,000 | ₹13,449 |

---

### 6.5 Rates (one move, three sizes)

**Lesson.** Name the base of every change. One move is a number of points, a number of basis points and a percent of the old rate, and "up 1%" could mean two very different things.

#### 6.5.1 Model

Old rate `o` (default 4, slider 1 to 8 step 0.25, inside Go deeper). New rate `n` (default 5, slider 2 to 7 step 0.05).

```text
pts     = round(n − o, 2)            percentage points
bp      = round(pts × 100)           basis points
rel     = pts / o × 100              percent of the old rate
literal = o × |pts| / 100            points, if “up {pts}%” is read as a percent of the old rate
target  = o ± literal                the rate that literal reading would give
```

#### 6.5.2 Parts

- The Moment (#116): on 6 June 2025 the RBI's Monetary Policy Committee cut the policy repo rate by 50 basis points, from 6.00% to 5.50%, with immediate effect. Case Data as of 6 Jun 2025; Source: [RBI, Monetary Policy Statement 2025-26, Resolution of the MPC, 6 Jun 2025](https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=60604). The widget opens on old 6, new 5.5.
- Head: "Live widget", "Jun 2025". Title: "One move, three sizes". Sub: "On 6 June 2025 the RBI cut its repo rate from **6%** to **5.5%**."
- Your call (multi-select): "Which of these describe the move correctly? Tap each one you believe."

| Option | Verdict | Feedback |
|---|---|---|
| Down 0.5% | careful | 0.5% of 6% is only 0.03 points, which would make the new rate 5.97%. Writers often say “down 0.5%” when they mean half a point. |
| Down 0.5 percentage points | right | 6 minus 5.5 is half a point. The RBI called the same cut 50 basis points. |
| Down about 8% | right | Half a point is a twelfth of the old 6%, so the rate itself fell by about 8.33%. |

- Chart, 262px tall, width `W`. `X(v) = 14 + (v − 1) / 7 × (W − 28)`.

| Element | Spec |
|---|---|
| Rate line | At y = 58 from 1% to 8%, 1.5px `--line`. Ticks and labels at each whole percent. |
| Gap | A 12px-high rounded band between `X(o)` and `X(n)` in `--blue-line` |
| Old rate | Ring r = 6, paper fill, 2px ink stroke. Label "Old 4.00%" at y − 14, 12.5px ink-2. |
| New rate | Dot r = 8, blue, 2px paper ring. Label "New 5.00%" at y − 32, 13.5px weight 600 ink. |
| Label anchor | `start` when x < 60, `end` when x > W − 60, else `middle` |
| Three rulers | At y = 112, 152, 192. Left label 12px muted, right value 14px 600 ink. A 2px ink line across the gap at y + 11 with ticks from the old rate outward (2px at both ends, 1px inside). No ticks when the count would exceed 60. |
| Ruler 1 | "In percentage points", tick every 1 point, value "1 point" / "1.5 points" / "no move" |
| Ruler 2 | "In basis points, 10 to a tick", tick every 0.1 point, value "100 bp" |
| Ruler 3 | "As a percent of the old rate, 5% to a tick", tick every `0.05 × o` points, value "25%" |
| Trap row | At y = 232 in `wait-ink`: “Up `{pts}`%”, read literally, value "`{literal}` pt". An orange bar 9px high from `X(o)`, width `max(2.5, |X(target) − X(o)|)`. |

- Controls (locked): "New rate" slider. Lock note: "Tap an answer to unlock the rate."
- Readouts (facts grid, three cells, ink only):

| Cell | Up 1 point | Down 0.5 points | No move |
|---|---|---|---|
| How far it moved | up 1 point | down 0.5 points | No move |
| How traders say it | +100 bp | −50 bp | 0 bp |
| Next to the old rate | up 25% | down 12.5% | 0% |

- Trap sentence (hidden when there is no move): [pill orange ! Careful] Read literally, “up 1%” is 1% of the old 4%: a move of only **0.04 points**, to 4.04%.
- Go deeper: title "Change where the rate starts." Body: "The same 1-point move is a bigger percent of a low rate and a smaller percent of a high one." plus the "Old rate" slider.
- Foot key: blue knob "The move you set", black "The old rate", orange "“Down 0.5%”, read literally". Source: "Source: Reserve Bank of India, Monetary Policy Statement, 6 June 2025."

The first chip tap unlocks the slider, opens Go deeper and fires `onCall`. Later taps only mark chips. Direction is never coloured.

#### 6.5.3 Acceptance values

| Old | New | Points | Basis points | Percent of old | Literal reading |
|---|---|---|---|---|---|
| 6 | 5.5 | −0.5 | −50 | 8.33% (down) | 0.03 pt, to 5.97% (the RBI's cut, the default) |
| 6 | 4.5 | −1.5 | −150 | 25% (down) | 0.09 pt, to 5.91% |
| 4 | 5 | 1 | +100 | 25% | 0.04 pt, to 4.04% |
| 4 | 4.5 | 0.5 | +50 | 12.5% | 0.02 pt, to 4.02% |
| 4 | 3.5 | −0.5 | −50 | 12.5% (down) | 0.02 pt, to 3.98% |
| 2 | 3 | 1 | +100 | 50% | 0.02 pt, to 2.02% |
| 8 | 7 | −1 | −100 | 12.5% (down) | 0.08 pt, to 7.92% |
| 4 | 4 | 0 | 0 | 0% | none |

---

### 6.6 WeWork (a pace is not revenue)

**Lesson.** A run rate is a pace. Revenue is what was recorded.

#### 6.6.1 Data

| Row | Amount | Scale position | Fill | Note under the bar | Appears at beat |
|---|---|---|---|---|---|
| Run rate claimed | $3.0bn | 3.0 / 3.2 | Hatched orange with a 1.5px orange outline | A full year, if the latest month repeated 12 times | 2 |
| Revenue recorded | $1.54bn | 1.54 / 3.2 | Black | Six months, January to June 2019 | 3 |
| Net loss | −$0.905bn | 0.905 / 3.2 | Red | The same six months | 4 |

Until a row appears it is at 30% opacity with "?" as its value and a zero-width bar. Each bar names its own time base, because a full-year pace and a six-month total share the axis.

#### 6.6.2 Beats

One beat is shown at a time. The beat card swaps content with the `rise` animation.

| # | Speaker | Text |
|---|---|---|
| 1 | Narrator | 14 August 2019. WeWork publishes its plan to sell shares to the public. |
| 2 | WeWork | Over seven years to $1 billion run-rate, then six months from $2 billion to $3 billion! |
| 3 | Asha · weighs the share sale | Nice. But the revenue actually recorded this half-year is $1.54 billion. |
| 4 | Asha | And the net loss? About $905 million. |
| 5 | Narrator | Asha must decide what a run rate tells her about earned revenue. |

Controls: "Next beat" (secondary, small) which becomes a disabled "End of the story" on beat 5, five progress dots (blue when reached), and "Start again" (quiet, small) which returns to beat 1 and resets the call.

#### 6.6.3 Call and second layer

The call appears only on beat 5: "Is $3 billion of run-rate revenue $3 billion earned?"

| Option | Verdict | Feedback |
|---|---|---|
| Yes, it is revenue | wrong | Recorded revenue for the half-year was $1.54bn. The $3bn is the latest month multiplied by 12. |
| No, it is a pace | right | It is the latest month’s revenue times 12. That is a pace, and it is only as good as the guess that the pace repeats. |

First tap opens Go deeper, "Put the loss next to the revenue.": "For every **$1** of revenue it recorded in those six months, WeWork lost about **59 cents**." Two bars on one scale: "Revenue recorded" $1.00 in black at 100%, "Net loss on it" −$0.59 in red at 58.8% (905 ÷ 1,540).

Foot key: hatched orange "Claimed, not yet earned", black "Recorded", red "Loss". Source: "Source: WeWork S-1, 14 Aug 2019."

---

## 7. Pages and flows

### 7.1 Routes and state

| Hash | Page | Document title |
|---|---|---|
| `#home` (default, and any unknown hash) | Home | Value It |
| `#how-it-works` | How it works | How it works · Value It |
| `#examples` | Examples | Examples · Value It |
| `#case-{slug}` | Case page | `{question}` · Value It |
| `#about` | About | About · Value It |
| `#join` | Join the waitlist | Join the waitlist · Value It |
| `#pending` | Request received | Request received · Value It |
| `#signin` | Sign in | Sign in · Value It |
| `#welcome` | Welcome | Welcome · Value It |
| `#study` | Study Workspace stub | Study Workspace · Value It |
| `#review` | Review notes (prototype only) | Review notes · Value It |

Case slugs: `kerala-bumper-2024`, `amazon-2000`, `wework-2019`, `rbi-repo-cut-2025`, `compounding-1000`.

On every route change: run clean-ups (destroy widgets, remove listeners, disconnect observers), hide the tooltip, re-render, jump to the top without smooth scrolling, and focus the page's `h1` (`.page-h1`, `tabindex="-1"`).

Viewer state, kept in `localStorage["vi-proto-state"]` inside try/catch:

| State | Becomes | Effect |
|---|---|---|
| `visitor` | Default | Join CTAs everywhere |
| `applicant` | After joining | Status pill in the nav, "Play a real case while you wait" |
| `member` | After approval or sign-in | "Continue" CTAs, account menu |

`#pending` redirects to `#welcome` for members and `#join` for visitors.

**Production (#33).** Two of the three states: `visitor` (signed out) and `member` (signed in). Someone who joins waits on Clerk's Waitlist, which gives them no session until the owner lets them in, so they see the visitor state; there is no applicant state, status pill or pending page. Sign in is `/sign-in`, Join is `/join` (Clerk's Waitlist), and an invitation lands on `/sign-up`; the old `/login` answers 308 to `/sign-in`.

CTA by state:

| State | Primary CTA | Note under it |
|---|---|---|
| Visitor | Join the waitlist → `#join` | Free. We let people in by hand and email you when you’re in. |
| Applicant | Play a real case while you wait → `#examples` | Your request is in. We’ll email you when you’re in. |
| Member | Continue (sub-line: current Topic) → `#study` | Step 1 of 15 · Story |

### 7.2 Home

Section order: hero, four moves, levers story, questions, trust, FAQ, early access. The colour language is on How it works only (#74). "Tested code" appears once on Home, in Trust.

#### 7.2.1 Hero

Two columns (5fr / 6fr, gap clamp(32px, 5vw, 72px)), one column at 980px and below. It speaks to one person, a beginner with no finance background (spec #68).

Left column, a grid with 20px gaps:

| Element | Content |
|---|---|
| Eyebrow | Finance for beginners |
| H1 (display, two lines) | What is it / really worth? The lines are joined by a space, so a screen reader reads "What is it really worth?" |
| Lede | Three headline numbers a beginner has seen, then the promise: A **₹25 crore jackpot**. A **$3bn “run rate”**. **Amazon at $84 a share**. You have seen numbers like these. Here you work out what each one is really worth. An AI Tutor explains every money word, and you move the numbers yourself. No sums. The jackpot's figure is the jackpot Example's chip. |
| CTA row | Visitors: primary "Try the jackpot" → the jackpot Example (`/examples/kerala-bumper-2024`), then "Join the waitlist" → `/join` (the Waitlist) as the second button. Members: Continue, then "Course map" → `/course` |
| Fine print | The CTA note for the state |
| Facts (blue dot bullets) | {Topics} Topics · {low} to {high} minutes each, from the course's own facts |

On a phone (640px and below) the Tutor demo sits right under the H1, before the lede: at 390px the H1, "for beginners" and the demo's question chips show without scrolling. Home still loads no OpenUI code.

Right column, **the Tutor demo** (`.demo`): a wash panel, 1px rule border, radius 22px.

| Part | Spec |
|---|---|
| Header | 34px blue avatar with the white glyph. "The Tutor" (display 600 15px). Sub-line: "A recorded conversation from the course. The widget is live." |
| Question row | Label "Pick a question" + five pill chips. The selected chip is solid blue with white text. |
| Thread | Grid, 10px gaps, 16px padding, min-height 420px, `aria-live="polite"` |

The five questions:

| Chip label | The learner's bubble | Case |
|---|---|---|
| A ₹25 crore jackpot | Is ₹25 crore over 30 years worth ₹25 crore? | kerala-bumper-2024 |
| Amazon at $84 | How can a loss-making Amazon be worth $84 a share? | amazon-2000 |
| The RBI’s June cut | The RBI cut from 6% to 5.5%. How big a cut is that? | rbi-repo-cut-2025 |
| 10% a year | Does 10% a year grow by the same amount every year? | compounding-1000 |
| WeWork’s $3bn | WeWork claimed a $3bn run rate. Did it earn that? | wework-2019 |

Script when a different chip is tapped (all delays are 0 with reduced motion):

| Time | Event |
|---|---|
| 0ms | Cancel pending timers. Destroy the current widget. Mark the chip. Clear the thread. Add the learner's bubble. |
| 200ms | Add the typing indicator |
| 950ms | Remove typing. Add the Tutor bubble with the case's `lead`. Add the skeleton "Opening a widget…". |
| 1600ms | Remove the skeleton. Add the caption "The AI Tutor picked this Example. Checked numbers draw it." (with glyph). Mount the widget in compact mode with the staggered `build` animation. |
| On the learner's call | Append a Tutor bubble: `follow.right` if the verdict was right, otherwise `follow.other` |

On first load the jackpot conversation is already complete (learner's bubble, Tutor bubble, caption, widget) with no animation, so the first frame is the finished state.

The demo must always say it is recorded. In production, either wire it to the real Tutor or keep the label.

#### 7.2.2 Four moves

Eyebrow "How a Topic works". H2 "One real event. Four moves. Ten to fifteen minutes." Four columns separated by 1px rules (2 × 2 at 860px, one column at 520px). Each: the glyph with `n` bars lit (26px, blue), "MOVE n", the name (display 600 19px) and one line.

| Move | Name | Line |
|---|---|---|
| 1 | Meet the moment | A true event, and what people knew that day. |
| 2 | Learn the lingo | The AI Tutor explains each money word in plain English, when you need it. |
| 3 | Try it | Tap an answer or move a lever. No sums. |
| 4 | Value it | Put your own number on it, then see what really happened. |

Link: "See a Topic step by step →" to `#how-it-works`.

#### 7.2.3 Levers scroll story

Two columns (5fr / 7fr). Left: six text steps. Right: a sticky lever lab in a widget shell, `top: nav height + 20px`, with a centred hint line under it.

Scroll spy: the active step is the last one whose top edge is above 55% of the viewport height (78% when the viewport is narrower than 900px). Checked on scroll and resize inside `requestAnimationFrame`.

| Step | Left column | Stage |
|---|---|---|
| 0 | Eyebrow "A worked example". H2 "Every value comes down to four levers." "February 2000. Amazon sells books online and loses money. Buyers pay **$84** a share. One published valuation tells a Story about its future, and that Story says **$35**." "Four numbers make the difference." Then the source line, the only place Home names Damodaran: "Source: [Aswath Damodaran, “Valuing Amazon.com”, February 2000](https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/HighGrow.pdf)". | The published Story. All four levers shown, none draggable. Net segment hidden (value equals reference). Hint: "Scroll to meet the four levers." |
| 1 to 4 | "LEVER n OF 4", the lever's name as H2, its story sentence, and its power sentence in a block with a 2px blue-line left border | Reset to the published Story. That lever's band on the ruler. Only that lever is enabled and undimmed. Dragging it moves the dot inside the band. Hint: "Lever n of 4. Drag it. The shaded band is as far as it can move the value on its own." |
| 5 | "YOUR TURN: JUDGE IT". H2 "What did the $84 price need?" "**Drag any lever** until the value reaches $84. Green adds value to the published Story. Red takes value away. *Would you have believed it in 2000?*" Preset chips. Win line. Link "Open the full Example, with what happened next →". The step ends on judging the Price's Story, never on inventing one (#74). | All four levers live. Net segment shown. The learner's last story is restored. Hint: "Drag any lever. Arrow keys work too." |

Lever story sentences, in plain words and round numbers (#74):

| Lever | Story sentence |
|---|---|
| How big it gets | Sales in year 10: **$39bn**, against $1.1bn today. |
| What it keeps | Once grown, it **keeps 10¢ of each $1** of sales. Today it loses 37¢. |
| What growth costs | Each **$1 it invests** to grow brings **$3** of new sales. |
| How risky | While it grows, **investors want 13% a year** for the risk. |

Power sentences are generated from the model, never hard-coded:

| Case | Template | Current output |
|---|---|---|
| Value rises with the lever, cannot reach $84 | On its own it can move the value anywhere from **{lo}** to **{hi}** a share. It cannot reach the $84 price by itself. | "…from **$0** to **$81**…" (How big), "…from **$0** to **$45**…" (What growth costs) |
| Value rises with the lever, reaches $84 | …from **{lo}** to **{hi}** a share. It is the only lever that reaches the $84 price by itself, at {setting}. ("It reaches…" if more than one lever does.) | "…from **$0** to **$102**… at 17.5%." (What it keeps) |
| Value falls as the lever rises | This lever runs backwards. More risk means less value: from **{atMin}** at the safest setting down to **{atMax}** at the riskiest. | "…from **$53**… down to **$22**…" (How risky) |

Step rules:

- Leaving step 5 saves the learner's four values. Entering any step below 5 resets the stage to the published Story. Returning to step 5 restores the saved values.
- Tapping a preset always switches the stage to step 5 first, whatever the scroll position, then applies the preset.
- The win line appears only in step 5 when `round(value) ≥ 84`: [pill blue ✓ You reached the price] "To reach the $84 price, Amazon needs `{rev}` of sales in year 10 and a margin of `{margin}`. Would you have believed that in 2000?"
- Step heights: 56vh, first step 48vh aligned to the top, last step 70vh. Content is vertically centred.

At 900px and below the stage becomes a full-bleed sticky strip directly under the nav with no shadow or border: lever height 84px, value 30px, lever value 14px, unit labels hidden, hint hidden, step height 52vh.

#### 7.2.4 Colour language (How it works only)

This block is drawn on How it works (7.3 item 4), not on Home (#74). Wash band. Eyebrow "Reading a widget". H2 "Every colour means one thing." Body: "Learn five colours and one pattern once and you can read any widget in the course at a glance. Each colour also carries a sign or a word, so it reads the same if you can’t tell red from green."

A 3 × 2 grid of cells divided by hairlines (2 columns at 860px, 1 at 560px). Each cell: a 44px wash tile holding a small example, then the colour name with its meaning beside it in muted text, then one line.

| Tile | Name | Meaning | Line |
|---|---|---|---|
| A blue knob | Royal blue | You | Whatever you can drag or tap, and your own number. |
| A green bar | Green | Gain | Money coming in, value added, a right answer. |
| A red bar hanging down | Red | Loss | Cash burned, value taken away, a wrong answer. |
| A hatched orange bar | Orange | Careful | A claim not yet earned, a break-even, a shaky assumption. |
| A black pin | Black | The record | Prices paid, figures reported, what you put in. |
| A hatched grey bar | Hatched | Not real yet | Advertised, projected, or lost by waiting. |

The same block appears on How it works with the body: "The same five colours and one pattern mean the same thing in every widget. Each colour also carries a sign or a word, so no meaning rests on colour alone."

#### 7.2.5 Questions

Eyebrow "Five Examples, open now". H2 "Start with a question you already have." Body: "No finance background needed. **If you can read a headline, you can start.**"

A ruled list (`.qlist`). Each row is one link with four columns: stamp and category (84px), the question (display 600 clamp(19px, 2vw, 24px)) with its hook beneath in 15px muted, a 132 × 36 mini picture of the widget in the colour language, and "Play →". Hover: wash background and the arrow moves 3px. At 760px and below the mini picture is hidden and the stamp row sits above the question.

Mini pictures (static SVG, 132 × 36):

| Case | Picture |
|---|---|
| Jackpot | 15 rising hatched ghost bars with equal green bars in front |
| Levers | Four neutral bars with green and red delta bands around a notch |
| WeWork | A long hatched-orange bar, a shorter black bar, a shorter red bar |
| Rates | A line, a black ring, a blue dot, a blue-line band between them, a tiny orange sliver |
| Compounding | 15 bars with a thin black base and a growing green top |

Below the list: "**110 Topics wait inside.** 15 teach valuation in order, 72 go wider across 9 subjects, and 23 read real arguments." and "See the whole path →".

#### 7.2.6 Trust

Left: eyebrow "Why you can trust it", H2 "Real events. Checked numbers. No tips.", link "How we source our facts →" to `#about`. Right: three columns, each topped with a 2px black rule:

| Heading | Body |
|---|---|
| Past events only. | Every Topic is a real event with a known outcome. **You see only what people knew that day**, until the reveal. |
| Every figure has a source. | Each number in a widget is stored with its public source and **the date it was checked**. The jackpot's says "Source: The Hindu, 9 Oct 2024." |
| Code draws the charts. | The Tutor picks the widget; tested code draws it. **The AI never invents a chart.** |

#### 7.2.7 FAQ

Left: eyebrow "Questions", H2 "Before you ask.", link "More questions →" to `#about`. Right: four questions from the FAQ list (Appendix B, numbers 1, 2, 4 and 5).

#### 7.2.8 Early access (closing)

Headline: "Money makes sense," / "one bar at a time." (second line blue). Right: four bars at 40%, 60%, 80% and 100% of 200px (44px wide, blue-tint-2 with a 4px blue cap) that grow from 30% once when 40% of the block is in view.

Visitors get an inline form: an email input (`autocomplete="email"`, placeholder `you@example.com`, with a visually hidden label "Your email address") and a primary button "Request early access". Fine print: "Free during early access. We only email you about your access." Then three steps joined by short rules: 1 Request received, 2 Reviewed by hand, 3 Email: you’re in.

| Input | Result |
|---|---|
| Not an email (fails `^[^\s@]+@[^\s@]+\.[^\s@]+$`) | Error line in `loss-ink`: "Enter an email address like name@example.com." Focus returns to the input. |
| Valid email | State becomes `applicant`, the email is kept in memory, route to `#pending` |

Applicants and members see the CTA and note for their state instead of the form.

**Production (#33).** Clerk owns sign-up, so the site has no email form of its own. A visitor's closing block shows the primary CTA "Join the waitlist", the CTA note and the three steps. The CTA, like every visitor Join, opens `/join` (Clerk's Waitlist page). The email check, the confirmation and the "you're in" email are Clerk's. The table above is the prototype's behaviour.

### 7.3 How it works

1. Header: eyebrow "How it works", H1 "How a Topic works", lede "Every Topic is **one real event, taught in four moves**, in 10–15 minutes. You never type a number: you tap, drag and explain in your own words."
2. **Moves with a rail.** Left rail, sticky: "Running example: Amazon, Feb 2000", four bars that fill as moves are reached (bar `i` at `(i + 1) × 25%` height, solid blue when reached), a list of four buttons that scroll to each move, and a note "Move n of 4" (at move 4: "**That’s one Topic.** The four bars make the logo."). Right: four move articles (scroll spy at 50% / 60%).

| Move | Interactive body |
|---|---|
| 01 Meet the moment | The Amazon moment's paragraph, its three facts and the source line "Source: Aswath Damodaran, “Valuing Amazon.com”, February 2000" (linked), the only place How it works names him |
| 02 Learn the lingo | Chips "price" and "value". Shows the term (display 600 30px), a bold definition and three rows: Say it like a pro, For example, In the story (Appendix D). |
| 03 Try it | A call: "One published valuation says $35 a share. Is that a price or a value?" "A value" is right ("It is what one Story says a share is worth. The price is what buyers paid: $84."). "A price" is wrong ("A price is what buyers pay on the day. $35 is what one published valuation says a share is worth: a value."). |
| 04 Value it | Slider "Your value for one share", 0 to 150, start 50. Button "Reveal what really happened" shows four facts: Your value (blue), Published value $35.08, Price, 3 Feb 2000 $84.00, Low, late 2000 $14.88, and the key line. |

Each move ends with "Inside this move:" and step chips (The moment / The idea / Your turn, Wrap up and its Check / Reveal, Principle). Closing line: "*15 short steps in all. Your place is saved after each one.* Moves 2 and 3 repeat for each idea in a Topic, usually four."

3. **The workspace**: an annotated mock of the Study Workspace. Chat on the left (a Tutor bubble, a learner bubble, a fake input "Ask the Tutor anything"), a widget on the right (a rates mini picture with the RBI rates Example's move, "6% → 5.5%: **½ point · 50 bp · about 8%**", "Saved to your Notebook"), a 15-segment step bar and four numbered black callouts with this legend: Ask anything, any time. / The Tutor picks the widget; tested code draws it. / The step bar shows where you are in the Topic’s 15 short steps. / What you find lands in your Notebook.
4. **Colour language** (7.2.4): eyebrow "Reading a widget", H2 "Every colour means one thing.", the How it works body. Home no longer draws it.
5. **Reviews**: H2 "It brings back what you missed." with a labelled illustration: a green "Check passed" dot, three blue review rings spaced further and further apart, and a red dashed arc for "missed: back sooner". The drawing carries the word "Illustration".
6. **The path**: 15 core Topics (numbered, with minutes), 9 subjects with counts, 3 stages with counts (Appendix C).
7. Closing CTA: "Start with Topic 1: What is a business worth?"

### 7.4 Examples

Header: H1 "Real events. Move the numbers." Lede: "Five Examples from the course, playable here. **Each is a question, your call, a live widget and the Tutor’s answer**, with what really happened kept for last."

Filter chips with counts: All 5, Everyday money 2, The news 1, Real companies 2. Filtering hides rows with the `hidden` attribute. Then the question list (7.2.5). Then "110 Topics wait inside." with nine locked Topics (category, title, a "Members" badge with a lock icon) and the CTA.

### 7.5 Case page

Top: "← All Examples", stamp and category, the question as H1, and a four-step progress row.

Body: a two-column grid (5fr / 6fr), with rows `auto auto auto 1fr` so the left column stays compact beside a tall widget.

| Left column, in order | Content |
|---|---|
| The moment | Label (an H2, so the widget's H3 title never skips a level), the moment's paragraph with dateline, facts grid |
| Question | "You ask" + the learner's bubble (`ask`), then "Tutor" + the lead bubble (`lead`) |
| The Tutor's answer | A waiting bubble: lock icon + "The Tutor explains after your call." Replaced by `answer` after the call. |
| The ending | A locked box, then a ready box, then the reveal |

The right column holds the full widget, spanning all rows. It is sticky (`top: nav + 20px`) only while its height is less than the viewport height minus 100px (re-checked on resize and whenever the widget's size changes). At 980px and below everything is one column in this order: story, question, widget, answer, ending.

Flow:

| Moment | Progress row | Tutor's answer | Ending |
|---|---|---|---|
| Load | 1 done · 2 now · 3 · 4 | Waiting | Locked: "Make your call first. This step shows what happened next." (or "the rule the Topic leaves you with") + a quiet "Skip to the ending" |
| Call made (`onCall`) | 1, 2 done · 3 now | Shows `answer` with a rise animation | Ready: "Your call is in. Ready for what happened next?" + "Reveal {label}" |
| Reveal or Skip | All done | Unchanged | The reveal text and "Sources: …" line. Focus moves to it. |

Foot: "From the Topic" + the Topic name + a CTA by state (visitor "Join to take the full Topic", applicant "Check your request", member "Open this Topic"). Then previous and next case links, wrapping around the list.

### 7.6 About

Header with an "At a glance" card (Topics 110, Subjects 9, Stages that read real arguments 3, Each Topic 10–15 min, Price Free in early access). Then: four promises, the sourcing flow (Real event → Checked dataset → Tested widget → The Tutor explains) with the non-affiliation line, what you can learn (subject and stage chips), the founder's note (placeholder, see 14), early access (Join / Cost / What you need), the full FAQ and the closing CTA. Copy is in Appendix B.

### 7.7 Join, pending, sign in, welcome, study

| Page | Content | Behaviour |
|---|---|---|
| Join | H1 "Join early access". Lede "Value It is free while the course grows. **We let people in by hand, a few at a time.**" Optional chips "What brings you here?" (Understanding money and the news / Investing my own money / Running or working at a company). "Continue with Google". Divider "or". Email field "Email me a link" + "Send me a sign-up link". Fine print. | Google → applicant → `#pending`. Email validates as in 7.2.8. |
| Pending | H1 "You’re on the list." Lede "We review every request by hand. **We’ll email {address or "you"} when you’re in.**" Status list: Request received (done, today's date), Reviewed by hand (now, orange "In progress" pill), Email: you’re in (upcoming, "One button: Continue"). "Play a real case while you wait". | Prototype-only link "simulate your approval" → member → `#welcome`. No promise of a number of days until one is known. |
| Sign in | H1 "Welcome back". Google button, email field, "Send me a sign-in link". | Applicants go to `#pending`. Otherwise → member → `#study`. |
| Welcome | H1 "Welcome to Value It". Card: "Topic 1 · about 10 minutes", the Topic name, "Start Topic 1", "See the course map". | |
| Study | A stub: workspace header with the 15-step bar, a note, and the Tutor-offline error state: [pill orange ! Paused] "The Tutor is offline for a moment." "Your progress is saved. Try again in a few seconds." + "Retry" (toast: "Reconnected. Your place is saved."). | |

**Production (#76).** `/join`, `/sign-in` and `/sign-up` draw Clerk's cards (Waitlist, SignIn, SignUp) under the page's own Band and its one h1; Clerk's own header is hidden. The cards take the site's tokens, font and flat controls from `src/auth/clerk-appearance.ts` (code, never the Clerk Dashboard), so Dark covers them too. One name for the list: "the waitlist". `/join`: H1 "Join the waitlist", lede "Leave your email below. What happens next:", then "It’s free." · "We review each request by hand." · "We email you when you’re in." · "You can study on a laptop or a phone." `/sign-up` with no invitation (no `__clerk_ticket`): H1 "Create your account", "You need an invitation to create an account. Join the waitlist and we’ll email you one when you’re in." and a "Join the waitlist" link to `/join`, with no card. On the test bed (Clerk off) a plain stand-in takes the card's place, so `e2e/sign-in.spec.ts` reads this copy; it never reaches a build. The table above is the prototype's behaviour.

### 7.8 Review notes (prototype only)

`#review`, reached from the prototype pill. Three groups (Colour, Widgets, Selling) of before / now notes, then seven open questions. Not part of the production site.

---

## 8. The Tutor and the widget (Proposed)

The prototype scripts the Tutor. Production has a live model. This section proposes the contract that keeps the site's promise: "The Tutor picks the widget and its numbers; tested code draws it."

### 8.1 What the Tutor may and may not do

| The Tutor may | The Tutor may not |
|---|---|
| Choose a widget type from the registry | Emit HTML, SVG, CSS or colours |
| Choose a dataset by id and a starting state within the widget's allowed ranges | Supply raw figures that are not in a checked dataset |
| Write the lead, the follow-up and the answer in words | Decide what is right or wrong: verdicts live in the dataset |
| React to widget events | Skip the call or reveal the ending before it |

### 8.2 Widget call

```json
{
  "widget": "jackpot",
  "dataset": "mega-millions-2018",
  "mode": "compact",
  "state": { "rate": 0 },
  "illustration": false
}
```

| Field | Type | Rule |
|---|---|---|
| `widget` | `"jackpot" \| "levers" \| "compound" \| "rates" \| "wework"` and future types | Unknown type: render nothing and let the Tutor answer in text |
| `dataset` | string | Must exist, be marked checked, and carry a source and a checked date |
| `mode` | `"full" \| "compact"` | Compact inside a conversation, full on a case page |
| `state` | object | Validated against the widget's schema and clamped to its ranges. Invalid keys are dropped. |
| `illustration` | boolean | `true` when any number is made up. The widget then shows the word "Illustration". |

State schemas:

| Widget | State keys | Ranges |
|---|---|---|
| jackpot | `rate` | 0 to 10, step 0.05 |
| levers | `rev`, `margin`, `s2c`, `wacc` | As in 6.2.1 |
| compound | `years`, `split` | 1 to 30; boolean |
| rates | `old`, `new` | 1 to 8 step 0.25; 2 to 7 step 0.05 |
| wework | `beat` | 1 to 5 |

### 8.3 Events from a widget to the Tutor

| Event | Payload | Typical Tutor response |
|---|---|---|
| `call` | `{ optionId, verdict }` | The follow-up line, then the full answer |
| `state` (debounced, on commit only) | The widget's state | Optional comment on what the learner found |
| `layer2_open` | `{}` | Nothing, or one nudge |
| `milestone` | e.g. `{ id: "break_even_found" }`, `{ id: "reached_price", rev, margin }` | A sentence that names what was found |
| `reveal` | `{}` | The principle |

### 8.4 Colour is assigned by code

A widget maps data roles to the colour language itself. The Tutor never names a colour. A new widget type must declare, for each mark, which of the six roles it plays, and must pass the checks in 2.2 before it ships.

---

## 9. Accessibility

1. Every interactive element is a native control or has a native control behind it: `button`, `input type="range"`, `details`, `a`.
2. Focus is always visible: a 2px blue outline with 2px offset. Lever focus outlines the whole track. Range thumbs show a 5px halo.
3. A "Skip to content" link is the first focusable element.
4. On route change focus moves to the page's `h1`.
5. Live regions: call feedback, verdict lines, the lever lab's value announcement, the demo thread and the case page's answer use `aria-live="polite"`.
6. Charts have `role="img"` and an `aria-label` that says what is shown. Every value shown only on hover is also in a table view, a readout or the verdict sentence.
7. Colour is never the only carrier of meaning (2.2 rule 1).
8. Text contrast is at least 4.5:1, except the faint axis end labels (3.17:1, non-essential). Marks below 3:1 always carry a label, a pattern or a table.
9. `prefers-reduced-motion: reduce` cuts every animation and transition to 0.001ms. Scripted runs jump to their end value and demo delays become zero.
10. Touch targets are at least 40px high. The lever knob has an 18px-larger invisible hit area (9px on each side).
11. Decorative graphics (glyphs, mini pictures, the closing bars, icons) are `aria-hidden`.
12. Form fields have visible or visually hidden labels, `autocomplete="email"`, and error text next to the field.
13. The page never scrolls sideways at any width from 320px up. Only the table view scrolls inside its own box.

Recommended before launch (not in the prototype): a table view for the levers bridge, the rates rulers and the WeWork bars; a forced-colours pass; a test with a screen reader on each widget's full flow.

---

## 10. Motion

| Moment | Motion |
|---|---|
| Brand glyph on first visit | Bars grow from the baseline, 0.5s, staggered 0.06s |
| Chat bubbles, captions, beat cards, the Tutor's answer | `rise`, 0.35s to 0.45s |
| Widget mounted by the Tutor | Children rise in sequence, 0.05s apart (`build`) |
| Typing indicator | Three dots, 1s loop |
| Skeleton | Shimmer, 1.1s linear loop |
| Bars, fills, ruler dot, lever parts | 0.42s on height, width, left, bottom. Off while dragging. |
| After the call | The control runs itself to the teaching value: jackpot rate to 5% in 900ms, compounding to 30 years in 1200ms |
| WeWork bars | Width 0.6s as each beat reveals a row |
| Closing bars | Scale up 0.7s, once, when 40% visible |
| Lever dimming, lock opacity | 0.25s |

One orchestrated moment per view is enough. Nothing loops except the typing dots and the skeleton, and both end within about a second.

---

## 11. Responsive behaviour

- Every multi-column layout declares `minmax(0, 1fr)` columns and stacks at the breakpoints in 3.6.
- Charts redraw at their real width (principle 6). On a 390px phone the jackpot and compounding columns are about 10px apart with bars about 6px wide.
- The hero stacks copy above the demo. The question chips wrap.
- The levers story keeps its stage visible as a compact sticky strip so each scroll step still changes something on screen.
- Case pages put the widget between the Tutor's lead and the Tutor's answer.
- The nav keeps the primary CTA at every width.
- The Study Workspace opens at every width; nothing asks for a bigger screen. Below 768px the conversation fills the screen and a Widget's chip slides the Widget up full screen; Back (the browser's or the sheet's own) returns to the same place in the conversation.
- The signed-in pages (Welcome, Course Map, Notebook, Settings, older Sessions, Library passages, Admin) open at 360px with no sideways scroll. Card grids drop to one column, and wide tables scroll inside their own box. The app header stays one line of 56px: below 768px the wordmark shows only its bars and the page links tighten.

---

## 12. Voice and copy rules

1. Write from the learner's side. Name things by what people recognise.
2. Short, direct sentences. No asides in dashes, no "not X, but Y" constructions, no colon-then-reveal.
3. Money words are explained when the story needs them, never before.
4. Figures always carry their unit and their date: "$84 a share on 3 Feb 2000".
5. A verdict sentence states the number and the comparison: "At 5.00%, the payments are worth **$183.8M less** than the cash."
6. Feedback on a wrong answer explains the idea. It never scolds. The pill says "Not quite".
7. Nothing reads as advice. No "cheap", "expensive", "buy", "sell", "undervalued" or "overvalued".
8. Product nouns are capitalised: Topic, Tutor, Check, Review, Notebook, Library, Study Workspace.
9. Made-up numbers are labelled "Illustration". Recorded conversations are labelled as recorded.
10. Sources are named with a date on every widget.
11. **Familiar first.** Every page and Topic starts from something a beginner already knows. No name or word they must look up: a published author is named only in a linked source line (and the About credit), and their work is "one published valuation". On screen an Example is never a "case", a Story is someone's claim to judge (never "your story"), and the event is "The moment". Round numbers in plain words come first ("keeps 10¢ of each $1", "investors want 13% a year"); exact figures follow in the widget. One label never repeats beside itself (no "THE NEWS · The news").

---

## 13. QA checklist

| # | Test | Expected |
|---|---|---|
| 1 | Load `#home` as a visitor | Jackpot conversation complete, controls locked, verdict about the billboard number, no pills |
| 2 | Tap "The cash" | Chip green with check, "Right" pill, rate runs to 5.00%, payments ₹11.29 crore, "Worth more" on Cash today, Go deeper: "You are **₹13.71 crore** away. Try a lower rate." |
| 3 | During that run | "Break-even found" must not appear |
| 4 | Set the rate to 0% by hand | ₹25 crore, "Same" on both rows, "Break-even found" |
| 5 | Tap "Amazon at $84" | Typing, Tutor bubble, skeleton, then the levers widget at $35 |
| 6 | Tap "One story worth $84" | Value $84 (83.69), "100% of the $84 price." replaced by "Worth the $84 price, on this story.", pills +$27, +$17, none, +$5, "You reached the price" |
| 7 | Tap "A grocer’s margins" | Value $1, one red pill −$34 under "What it keeps" |
| 8 | Drag "How risky" to the top | The band above the notch is red, the pill is red and negative, the value falls |
| 9 | Drag "How risky" below the notch | A pale green band between knob and notch, a green pill |
| 10 | Scroll the levers story to lever 2 | Stage shows his story, a red and green band from $0 to $102, only "What it keeps" has a knob, text says it reaches $84 at 17.5% |
| 11 | Drag that lever to 17.5% | Value $86 (85.50), the first setting at or above $84 (17% gives $82). The dot sits just right of the price pin and the sub-line reads "Worth the $84 price, on this story." |
| 12 | Scroll back from "Your turn" after changing levers, then return | Steps 1 to 4 show his story, step 5 restores the learner's story |
| 13 | Compounding: tap "No, more each year" | Years run to 30, ₹17,449, growth ₹16,449, year 30 added ₹1,586 |
| 14 | Tap "Split the growth" | Bars and segmented bar show ₹3,000 and ₹13,449, the key has three entries |
| 15 | Rates: tap "Down 0.5%" | Chip orange with "!", pill "Careful", slider unlocked, Go deeper open |
| 16 | Set the new rate to 4.50% | down 1.5 points, −150 bp, down 25%, literal 0.09 points to 5.91% |
| 17 | Set the old rate to 2% and the new to 3% | up 1 point, +100 bp, up 50% |
| 18 | WeWork: step to beat 5 and tap "No, it is a pace" | Three bars shown, chip green, Go deeper shows $1.00 and −$0.59 |
| 19 | Open `#case-amazon-2000` | Tutor's answer locked, ending locked, progress at step 2 |
| 20 | Move a lever on that page | Tutor's answer appears, ending becomes "Ready", progress at step 3, Go deeper open with the bridge |
| 21 | Tap "Reveal what really happened" | Reveal text with $35.08, $91.50 and $14.88, progress all done |
| 22 | As a visitor, look at the closing block | No email form here: the primary button "Join the waitlist" links to `/join`, with the waitlist note and the three steps under it (7.2.8) |
| 23 | Press "Join the waitlist" in the closing block | It opens `/join`: Clerk's Waitlist owns that page, its email check and the "you're in" email (#33) |
| 24 | Every route at 1440 × 900 and 390 × 844 | No console errors, no horizontal scroll |
| 25 | Reduced motion on | No animated runs. Values jump. The demo answers at once. |
| 26 | Keyboard only | Every chip, slider, lever, preset, toggle and reveal reachable and operable |

---

## 14. Known gaps and open decisions

| Item | State | Needed |
|---|---|---|
| Founder's note | Placeholder | Two or three sentences in the founder's own words |
| Contact email | Placeholder | A real address, shown as selectable text |
| Price | "No price has been decided yet" | The shape of the offer, even before the number |
| Wait time | No promise made | A number of days, or keep the promise out |
| Learner quotes | None | Real sentences from early members. Never invented. |
| Amazon model | Done (decision #18): the widget runs the valuation engine on Damodaran's sourced inputs, $35.04 against his $35.08, and its source line says so | Nothing |
| First market | Mixed rupee and dollar cases | Choose which currency and events lead |
| Theme | Done (ADR 0019): Light and Dark; the device chooses first, the sun/moon switch remembers the choice in the `theme` cookie; Dark values measured in §2.4 | Nothing |
| Table views | Jackpot and compounding only | Add for levers, rates and WeWork |
| Hero demo | Recorded | Wire to the live Tutor or keep the label |
| Named valuation author | "Not affiliated" line on About | Confirm the wording is enough for you |

---

## Appendix A. Case copy deck

### A.1 Kerala Thiruvonam Bumper, October 2024

The copy lives in `src/site/examples.ts` (`kerala-bumper-2024`); it replaced Mega Millions 2018 on the site (#116).

| Field | Text |
|---|---|
| Slug / stamp / category | `kerala-bumper-2024` / Oct 2024 / Everyday money |
| Topic | Why is money later worth less? |
| Question | Is ₹25 crore over 30 years worth ₹25 crore? |
| Hook | Kerala paid its ₹25 crore jackpot at once. American lotteries pay theirs over 30 years. Is that the same prize? |
| Story | **9 October 2024.** Kerala’s Thiruvonam Bumper lottery draws its first prize of **₹25 crore**, on ticket TG 434222, sold in Wayanad for ₹500. Kerala pays a prize at once. American lotteries advertise theirs as the sum of **30 yearly payments** that rise 5% a year. Paid that way, would the same ₹25 crore be worth as much? |
| Facts | First prize, paid at once: ₹25 crore · Ticket price: ₹500 · Drawing: 9 Oct 2024 |
| Learner asks | ₹25 crore is ₹25 crore. Why would it matter when it’s paid? |
| Tutor's lead | Two ways to pay the same prize: **₹25 crore** at once, as Kerala does, or 30 yearly payments that add up to **₹25 crore**, the American way. Make your call in the widget, then test it. |
| Tutor's answer | **Only if a rupee later is worth as much as a rupee now. It isn’t.** A payment in 2053 can’t be spent or invested until 2053. Put the cash in a deposit at 5% instead, and each far-off payment is worth much less today. Add the 30 payments up in today’s money, then compare. |
| Follow-up, right | Right. Now drag the rate down. Only at 0%, when money earns nothing, are the two worth the same. |
| Follow-up, other | Most people start there. Watch what a 5% rate does to the far-off payments, then look for the rate where the two match. |
| Ending label | What the winner got |
| Ending | Kerala’s Lotteries department pays the prize into the winner’s bank account in one go, after the agent’s 10% commission and tax: about **₹12.88 crore** of the ₹25 crore reached the winner. Paid over 30 years instead, the same ₹25 crore would be worth only about **₹11.29 crore** today at 5% a year, before any tax. *A rupee later is worth less than a rupee today.* |
| As-of date | 9 Oct 2024 |
| Sources | The Hindu, 9 Oct 2024; Mathrubhumi, 9 Oct 2024; The New Indian Express, 11 Oct 2024; Mega Millions, Difference Between Cash Value and Annuity (links in §6.3). The 30 payments are a what-if, worked out the American way. |

### A.2 Amazon, February 2000

| Field | Text |
|---|---|
| Slug / stamp / category | `amazon-2000` / Feb 2000 / Real companies |
| Topic | What is a business worth? Price against value, and the four levers |
| Question | Is $84 a fair price for Amazon? |
| Hook | Amazon sells books online, loses money, and its shares cost $84. Set four levers and judge what the price needed. |
| Story | **February 2000.** Amazon sells books and music online. In the twelve months to September 1999 it sold **$1,117 million** and lost **$410 million** on its operations. Its shares cost $84. One published valuation writes down a Story about its future: how big it gets, what it keeps of each sale, what its growth costs and how risky it is. |
| Facts | Sales, 12 months to Sep 1999: $1,117M · Operating loss, same period: $410M · Share price, 3 Feb 2000: $84 |
| Learner asks | If Amazon loses money, how can it be worth anything at all? |
| Tutor's lead | Start with what people knew that day. Buyers paid **$84** a share. One published valuation of Amazon’s future came to **$35**. Four levers explain the gap. Move one and watch. |
| Tutor's answer | **Because value comes from the cash it makes later, not the loss it makes now.** A valuation is a story told in four numbers: how big the business gets, what it keeps of each sale, what that growth costs, and how risky the ride is. Set those four levers and the cash flows, and the value, follow. |
| Follow-up | Green adds value to the published $35. Red takes it away. What did the $84 price need? Would you have believed it in 2000? |
| Ending label | What really happened |
| Ending | The published valuation came to **$35.08 a share** against the $84 price. The $84 was already below the year’s high: in early January 2000 the shares had traded as high as $91.50. The price fell through 2000, and by the fourth quarter the shares had been as low as **$14.88**. *A price is what buyers paid that day. A value is what one story about the business is worth.* Neither number proves the other wrong. |
| Sources | Damodaran’s published valuation of Amazon, 2000. The widget runs the course’s valuation engine on his inputs and reproduces his $35.08 within 2%. |

### A.3 WeWork, August 2019

| Field | Text |
|---|---|
| Slug / stamp / category | `wework-2019` / Aug 2019 / Real companies |
| Topic | Revenue recognition, run rates, gross vs net |
| Question | WeWork boasted of $3 billion of run-rate revenue. Is that what it earned? |
| Hook | A share-sale filing, a dazzling pace, and the revenue actually recorded. |
| Story | **14 August 2019.** WeWork, which rents desks to members, publishes its plan to sell shares to the public. In January 2019 private investors had valued it at **$47 billion**. The filing boasts of revenue racing ahead at a **$3 billion run rate**. |
| Facts | Run rate claimed: $3bn a year · Revenue recorded, Jan–Jun 2019: $1.54bn · Net loss, Jan–Jun 2019: about $905M |
| Learner asks | WeWork boasted of $3 billion of run-rate revenue. Is that what it earned? |
| Tutor's lead | Good instinct to check. Step through what the filing said and what Asha found in it. Then make the call. |
| Tutor's answer | **Not quite.** A run rate takes a recent period and scales it to a year: WeWork’s filing took the revenue of the last month and multiplied it by 12. That is a pace, not revenue already recorded, and it is only as good as the guess that the pace repeats. The revenue it recorded in the first six months of 2019 was $1.54 billion, with a net loss of about $905 million. |
| Follow-up, right | Right. A run rate is a pace. Revenue is what was recorded. |
| Follow-up, other | Look at the bars again. The $3bn is one month times 12. The $1.54bn is what was recorded. |
| Ending label | What really happened |
| Ending | Six weeks later, on **30 September 2019**, WeWork withdrew its share sale. In November 2023 it filed for bankruptcy. *A run rate is a pace. Revenue is what was recorded.* |
| Sources | WeWork S-1, 14 Aug 2019; CNBC, 30 Sep 2019; Forbes, 7 Nov 2023. |

### A.4 The RBI's repo-rate cut, June 2025

The copy lives in `src/site/examples.ts` (`rbi-repo-cut-2025`); it replaced the undated "Rates up 1%" (#116).

| Field | Text |
|---|---|
| Slug / stamp / category | `rbi-repo-cut-2025` / Jun 2025 / The news |
| Topic | Percent, percentage points and basis points |
| Question | The RBI cut its repo rate from 6% to 5.5%. How big a cut is that? |
| Hook | Half a point, 50 basis points, or about 8%: three true answers of different sizes. |
| Story | **6 June 2025.** The Reserve Bank of India cuts its repo rate, the rate at which it lends to banks, from **6%** to **5.5%**. Home loans, deposits and the bond market all move on that number. But “cut by 0.5%” could mean two very different sizes. |
| Facts | Repo rate before: 6% · Repo rate after: 5.5% · Decided: 6 Jun 2025 |
| Learner asks | The RBI cut its rate from 6% to 5.5%. Is that a 0.5% cut? |
| Tutor's lead | On 6 June 2025 the repo rate went from **6% to 5.5%**. Three ways of describing that move are in the widget. Tap each one you think is correct. |
| Tutor's answer | **It depends which size you mean.** From 6% to 5.5% is half a percentage point, 50 basis points, and about 8% of the old rate. All three are true, but they are different sizes. Down 0.5% could mean half a point, or 0.5% of the old 6%, which is only 0.03 points. So say down half a point, or down 50 bp. |
| Follow-up | Tap the other two as well. Two are right, and one is the trap headlines fall into. |
| Ending label | The rule to keep |
| Ending | *Name the base of every change.* A move from 6% to 5.5% is down 0.5 percentage points, down 50 basis points, and down about 8% on the old rate. The RBI announced it as **50 basis points**, so nobody had to ask which one it meant. |
| As-of date | 6 Jun 2025 |
| Sources | [RBI, Monetary Policy Statement 2025-26, Resolution of the MPC, 6 Jun 2025](https://www.rbi.org.in/Scripts/BS_PressReleaseDisplay.aspx?prid=60604) |

### A.5 Compounding ₹1,000

| Field | Text |
|---|---|
| Slug / stamp / category | `compounding-1000` / Everyday / Everyday money |
| Topic | Growth and compounding |
| Question | My deposit earns 10% a year. Does it grow by the same amount every year? |
| Hook | ₹1,000 at 10% a year, left alone for 30 years. |
| Story | **Your deposit.** You put **₹1,000** in a deposit that pays **10% a year** and leave everything in. The statement shows the balance once a year. |
| Facts | You put in: ₹1,000 · It pays: 10% a year · You take out: nothing |
| Learner asks | My deposit earns 10% a year. Does it grow by the same amount every year? |
| Tutor's lead | Say you put **₹1,000** in a deposit that pays **10% a year** and leave it alone. Make your call, then drag the years. |
| Tutor's answer | **No, a little more each year.** ₹1,000 at 10% a year is ₹1,100 after one year. Year two adds 10% of ₹1,100, which is ₹110, so it reaches ₹1,210. Each year’s gain is earned on a bigger total. That is compounding: each year grows on the new total, not on the start. |
| Follow-up, right | Right. Now look at 30 years: the last few bars outgrow the first ten put together. |
| Follow-up, other | Look at 30 years and watch what the last few years add. |
| Ending label | The rule to keep |
| Ending | *Each year grows on the new total, not on the start.* After 30 years, ₹1,000 at 10% becomes about **₹17,449**, and the last year alone adds about ₹1,586. At 10% a year, money doubles roughly every 7 years (72 ÷ 10). |
| Sources | Worked example from the Topic. No outside figures. |

---

## Appendix B. FAQ and About copy

FAQ, in order:

| # | Question | Answer |
|---|---|---|
| 1 | Is Value It investment advice? | No. It teaches how finance works through past events. It never tells you what to buy or sell, and gives no tips. |
| 2 | Do I need to be good at maths? | No. You never type a number: every question is a tap, or a sentence in your own words. The site works out the sums, and the AI Tutor explains them in words. |
| 3 | Where do the facts come from? | From real past events with known outcomes. Widget figures come from checked datasets, each stored with its public source and the date it was checked. When the Tutor quotes its Library, the answer links to the passage. |
| 4 | Does the AI make up the charts? | No. The AI Tutor chooses which chart to open and at which numbers; the chart is drawn from checked figures. Made-up numbers are labelled Illustration. |
| 5 | What does it cost? | Nothing during early access. No price has been decided yet. |
| 6 | How do I get in? | Join the waitlist with your email. We let people in by hand while the course grows, and email you when you’re in. |
| 7 | Can I start again? | Yes. Start one Topic over and its earlier attempt stays in your Notebook, or start everything over in Settings. Your old record is archived, not deleted. |
| 8 | Do you track me? | There are no ads. We count page views with Vercel Web Analytics, which records the page address, where you came from, and your browser, device and country. It sets no cookie. If you press the sun/moon switch, a cookie called theme remembers Light or Dark, and nothing else. |

About, promises:

| Heading | Body |
|---|---|
| Past events only. | Every Topic is built on a real event whose outcome is known. **Until the reveal, you see only what was known that day.** |
| Every figure has a source. | Widget figures come from checked datasets, each stored with **its public source and the date it was checked**. |
| Code draws the charts. The AI never does. | The Tutor picks the widget and its numbers; tested code draws it. **Made-up numbers are labelled Illustration.** |
| Never advice. | No tips, no buy or sell calls. If you share your situation, **the Tutor uses it only when you ask** how an idea applies to you. |

About, sourcing flow: **Real event** (A past moment whose outcome is known, like Amazon in February 2000.) → **Checked dataset** (Each figure stored with its public source and the date it was checked.) → **Tested widget** (Code draws the chart from that data, from a tested design.) → **The Tutor explains** (Quotes from its Library carry a number that opens the passage.)

Non-affiliation line: "The valuations used as Cases are published work by Aswath Damodaran and others, named and linked where they appear. Value It is not affiliated with them."

Early access: **Join** (Join the waitlist with your email. **We let people in by hand**, a few at a time.) · **Cost** (**Free during early access.** No price has been decided yet.) · **What you need** (A phone, a tablet or a laptop. Study works on all three.)

---

## Appendix C. Course map shown on the site

15 core Topics, with minutes:

| # | Topic | Min |
|---|---|---|
| 01 | What is a business worth? Price against value, and the four levers | 10 |
| 02 | Why is money later worth less? | 12 |
| 03 | Where does the cash come from? | 12 |
| 04 | Growth: how big can it get? | 12 |
| 05 | Margins: what does it keep? | 12 |
| 06 | What does growth cost? | 13 |
| 07 | Risk: what rate do you discount at? | 13 |
| 08 | What about the years you cannot forecast? | 12 |
| 09 | How do you get from the business to one share? | 13 |
| 10 | What if it does not survive? | 12 |
| 11 | How does a story become numbers? | 14 |
| 12 | Is a price a value? Multiples and comparables | 13 |
| 13 | What does the price assume? | 13 |
| 14 | How do you live with being wrong? | 14 |
| 15 | Value one yourself, as of a past date | 15 |

Nine subjects (72 Topics): Numbers & time value 6 · Financial statements 11 · Economics & policy 11 · Bonds & credit 7 · Currencies & countries 4 · Markets & investing 9 · Valuation & corporate finance 12 · Derivatives 5 · Banks, crises & the system 7.

Three stages that read real arguments (23 Topics): Follow, understand what a writer argues, 9 · Judge, spot where an argument is weak, 8 · Analyse, reach your own view from the numbers, 6.

Locked Topics listed on Examples:

| Category | Title |
|---|---|
| Follow | Tesla, a valuation (Feb 2020) |
| Judge | Twitter's 2013 IPO valuation versus what happened |
| Follow | Uber, a crowd valuation (Dec 2014) |
| Banks, crises & the system | Bank runs and interest-rate risk in banks |
| Economics & policy | India's economy and the 1991 reforms |
| Judge | Junk or BB+? |
| Banks, crises & the system | Securitisation, MBS and CDOs |
| Follow | OpenAI’s cheap AI prices (Sep 2024) |
| Analyse | Transfer to India (G-sec, bank, rupee) |

---

## Appendix D. Lingo cards (How it works, move 2)

| Term | Definition | Say it like a pro | For example | In the story |
|---|---|---|---|---|
| price | What buyers pay for one share today. | The shares closed at $84. | A used bike sells for $200 on the day, whatever it is worth to you. | In the story, $84 is what buyers pay for an Amazon share. |
| value | What one story about the business says a share is worth. | One published valuation puts the shares at $35. | You think the bike is worth $150 to you, whatever it sells for. | In the story, $35 is what one published valuation says a share is worth. |

---

## Appendix E. What changed from Prototype A, in one table

| Area | Prototype A (Ledger) | Prototype B (Signal) |
|---|---|---|
| Blue | Brand, links, labels, values, bars and progress | You and the interface only |
| Green and red | Mint for payments, revenue and growth; coral for direction and losses | Green is gain or right; red is loss or wrong; direction is uncoloured |
| New signals | — | Orange for careful; black for the record; hatching for not real yet |
| Colour-blind safety | Mint and coral at similar lightness | Green and red re-picked: 13.0 apart under deuteranopia; every signal has an icon or word |
| Levers | Four blue bars in four units, logo-shaped on first frame | Notch for his story, green or red delta, dollar effect under each lever |
| Price against value | Two numbers in opposite corners | One ruler, price pinned at the centre |
| Levers story | Four steps showing "?" | Each step shows what that lever can do alone, and lets you drag it |
| Quiz order | Answer shown before the question | Call first; controls and the Tutor's answer unlock after |
| Second layer | None | One "Go deeper" per widget |
| Charts on phones | Scaled-down 600px drawings | Drawn at device width |
| Hero | A widget | A recorded Tutor conversation that opens a widget |
| Doors | Three personas | Five questions |
| Joining | Separate page; "[N days]" placeholder | Inline email on home; three steps; no day count |
| Elevation | Every block a card | Only live widgets are raised |
