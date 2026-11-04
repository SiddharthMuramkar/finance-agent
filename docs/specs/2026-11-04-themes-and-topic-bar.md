# A learner reads the tutor for hours without glare, in the theme they like, with nothing crowding the chat

> **What this is:** a spec for an LLM coding agent (Claude Code) working in the Finance Agent repo (Next.js, Tailwind v4, OpenUI).
>
> **Where it came from:** a UI/UX review of the live Study Workspace (`www.value-it.xyz/study`) on 4 November 2026. The developer settled every open choice that day: the new Dark theme, the two extra themes, how switching works and where the topic bar goes.
>
> **Where to save it:**
> - this file: `docs/specs/2026-11-04-themes-and-topic-bar.md`
> - the two images: `docs/specs/img/four-themes-target.png` and `docs/specs/img/theme-candidates.png`
> - the script: `scripts/check-theme-contrast.mjs`

---

## 0. Read this first (instructions for the agent)

1. **Read the whole file before you touch code.**
2. **Verify before you rely on anything.** The author could not see the repository. Everything in §2 was measured in Chrome on the live site, not read from code. Before you rely on a fact, confirm it with the ticket's **Find it** commands. If the code contradicts this spec, stop. Comment on that ticket's issue with what you found and wait. Don't guess.
3. **Create the issues first** (Appendix E):
   - One parent issue. Its title is this file's title and its body is §1–§5.
   - One sub-issue per ticket in §6. The title is the ticket heading without its `T-0x` id. The body is the ticket text from **Why** to **Done when**. Use the ticket's label.
   - Each ticket lands as one PR whose description says `Closes #<issue>`.
4. **Work order.** Only work on `ready-for-agent` tickets, in this order: **T-06 → T-01 → T-02 → T-04 → T-03 → T-05 → T-08**. Never start a `needs-triage` ticket (T-07) until the developer relabels it.
5. **Guardrails for every ticket:**
   - Light's colours never change. The script from T-01 fails if they do.
   - Don't change fonts, spacing, copy, routes, or any component a ticket doesn't name.
   - Don't add dependencies.
   - Colours live only in the tokens file. Components use `var(--token)`.
   - The UI calls the themes **Light, Paper, Midnight, Forest**. Never show the source palettes' names in the UI. Credit them in a code comment instead.
   - Keep `data-testid="topic-bar"` and `aria-label="Topic progress"`.
6. **Before each PR:**
   - Run the repo's check command (look in `package.json`, e.g. `pnpm check`).
   - Once T-01 has landed, also run `node scripts/check-theme-contrast.mjs <tokens file>`.
   - Attach the screenshots the ticket asks for.

---

## 1. What changes

- **Midnight replaces today's Dark theme.** It's a deep blue-violet with pastel accents (after Catppuccin Mocha). Body text drops to 11.3:1 from today's harsh 18.1:1, and nothing is neon. The "Sourced history" widget uses a soft peach instead of today's saturated yellow.
- **Two new themes:**
  - **Paper**: a warm, low-glare light theme for long daytime reading (after Rosé Pine Dawn).
  - **Forest**: a soft green-grey dark theme (after Everforest).
- **Light stays exactly as it is.**
- **Switching:**
  - By default the site follows the Mac: Light by day, Midnight at night.
  - In **Settings → Appearance** a learner picks a day theme (Light or Paper) and a night theme (Midnight or Forest), or one theme always.
  - The header's "Light mode" toggle becomes a **Theme** menu that switches to any of the four in one click.
- **Generative widgets** (OpenUI) follow the active theme, not the Mac's setting.
- **The topic bar moves to the top of the right-hand column.** The chat column keeps only the messages and the composer. That's 110 px (20 %) more reading height at 1024×797.

Target look: `img/four-themes-target.png` shows live previews of all four themes on /study, with the topic bar already moved. `img/theme-candidates.png` shows the six palettes the developer chose from.

---

## 2. What the review found

**Setup:** Chrome on a 14-inch MacBook Pro (screen 1512×982, device pixel ratio 2), viewport 1024×797 with the Chrome side panel open, macOS in Dark Mode. Page: /study, topic "Percent, percentage points and basis points".

### 2.1 Why today's dark mode looks "inverted", and why the widgets look wrong

**It *is* inverted.** Every dark token mirrors its light twin along Tailwind's colour scales:

| Token | Light | Dark today |
|---|---|---|
| `--bg` | `#fafaf9` (stone-50) | `#0c0a09` (stone-950) |
| `--ink` | `#1c1917` (stone-900) | `#f5f5f4` (stone-100) |
| `--field` | `#fff` | `#1c1917` (stone-900) |
| `--hairline`, `--bubble` | `#e7e5e4` (stone-200) | `#292524` (stone-800) |
| `--border`, `--data` | `#d6d3d1` (stone-300) | `#44403b` (stone-700) |
| `--muted` | `#79716b` (stone-500) | `#a6a09b` (stone-400) |
| `--you` | `#00786f` (teal-700) | `#00d5be` (teal-400) |
| `--src` | `#e17100` (amber-600) | `#ffb900` (amber-400) |
| `--src-tag` | `#fef3c6` (amber-100) | `#461901` (amber-950) |

**What that does to the page:**

- **Glare.** Near-black page, near-white text: 18.1:1 (APCA Lc −101). That's past APCA's preferred Lc 90 for body text. Yet secondary text and links are weak (muted Lc −51, links Lc −48), so the page is harsh and murky at once.
- **Neon accents.** The accents are saturated 400-step colours: amber `#ffb900` (OKLCH chroma 0.171), teal `#00d5be` (0.141) and blue `#6699ff` (0.160). Saturated colours vibrate on dark backgrounds.
- **Muddy yellow.** The amber family changes hue from role to role:
  - tag background: brown `#461901` (hue 46°)
  - left rule and chart: golden `#ffb900` (hue 81°)
  - card tint over the page: brown-black `#180d07`

  That's the "weird yellow" and the muddy Sourced-history widget.
- **Scan result.** A scan of the rendered page found:
  - a near-black page background
  - neon blue links and Send button (`#6699ff`)
  - a neon amber chart line and dot (`#ffb900`)

### 2.2 How theming is wired today (confirm in code)

- **Stack.** Next.js App Router. Tailwind v4: `@layer theme` maps `--color-bg: var(--bg)` and `--color-border: var(--border)`. Components use arbitrary values such as `bg-[var(--brand)]` and `text-[var(--muted)]`.
- **Token file.** One CSS file defines `:root { … }` (light) and `:root.dark { … }` (dark).
  - The 26 colour tokens: `bg field bubble hairline border data muted ink brand brand-hover brand-pressed ring brand-ink brand-tint brand-line you you-line you-tint you-tag you-tag-ink src src-line src-tint src-tag src-tag-ink danger`.
  - `:root` also has `--navy-deep --navy-deeper --navy-accent --navy-muted`, with no dark values.
  - A print block `@media print { :root, :root.dark { …light values… } }` exists.
  - Both theme blocks set `color-scheme` (Lightning CSS emits `--lightningcss-light/dark`).
- **How the theme is applied.** The server renders `<html lang="en" class="dark">`. There's no `data-theme` and no `data-openui-theme`. No `localStorage` key mentions theme, mode or dark, so the saved choice is probably a cookie or an account setting.
- **The toggle.** It's `<button type="button" aria-label="Switch dark or light mode">Light mode</button>` in the header.
- **What each token is used for:**
  - `--brand`: text, background (Send), `border-top-color`, `accent-color`, the focus `outline-color` and the ring.
  - `--brand-ink`: text on brand, and a background somewhere.
  - `--you` and `--src`: background, plus SVG `fill` and `stroke` (charts).
  - `--data`: background and fill.
  - `--src-line` and `--you-line`: in no stylesheet, so they're set inline (`style={{…}}`).
- **OpenUI** (`@openuidev/react-ui`):
  - A `ThemeProvider` injects `<style data-openui-theme>`, scoped to `.genui, .openui-theme-portal-…`, with 215 `--openui-*` variables.
  - 46 of them map to app tokens, e.g. `--openui-background: var(--bg)` and `--openui-foreground: var(--field)`.
  - The rest are OpenUI's defaults for the provider's `mode`. At review time these were the dark defaults, e.g. `--openui-highlight: oklch(0.994 0 89.876 / 0.04)` and `--openui-inverted-background: oklch(0.994 0 89.876 / 1)`.
  - OpenUI's global CSS also switches its `:root` defaults on `@media (prefers-color-scheme: dark)` unless `<html data-openui-theme>` is set. So parts of the widgets follow the Mac, not the app.

### 2.3 The topic bar

- **Where it lives.**
  - The bar is `<nav aria-label="Topic progress" data-testid="topic-bar" class="rounded-lg border border-[var(--border)] px-3 py-2">`.
  - It sits in a wrapper `div.relative.mb-6.flex.max-h-[40%].shrink-0.flex-col.gap-3.overflow-y-auto`.
  - That wrapper is the first child of the chat column, `div.flex.h-full.min-h-0.min-w-0.flex-col`.
  - The chat column sits in the grid `div.grid.min-h-0.flex-1.grid-cols-2.grid-rows-[minmax(0,1fr)].gap-6.overflow-hidden.lg:gap-8`.
- **It isn't sticky, but it never moves.** It's a block above the message list (`div.relative.min-h-0.flex-1.overflow-y-auto.pb-6`), so the conversation always scrolls under it. At 1024×797:
  - header area: 0–84 px
  - topic bar: 84–170 px, plus a 24 px gap
  - message list: 194–743 px (549 px)
  - composer: 743–785 px
- **The cost.** The bar takes 110 px, which is 20 % of the message list.
  - The chat column's content-to-chrome ratio is about **2.2:1**: a 549 px message list against 248 px of everything else in the 797 px viewport.
  - NN/g calls 2:1 "miserly" and 13:1 "reasonable".
  - Moving the bar out gives about 4.8:1.
- **It can grow.** The wrapper allows up to 40 % of the column (`max-h-[40%]`) and is a `flex-col gap-3`, so other phases may render more into it. Check every phase.
- **The right column** (`overflow-y: auto`) holds one `<section>`: Case data, 444 px tall. That leaves about 257 px free at 1024×797.
- **Only `md` and up matter.** The Study Workspace needs at least 768 px. Below that, `<p class="md:hidden">The Study Workspace needs a bigger screen. Open it on a laptop or an iPad.</p>` shows instead.

---

## 3. What was decided

### Themes
- **The four themes.** Their ids are `light`, `paper`, `midnight` and `forest`. Their labels are Light, Paper, Midnight and Forest.
- **Kind.** Light and Paper are *light* themes. Midnight and Forest are *dark* themes. Dark themes keep `class="dark"` on `<html>`, so Tailwind's `dark:` variant and `:root.dark` keep working.
- **Light** is unchanged and frozen.
- **Midnight** takes over the `:root.dark` block. Everyone who uses dark mode today lands on Midnight.
- **Paper and Forest** are new blocks: `:root[data-theme="paper"]` and `:root.dark[data-theme="forest"]`.
- **Values** are in Appendix A. They're adapted from three MIT-licensed palettes: Catppuccin Mocha, Rosé Pine Dawn and Everforest. Every pair is tuned to pass the quality bar below.
- **The Sourced-history accent** (`--src*`) uses each palette's own warm colour:
  - Midnight: peach
  - Forest: muted gold
  - Paper: gold, with a brown label
  - Light: amber, as today

  No dark theme uses saturated amber.

### Choosing a theme (GitHub-style day/night pairing)
- **Preference shape:** `{ mode: 'system', day: 'light'|'paper', night: 'midnight'|'forest' }` or `{ mode: 'single', theme: <any of the four> }`.
- **Default:** `{ mode: 'system', day: 'light', night: 'midnight' }`, which follows the Mac's appearance.
- **Header menu.** The "Light mode" toggle becomes a **Theme** menu with:
  - **Match my Mac**, with a sub-label built from the saved pair, e.g. "Light by day, Midnight at night"
  - **Light**
  - **Paper**
  - **Midnight**
  - **Forest**

  Picking a theme sets `single`. Picking Match my Mac sets `system` with the saved pair.
- **Settings → Appearance** offers "Match my Mac" with a Day theme (Light or Paper) and a Night theme (Midnight or Forest). Or "Always use one theme" with any of the four.
- **Storage.** The choice is saved where today's choice is saved. Old values migrate:
  - `dark` → Midnight (single)
  - `light` → Light (single)
  - nothing saved → the default
- **Before first paint, with no flash,** `<html>` gets four things:
  - `data-theme` (the theme id)
  - the `dark` class (dark themes only)
  - `color-scheme`
  - `data-openui-theme` (`light`/`dark`)

### Widgets
- The OpenUI `ThemeProvider` `mode` is the active theme's kind. The OpenUI colour keys that are still hard-coded get mapped to tokens (T-04).

### Topic bar
- It moves to the top of the right-hand column, as a non-scrolling header above Case data.
- It isn't sticky or fixed, has no animation and doesn't collapse. Its markup doesn't change.

### Quality bar
`scripts/check-theme-contrast.mjs` enforces this in the check command.

- **Light** equals today's values exactly.
- **Paper, Midnight and Forest:**
  - body text (`--ink`) is at least 7:1 on `bg`, `field`, `bubble` and the tinted cards
  - every other text pair is at least 4.5:1 (WCAG 2 AA)
  - the focus ring is at least 3:1
- **Dark themes only:**
  - body text is between 9:1 and 15:1 (readable, no glare), with APCA Lc of at least 75
  - `--bg` OKLCH lightness is between 0.20 and 0.34 (never near-black)
  - surfaces get lighter as they rise: bg < field < hairline < border
  - accent chroma is at most 0.135 (no neon)
  - tints are at most 10 % alpha

---

## 4. The rules behind these choices

1. **Design dark colours; don't invert light ones.** Apple: dark-mode colours "aren't necessarily inversions of their light counterparts". [Apple HIG: Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode.md)
2. **No pure black page.** Material builds dark surfaces on dark grey (`#121212`), not black, so lighter elevated surfaces still read as layers. [Material codelab](https://codelabs.developers.google.com/codelabs/design-material-darktheme/) · [NN/g: Dark Mode issues](https://www.nngroup.com/articles/dark-mode-users-issues/)
3. **No pure white text.** Material uses about 87 % white for high-emphasis text because pure white "vibrates" and looks blurred. web.dev picks "a slightly darker white" to stop glow. [Material codelab](https://codelabs.developers.google.com/codelabs/design-material-darktheme/) · [Hello darkness, my old friend](https://dev.to/chromiumdev/hello-darkness-my-old-friend-3jcg)
4. **Enough contrast, not maximum contrast.**
   - Apple: at least 4.5:1, and aim for 7:1 for small text.
   - APCA: Lc 75 is the minimum for body text and Lc 90 is preferred. Our dark themes sit at Lc 80–83 and 9.7–11.3:1.
   - [APCA Bronze](https://a11yreadtech.github.io/ARC/tests/bronze-simple-mode)
5. **Desaturate accents on dark.** "Highly saturated colors on dark backgrounds have poor visibility" (NN/g). Material uses lighter, less saturated tones in dark themes.
6. **Elevation means lighter surfaces.** Apple uses dimmer *base* and brighter *elevated* backgrounds. NN/g: put the darkest colours at the bottom.
7. **Keep dividers visible.** "Thin, gray dividers are easily swallowed up on very dark backgrounds" (NN/g).
8. **One semantic token set, one block per theme.** Name variables by purpose, not by colour. The site already does this, which is why four themes are mostly CSS. [web.dev article](https://dev.to/chromiumdev/hello-darkness-my-old-friend-3jcg) · [Radix: understanding the scale](https://radix-ui.com/colors/docs/palette-composition/understanding-the-scale)
9. **Follow the system by default, let people override, remember it, and never flash.**
   - [NN/g](https://www.nngroup.com/articles/dark-mode-users-issues/) · [Tailwind dark-mode docs](https://github.com/tailwindlabs/tailwindcss.com/blob/main/src/docs/dark-mode.mdx)
   - GitHub's model: follow the system, with a chosen **day theme** and **night theme**. [GitHub Docs](https://docs.github.com/en/enterprise-server@3.15/get-started/accessibility/managing-your-theme-settings)
   - Reading apps offer named themes the same way. [Apple Books](https://support.apple.com/guide/books/ibks8923126d)
10. **`prefers-color-scheme` ignores your toggle.** Media-query styles keep following the OS when a site overrides its theme. That's why OpenUI needs `data-openui-theme`. [Stefan Judis](https://www.stefanjudis.com/today-i-learned/light-dark-isnt-the-same-as-prefers-color-scheme/) · [MDN light-dark()](https://developer.mozilla.org/en-us/docs/web/css/color_value/light-dark)
11. **Test with Increase Contrast** (Apple HIG). That's T-07.
12. **Start from palettes people use for hours a day.**
    - [Catppuccin](https://ctan.csail.mit.edu/macros/latex/contrib/catppuccinpalette/catppuccinpalette.pdf) · [Rosé Pine](https://docs.rs/crate/chromata/1.0.0/source/src/popular/rose_pine.rs) · [Everforest](https://deepwiki.com/sainnhe/everforest/2-color-palette) · [Nord](https://www.nordtheme.com/docs/colors-and-palettes)
    - Solarized's lesson: lower brightness contrast but keep hue contrast. [Solarized](https://en.wikipedia.org/wiki/Solarized)
    - Honest caveat: studies find little difference in eye strain between modes. Screen brightness matters as much as the theme. [NN/g](https://www.nngroup.com/articles/dark-mode-users-issues/)
13. **A sticky bar must earn its space.**
    - NN/g: maximise content-to-chrome. A header that reappears when scrolling up gets in the way of people rereading, which learners do constantly. So it's rejected here. [NN/g: Sticky headers](https://www.nngroup.com/articles/sticky-headers/)
    - Sticky bars can hide focused elements. [Smashing](https://www.smashingmagazine.com/2023/05/sticky-menus-ux-guidelines/) · [WCAG 2.4.11 Focus Not Obscured](https://kb.daisy.org/publishing/docs/wcag/focus-not-obscured-minimum.html)

---

## 5. Not in this spec

- **Light's colours.** They're frozen. A gentler Light is what Paper is for.
- **More themes**, or a custom theme builder.
- **The topic bar's look or contents.** It only moves.
- **Layouts below 768 px.** The Study Workspace shows "needs a bigger screen" there.
- **Input-border contrast** (WCAG 1.4.11) in every theme. That's a separate ticket later.
- **Chart redesign**, e.g. the "3%" label crossing the dashed line.
- **Dimming photos or raster images.** There were none in the Study Workspace at review time.

Tickets are this issue's sub-issues; each lands as one PR.

---

## 6. Tickets

### T-06 · The topic bar sits at the top of the right column, and the chat gets the full height
**Label:** `ready-for-agent` · **Depends on:** nothing (land it first)

**Why:** The topic bar sits above the message list in the chat column and never moves. It takes 110 px (20 % of the reading area at 1024×797) and pulls the eye while the tutor streams. The developer chose to move it to the top of the right column.

**Change:**
- **Move it.** In the Study Workspace layout, move the topic-bar wrapper out of the chat column and make it the **first child of the right column**. Move everything the wrapper renders in every phase along with it.
- **Right column:**
  - The column becomes `flex min-h-0 flex-col gap-4`, and drops its own `overflow-y-auto`.
  - The topic-bar wrapper keeps `relative flex max-h-[40%] shrink-0 flex-col gap-3 overflow-y-auto` and drops `mb-6`.
  - Wrap the existing right-column content in `<div className="min-h-0 flex-1 overflow-y-auto">…</div>`. Only Case data scrolls; the bar stays put.
- **Chat column:** it keeps the screen-reader-only live region, the message list and the composer. The message list now starts at the top of the column.
- **No extra behaviour:** no `position: sticky` or `fixed`, no animation, no collapse. The markup, `aria-label="Topic progress"` and `data-testid="topic-bar"` stay the same.
- **Tests:** update any test that expects the bar in the chat column. Add one that asserts the chat column (first grid child) does not contain `[data-testid="topic-bar"]` and the right column does.

**Done when:**
- **At 1024×797,** Appendix D-1 reports:
  - `barInRightColumn: true` and `barInChatColumn: false`
  - `messageListTopOffset` ≤ 2
  - `messageListHeight` ≥ 649 (it was 549)
- **At 1512×860 and 768×1024:**
  - no horizontal scroll
  - Case data scrolls under the bar
  - the bar is fully visible
- **The bar behaves the same everywhere:**
  - it's visible in every phase (Story, Concept, Your turn, Check, Reveal, Principle)
  - it doesn't move while the tutor streams
- **Keyboard:**
  - Tab order is: chat, then composer, then topic bar, then Case data.
  - No focused element is ever hidden under another element (WCAG 2.4.11).
- **Screenshots:** before and after at 1024×797 are attached to the PR.
- **Checks:** the check command passes.

**Find it:**
```bash
rg -n 'data-testid="topic-bar"' --glob '!node_modules'
rg -n 'max-h-\[40%\]' --glob '!node_modules'
rg -n 'grid-rows-\[minmax\(0,1fr\)\]' --glob '!node_modules'
```

---

### T-01 · Midnight replaces Dark, and Paper and Forest exist as colour themes
**Label:** `ready-for-agent` · **Depends on:** nothing

**Why:** Today's dark theme is the light theme mirrored along Tailwind's scales: near-black page, 18:1 glare, neon accents and a muddy yellow widget (§2.1). The developer chose Midnight as the new dark theme, plus Paper and Forest as extra themes.

**Change:**
- **Midnight.** In the file that defines the `:root` and `:root.dark` token blocks, replace every colour value in `:root.dark` with **Midnight** (Appendix A). Keep `color-scheme: dark` and any non-colour lines in that block.
- **Paper and Forest.** Add the **Paper** block (`:root[data-theme="paper"]`) and the **Forest** block (`:root.dark[data-theme="forest"]`) exactly as in Appendix A. Put both inside `@media screen { … }`, so the existing print block keeps printing in Light.
- **Complete blocks.** Each block defines all 26 tokens. A theme never inherits colours from another.
- **Leave alone:** `:root` (Light), `--navy-*`, and the print block.
- **The checker.** Add `scripts/check-theme-contrast.mjs` (Appendix C) and set `CSS_PATH` to the tokens file. If the repo writes the selectors differently (e.g. `.dark` instead of `:root.dark`), change the `THEMES` selectors in the script to match. Then add it to the check script, e.g. `"check": "<existing> && node scripts/check-theme-contrast.mjs app/globals.css"`.
- **Nothing else.** Paper and Forest become reachable in T-02.

**Done when:**
- **The checker passes.** `node scripts/check-theme-contrast.mjs <tokens file>` prints `All themes pass.` On today's file it fails: 10 Midnight rules fail and the Paper and Forest blocks are missing.
- **Midnight matches the target.** In dark mode, /study matches the Midnight panel of `img/four-themes-target.png`:
  - page `#1e1e2e`
  - text `#cdd6f4`
  - links `#89b4fa`
  - Sourced-history rule and dot `#fab387`
  - tag `#3c343d` / `#fcc29f`
- **Light is untouched.** Light is pixel-identical before and after. Attach both screenshots.
- **Print stays light.** Print preview of /study uses Light colours.
- **Checks:** the check command passes.

**Find it:**
```bash
rg -n -- '--src-tag:' --glob '*.css' --glob '!node_modules'          # the tokens file
rg -n ':root\.dark|\.dark\s*\{|@custom-variant\s+dark' --glob '*.css' --glob '!node_modules'
```

---

### T-02 · The site follows the Mac by default, and the header menu picks any of the four themes
**Label:** `ready-for-agent` · **Depends on:** T-01

**Why:** Learners get Light by day and Midnight at night without touching anything, and can pin any theme in one click. This is GitHub's day/night model, which the developer chose.

**Change:**
1. **Find today's theme code:**
   - the toggle: `rg -n "Switch dark or light mode"`
   - where `dark` gets onto `<html>` (root layout, e.g. `app/layout.tsx`)
   - where the choice is stored (cookie, `localStorage` or account setting)
2. **Add one theme module** (e.g. `lib/theme.ts`) and use it everywhere:
   ```ts
   export const THEMES = ['light', 'paper', 'midnight', 'forest'] as const;
   export type ThemeId = (typeof THEMES)[number];
   export const THEME_KIND: Record<ThemeId, 'light' | 'dark'> = { light: 'light', paper: 'light', midnight: 'dark', forest: 'dark' };
   export const THEME_LABEL: Record<ThemeId, string> = { light: 'Light', paper: 'Paper', midnight: 'Midnight', forest: 'Forest' };
   export type ThemePref =
     | { mode: 'system'; day: 'light' | 'paper'; night: 'midnight' | 'forest' }
     | { mode: 'single'; theme: ThemeId };
   export const DEFAULT_PREF: ThemePref = { mode: 'system', day: 'light', night: 'midnight' };

   const isTheme = (v: unknown): v is ThemeId => THEMES.includes(v as ThemeId);
   export function parsePref(raw: string | null | undefined): ThemePref {
     if (raw === 'dark') return { mode: 'single', theme: 'midnight' };  // migrate old value
     if (raw === 'light') return { mode: 'single', theme: 'light' };    // migrate old value
     const [mode, a, b] = (raw ?? '').split(':');
     if (mode === 'single' && isTheme(a)) return { mode: 'single', theme: a };
     if (mode === 'system' && (a === 'light' || a === 'paper') && (b === 'midnight' || b === 'forest')) return { mode: 'system', day: a, night: b };
     return DEFAULT_PREF;
   }
   export const serializePref = (p: ThemePref) => (p.mode === 'single' ? `single:${p.theme}` : `system:${p.day}:${p.night}`);
   export const resolveTheme = (p: ThemePref, osDark: boolean): ThemeId => (p.mode === 'single' ? p.theme : osDark ? p.night : p.day);
   export function applyTheme(theme: ThemeId, root: HTMLElement = document.documentElement) {
     const kind = THEME_KIND[theme];
     root.dataset.theme = theme;
     root.classList.toggle('dark', kind === 'dark');
     root.style.colorScheme = kind;
     root.dataset.openuiTheme = kind;
   }
   ```
3. **Storage.** Store `serializePref(pref)` in the **same store** today's toggle uses. If that's a cookie the server reads, the server renders `data-theme` and `dark` for `single` prefs.
4. **No flash.** Put a tiny inline script at the top of `<head>` in the root layout. It must:
   - read the stored value
   - run the same `parsePref` and `resolveTheme` logic, using `matchMedia('(prefers-color-scheme: dark)').matches`
   - set the four attributes the way `applyTheme` does, before first paint

   Keep `suppressHydrationWarning` on `<html>`, and wrap the script body in `try {} catch {}`.
5. **Follow the Mac live.** While `mode === 'system'`, listen for `change` on `matchMedia('(prefers-color-scheme: dark)')` and re-apply the theme.
6. **Header menu.** Replace the "Light mode" toggle, in the same place and with the same text style, by a **Theme** menu button.
   - **Button:** `aria-haspopup="menu"`, `aria-expanded`, accessible name "Theme: <current label>".
   - **Items:** a radio group (`menuitemradio` + `aria-checked`):
     - Match my Mac, with a sub-label from the saved pair, e.g. "Light by day, Midnight at night"
     - Light
     - Paper
     - Midnight
     - Forest

     Each item has a 3-dot swatch: `--bg`, `--ink` and `--brand` of that theme.
   - **Building it:** use the repo's existing menu or popover primitive if there is one. If not, a native `<select>` labelled "Theme" is acceptable.
   - **Keyboard:** Enter, Space or ArrowDown opens. The arrow keys move. Enter selects. Esc closes and returns focus to the button.
7. **Instant and saved.** Picking an item applies it at once (no reload) and saves it. Picking a theme sets `single`. Picking Match my Mac sets `system`, keeping the saved day/night pair (default Light/Midnight).

**Done when:**
- **First visit:** macOS Light opens Light; macOS Dark opens Midnight. Changing the macOS appearance with the page open switches the theme live. DevTools → Rendering → "Emulate prefers-color-scheme" is fine for testing.
- **Every menu item works:** it applies instantly and survives a reload, with no flash of another theme. Check a reload in Performance → Screenshots in every theme.
- **Migration:** a browser that had `dark` saved before this change opens in Midnight; `light` opens in Light.
- **`<html>` always carries:**
  - `data-theme` = the resolved id
  - `class="dark"` only for Midnight and Forest
  - `style="color-scheme: …"` and `data-openui-theme` matching the kind
- **Accessible:** the menu works with the keyboard alone, and VoiceOver announces the checked item.
- **Unit tests** cover:
  - `parsePref`: `dark`, `light`, `single:forest`, `system:paper:forest`, `system:midnight:light` (invalid → default), `''` and garbage
  - `resolveTheme`: both modes, both OS states
- **Checks:** the check command passes.

**Find it:**
```bash
rg -n "Switch dark or light mode|Light mode|Dark mode" --glob '!node_modules'
rg -n "classList|className=.*dark|suppressHydrationWarning|cookies\(\)|localStorage" app src --glob '!node_modules'
```

---

### T-04 · Generative widgets follow the active theme
**Label:** `ready-for-agent` · **Depends on:** T-02

**Why:** OpenUI fills the colours we don't map with its own defaults for `mode`. Its global CSS also follows the Mac unless `data-openui-theme` is set (§2.2). With four themes, a widget must never pick up another theme's colours.

**Change:**
- **Mode.** Find the `ThemeProvider` / `createTheme` usage. Pass `mode={THEME_KIND[resolvedTheme]}` from T-02's theme state. Never read `prefers-color-scheme` or hard-code it.
- **Map the hard-coded keys.** In the overrides object, map these keys to tokens so they're right in every theme. Keep the 46 existing mappings.

  | OpenUI key | Value |
  |---|---|
  | `highlightSubtle` | `color-mix(in srgb, var(--ink) 2%, transparent)` |
  | `highlight` | `color-mix(in srgb, var(--ink) 4%, transparent)` |
  | `highlightStrong` | `color-mix(in srgb, var(--ink) 8%, transparent)` |
  | `highlightIntense` | `color-mix(in srgb, var(--ink) 30%, transparent)` |
  | `invertedBackground` | `var(--ink)` |
  | `chatUserResponseBg` | `var(--bubble)` |
  | `chatUserResponseText` | `var(--ink)` |
  | `borderInteractiveEmphasis` | `color-mix(in srgb, var(--ink) 40%, transparent)` |
  | `textAccentSecondary` | `color-mix(in srgb, var(--brand-ink) 70%, transparent)` |
  | `textAccentTertiary` | `color-mix(in srgb, var(--brand-ink) 40%, transparent)` |

- **Root attribute.** T-02 already puts `data-openui-theme` on `<html>`. Confirm OpenUI's global `:root` defaults now follow the app.

**Done when:**
- **macOS Dark, app on Paper.** On an element `el` inside `.genui`:
  - `getComputedStyle(el).getPropertyValue('--openui-background')` is `#faf4ed`
  - `--openui-highlight` is built from Paper's `--ink` (`#4d4870`)
  - widget cards render light
- **macOS Light, app on Forest:** the same checks give `#2d353b` and Forest's `--ink`.
- **No hard-coded colours remain.** No `--openui-*` colour inside `.genui` is a white- or black-based literal, except `textWhite`, `textBlack` and `overlay`.
- **Checks:** the check command passes.

**Find it:**
```bash
rg -n "ThemeProvider|createTheme|lightTheme|darkTheme|cssSelector|genui" --glob '!node_modules'
```
Docs: [OpenUI ThemeProvider README](https://github.com/thesysdev/openui/blob/main/packages/react-ui/src/components/ThemeProvider/README.md). `mode` is `"light" | "dark"`; `lightTheme` overrides apply to both modes when `darkTheme` is omitted.

---

### T-03 · Settings lets learners choose their day and night themes
**Label:** `ready-for-agent` · **Depends on:** T-02

**Why:** The header menu covers one-click switching. The day/night pairing needs a place to choose both themes.

**Change:** In the Settings page (the header's "Settings" link), add an **Appearance** section:
- **"Theme"** is a radio group: **Match my Mac** / **Always use one theme**.
- **When Match my Mac is chosen:**
  - **Day theme** is a radio group of Light and Paper.
  - **Night theme** is a radio group of Midnight and Forest.
- **When Always use one theme is chosen:** a radio group of the four themes.
- **Option tiles.** Each option is a small preview tile: the theme's `--bg`, a line of `--ink` text and a `--brand` dot. Build it from a small TS map of each theme's three swatch colours (see Notes). Give it a visible label.
- **Shared and instant.** Changes save to the same preference as T-02 and apply instantly.

**Done when:**
- **Pairing works.** Match my Mac with Day = Paper and Night = Forest shows Paper under macOS Light and Forest under macOS Dark, switching live. The header menu's sub-label reads "Paper by day, Forest at night".
- **One theme works.** Always use one theme → Forest shows Forest checked in the header menu, and the reverse also holds.
- **Accessible:** it works with the keyboard alone, and every radio has a label.
- **Checks:** the check command passes.

**Notes:** You can't scope a theme to a tile with `<div data-theme="forest" class="dark">`, because the token selectors start at `:root`. Render each tile with inline styles from a TS map of its three swatch colours, copied from Appendix A. Reuse the same map for the header menu's swatches.

---

### T-05 · Every colour in the Study Workspace comes from a theme token
**Label:** `ready-for-agent` · **Depends on:** T-01

**Why:** A hard-coded colour looks right in one theme and wrong in the other three. "The widget looks wrong in dark mode" usually comes from a colour that bypasses the tokens.

**Change:**
- **Search** the app's source folders (e.g. `app/ components/ src/ lib/`):
  ```bash
  rg -n --glob '*.{tsx,ts,jsx,js,css}' --glob '!**/node_modules/**' \
    -e '#[0-9a-fA-F]{3,8}\b' \
    -e '\b(rgb|rgba|hsl|hsla|oklch|oklab)\(' \
    -e '\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|accent|caret|shadow|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?\b' \
    -e '\bdark:'
  ```
- **Replace** each hit in Study Workspace code and the widget library with the matching token, e.g. `text-[var(--src)]`, `bg-[var(--field)]`, `border-[var(--border)]`, SVG `fill="var(--src)"`.
- **Remove** `dark:` variants that only swap one colour for another. The tokens already switch.
- **Allowed to stay:**
  - the tokens file and the print block
  - `transparent`, `currentColor`, `inherit`
  - logos and brand marks
  - `--navy-*` usages: check them in all four themes; if one looks wrong, list it in the PR and leave it

**Done when:**
- **The search is clean.** It returns only allowed lines, and the PR description lists them.
- **The colour scan is clean.** Appendix D-2 on /study prints `clean` in Midnight and in Forest.
- **Checks:** the check command passes.

---

### T-07 · Increase Contrast makes text crisper in every theme
**Label:** `needs-triage` (optional) · **Depends on:** T-01

**Why:** Apple's guidance is to test with Increase Contrast. Learners who turn it on want firmer text and borders.

**Change:**
- **Overrides.** Add `@media (prefers-contrast: more)` overrides per theme, with the same selectors as Appendix A. Define only these three tokens, and never `--bg`, so the checker keeps reading the base blocks. This is the one allowed change to Light, and it applies only under Increase Contrast.

  | Theme | `--ink` | `--muted` | `--border` |
  |---|---|---|---|
  | Light | `#0c0a09` (18.9:1) | `#57534d` (7.3:1) | `#8a837c` (3.6:1) |
  | Paper | `#2f2a52` (12.2:1) | `#4d4868` (7.9:1) | `#8f8886` (3.2:1) |
  | Midnight | `#eef1fd` (14.6:1) | `#c3c9e3` (10.0:1) | `#7f849c` (4.4:1) |
  | Forest | `#fbf8f0` (11.8:1) | `#d0d7ce` (8.5:1) | `#859289` (3.8:1) |

- **Optional bold tweak.** In dark themes only, if bold body text renders at 700, use `font-weight: 600` for `.dark :where(strong, b)`. Light bold text looks heavier on dark (NN/g).

**Done when:**
- **Each theme gets its overrides.** With macOS → Accessibility → Display → Increase contrast (or DevTools emulation of `prefers-contrast: more`), each theme uses the values above.
- **The checker still passes.**
- **Light without Increase Contrast** is unchanged.

---

### T-08 · Preview check: four themes and the moved topic bar
**Label:** `ready-for-agent` · **Depends on:** T-01, T-02, T-03, T-04, T-05, T-06

**Why:** Catch anything the unit-level checks miss before the developer reads for hours in these themes.

**Change:** No code. On the Vercel preview of the last PR (or `main` after merging), check the full matrix:

- **Viewports:** 1512×860 (14-inch MacBook, maximised Chrome), 1024×797, and 768×1024.
- **Themes:** Light, Paper, Midnight and Forest. Also Match my Mac under both macOS appearances; Playwright's `page.emulateMedia({ colorScheme })` is fine.
- **Pages:**
  - /study in the Story phase and in one Check phase
  - the header Theme menu, open
  - Settings → Appearance
  - Course Map, to catch colours outside the workspace

**Done when:**
- **Screenshots** for every cell of the matrix are attached to this issue, next to `img/four-themes-target.png`.
- **Scripts:**
  - Appendix D-1 passes (T-06 numbers).
  - Appendix D-2 prints `clean` in Midnight and Forest.
  - `node scripts/check-theme-contrast.mjs` passes.
- **No flash:** reloading in each theme never shows another theme.
- **Print:** print preview is Light in every theme.
- **Keyboard:** switching themes works with the keyboard alone, and focus rings are visible in all four themes.
- **Differences:** every difference from the target becomes a new issue labelled `needs-triage`, linked to the parent.

---

## Appendix A · Theme CSS (paste-ready; hex is canonical)

Light (`:root`) and the print block stay exactly as they are. Verified: these blocks, together with today's `:root`, pass every rule in Appendix C.

```css
/* ── Midnight: REPLACES the values in the existing `:root.dark` block (keep its other lines). ──
   Dark kind. After Catppuccin Mocha (MIT licence). Everyone on "dark" today lands here. */
:root.dark {
  color-scheme: dark;
  --bg: #1e1e2e;              /* page background */
  --field: #252536;           /* inputs, cards, popovers (one step up) */
  --bubble: #313244;          /* learner message bubble */
  --hairline: #313244;        /* dividers, hover fills */
  --border: #45475a;          /* borders */
  --data: #45475a;            /* neutral chart data */
  --muted: #a6adc8;           /* secondary text */
  --ink: #cdd6f4;             /* body text */
  --brand: #89b4fa;           /* links, primary button, active step */
  --brand-hover: #9ac0fc;     /* primary hover */
  --brand-pressed: #789bd8;   /* primary pressed */
  --ring: #89b4fa;            /* focus ring */
  --brand-ink: #1e1e2e;       /* text on brand fills */
  --brand-tint: #2c3047;      /* active-step chip, info background */
  --brand-line: #465579;      /* border of brand-tinted controls */
  --you: #94e2d5;             /* learner accent (text, chart) */
  --you-line: #94e2d5;        /* learner left rule */
  --you-tint: #94e2d512;      /* learner card tint (alpha) */
  --you-tag: #2f3946;         /* learner tag background */
  --you-tag-ink: #abe8dd;     /* learner tag text */
  --src: #fab387;             /* sourced-history accent (text, chart) */
  --src-line: #fab387;        /* sourced-history left rule */
  --src-tint: #fab38712;      /* sourced-history card tint (alpha) */
  --src-tag: #3c343d;         /* "Sourced history" tag background */
  --src-tag-ink: #fcc29f;     /* "Sourced history" tag text */
  --danger: #f38ba8;          /* errors */
}

/* Paper and Forest only apply on screen, so the existing print block keeps printing in Light. */
@media screen {
  /* ── Paper: NEW. Light kind (no .dark class). After Rosé Pine Dawn (MIT licence). ── */
  :root[data-theme="paper"] {
    color-scheme: light;
    --bg: #faf4ed;              /* page background */
    --field: #fffaf3;           /* inputs, cards, popovers (one step up) */
    --bubble: #f2e9e1;          /* learner message bubble */
    --hairline: #f2e9e1;        /* dividers, hover fills */
    --border: #dfdad9;          /* borders */
    --data: #dfdad9;            /* neutral chart data */
    --muted: #66617f;           /* secondary text */
    --ink: #4d4870;             /* body text */
    --brand: #286983;           /* links, primary button, active step */
    --brand-hover: #20576e;     /* primary hover */
    --brand-pressed: #1a495c;   /* primary pressed */
    --ring: #286983;            /* focus ring */
    --brand-ink: #fffaf3;       /* text on brand fills */
    --brand-tint: #e5e6e2;      /* active-step chip, info background */
    --brand-line: #b1c2c8;      /* border of brand-tinted controls */
    --you: #376c76;             /* learner accent (text, chart) */
    --you-line: #56949f;        /* learner left rule */
    --you-tint: #56949f14;      /* learner card tint (alpha) */
    --you-tag: #dde2df;         /* learner tag background */
    --you-tag-ink: #2f5f68;     /* learner tag text */
    --src: #94580f;             /* sourced-history accent (text, chart) */
    --src-line: #ea9d34;        /* sourced-history left rule */
    --src-tint: #ea9d3414;      /* sourced-history card tint (alpha) */
    --src-tag: #f8e5cf;         /* "Sourced history" tag background */
    --src-tag-ink: #7d4a12;     /* "Sourced history" tag text */
    --danger: #a24f68;          /* errors */
  }

  /* ── Forest: NEW. Dark kind (.dark class is present too). After Everforest (MIT licence). ── */
  :root.dark[data-theme="forest"] {
    color-scheme: dark;
    --bg: #2d353b;              /* page background */
    --field: #343f44;           /* inputs, cards, popovers (one step up) */
    --bubble: #3d484d;          /* learner message bubble */
    --hairline: #3d484d;        /* dividers, hover fills */
    --border: #4f585e;          /* borders */
    --data: #4f585e;            /* neutral chart data */
    --muted: #b3bcb2;           /* secondary text */
    --ink: #eae2cf;             /* body text */
    --brand: #7fbbb3;           /* links, primary button, active step */
    --brand-hover: #93c5be;     /* primary hover */
    --brand-pressed: #72a5a0;   /* primary pressed */
    --ring: #7fbbb3;            /* focus ring */
    --brand-ink: #232a2e;       /* text on brand fills */
    --brand-tint: #38464a;      /* active-step chip, info background */
    --brand-line: #4d6768;      /* border of brand-tinted controls */
    --you: #a7c080;             /* learner accent (text, chart) */
    --you-line: #a7c080;        /* learner left rule */
    --you-tint: #a7c08012;      /* learner card tint (alpha) */
    --you-tag: #3e4946;         /* learner tag background */
    --you-tag-ink: #b8cd9a;     /* learner tag text */
    --src: #dbbc7f;             /* sourced-history accent (text, chart) */
    --src-line: #dbbc7f;        /* sourced-history left rule */
    --src-tint: #dbbc7f12;      /* sourced-history card tint (alpha) */
    --src-tag: #464947;         /* "Sourced history" tag background */
    --src-tag-ink: #e2c999;     /* "Sourced history" tag text */
    --danger: #eb8c8e;          /* errors */
  }
}
```

---

## Appendix B · Contrast, before and after

WCAG 2 contrast ratios (APCA 0.0.98G-4g for the Lc row), computed with the same maths as Appendix C. Translucent tints are composited over `--bg`.

| Pair | Dark today | Paper | Midnight | Forest |
|---|---|---|---|---|
| Body text (`--ink` on `--bg`) | 18.1:1 | 7.8:1 | 11.3:1 | 9.7:1 |
| Body text on cards/inputs (`--ink` on `--field`) | 16.0:1 | 8.2:1 | 10.4:1 | 8.4:1 |
| Secondary text (`--muted` on `--bg`) | 7.6:1 | 5.4:1 | 7.4:1 | 6.4:1 |
| Links, "Tutor" label (`--brand` on `--bg`) | 7.1:1 | 5.6:1 | 7.8:1 | 5.7:1 |
| Send button label (`--brand-ink` on `--brand`) | 7.1:1 | 5.9:1 | 7.8:1 | 6.7:1 |
| Learner accent (`--you` on `--bg`) | 10.6:1 | 5.4:1 | 11.0:1 | 6.2:1 |
| Sourced-history accent (`--src` on `--bg`) | 11.5:1 | 5.3:1 | 9.3:1 | 6.8:1 |
| "Sourced history" tag (`--src-tag-ink` on `--src-tag`) | 12.1:1 | 6.0:1 | 7.6:1 | 5.7:1 |
| Learner tag (`--you-tag-ink` on `--you-tag`) | 11.5:1 | 5.4:1 | 8.5:1 | 5.4:1 |
| Errors (`--danger` on `--bg`) | 6.8:1 | 5.0:1 | 7.1:1 | 5.2:1 |
| Focus ring (`--ring` on `--bg`) | 8.9:1 | 5.6:1 | 7.8:1 | 5.7:1 |
| Body text, APCA | Lc 101 | Lc 83 | Lc 80 | Lc 83 |
| Page lightness (OKLCH L) | 0.15 | 0.97 | 0.24 | 0.32 |
| Highest accent chroma (OKLCH C) | 0.189 | 0.113 | 0.130 | 0.116 |

---

## Appendix C · `scripts/check-theme-contrast.mjs`

Zero dependencies, Node 18+. Shipped next to this spec as a file; the copy below is identical. Tested three ways:
- on Appendix A: `All themes pass.`, 111 rules
- on today's CSS: fails, with 10 Midnight rules and the two missing blocks
- on the same themes written in `oklch()`: passes

```js
// scripts/check-theme-contrast.mjs
// Zero-dependency guard for the four colour themes. Run: node scripts/check-theme-contrast.mjs [path/to/tokens.css]
// Exits 1 if any rule fails. Rules come from docs/specs/2026-11-04-themes-and-topic-bar.md (T-01).
import { readFileSync } from 'node:fs';

const CSS_PATH = process.argv[2] ?? 'app/globals.css'; // <-- the file that defines the :root token blocks

const TOKENS = ['bg', 'field', 'bubble', 'hairline', 'border', 'data', 'muted', 'ink', 'brand', 'brand-hover', 'brand-pressed', 'ring', 'brand-ink', 'brand-tint', 'brand-line',
  'you', 'you-line', 'you-tint', 'you-tag', 'you-tag-ink', 'src', 'src-line', 'src-tint', 'src-tag', 'src-tag-ink', 'danger'];

// Light is frozen: its values must not change.
const LIGHT_FROZEN = { bg: '#fafaf9', field: '#ffffff', bubble: '#e7e5e4', hairline: '#e7e5e4', border: '#d6d3d1', data: '#d6d3d1', muted: '#79716b', ink: '#1c1917',
  brand: '#002366', 'brand-hover': '#001e57', 'brand-pressed': '#00184a', ring: '#002366', 'brand-ink': '#ffffff', 'brand-tint': '#f0f5ff', 'brand-line': '#c2cde2',
  you: '#00786f', 'you-line': '#009689', 'you-tint': '#f5fcf9', 'you-tag': '#cbfbf1', 'you-tag-ink': '#0b4f4a',
  src: '#e17100', 'src-line': '#fe9a00', 'src-tint': '#fdfbf2', 'src-tag': '#fef3c6', 'src-tag-ink': '#7b3306', danger: '#c10007' };

const THEMES = [
  { id: 'light', kind: 'light', selector: ':root', frozen: LIGHT_FROZEN },
  { id: 'paper', kind: 'light', selector: ':root[data-theme="paper"]' },
  { id: 'midnight', kind: 'dark', selector: ':root.dark' },
  { id: 'forest', kind: 'dark', selector: ':root.dark[data-theme="forest"]' },
];

// ---------- parsing ----------
const norm = s => s.replace(/\s+/g, '').replace(/'/g, '"');
function block(css, selector) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (norm(m[1]) === norm(selector) && /--bg\s*:/.test(m[2])) {
      const t = {};
      for (const d of m[2].matchAll(/--([\w-]+)\s*:\s*([^;]+);?/g)) t[d[1]] = d[2].trim();
      return t;
    }
  }
  return null;
}
const NAMED = { white: '#ffffff', black: '#000000' };
function parseColor(v) {
  v = (NAMED[v] ?? v ?? '').trim();
  let m = v.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const n = i => parseInt(h.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
  }
  m = v.match(/^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/i);
  if (m) {
    const L = m[2] ? +m[1] / 100 : +m[1];
    const a = m[5] === undefined ? 1 : (m[6] ? +m[5] / 100 : +m[5]);
    return { ...oklchToRgb(L, +m[3], +m[4]), a };
  }
  return null; // var(), color-mix() etc. are not resolved here: tokens must be literal colours
}
// ---------- colour maths (WCAG 2, APCA 0.0.98G-4g, OKLCH) ----------
const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const unlin = c => { c = Math.min(1, Math.max(0, c)); return Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)); };
function oklchToRgb(L, C, H) {
  const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return { r: unlin(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), g: unlin(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), b: unlin(-0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s) };
}
function oklch({ r, g, b }) {
  [r, g, b] = [r, g, b].map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return { L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, C: Math.hypot(1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s) };
}
const over = (fg, bg) => fg.a >= 1 ? fg : { r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)), g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)), b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)), a: 1 };
const lum = ({ r, g, b }) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const wcag = (x, y) => { const [h, l] = [lum(x), lum(y)].sort((p, q) => q - p); return (h + 0.05) / (l + 0.05); };
function apca(txt, bg) {
  const Y = ({ r, g, b }) => 0.2126729 * (r / 255) ** 2.4 + 0.7151522 * (g / 255) ** 2.4 + 0.0721750 * (b / 255) ** 2.4;
  let yt = Y(txt), yb = Y(bg);
  if (yt < 0.022) yt += (0.022 - yt) ** 1.414; if (yb < 0.022) yb += (0.022 - yb) ** 1.414;
  if (Math.abs(yb - yt) < 0.0005) return 0;
  if (yb > yt) { const s = (yb ** 0.56 - yt ** 0.57) * 1.14; return s < 0.1 ? 0 : (s - 0.027) * 100; }
  const s = (yb ** 0.65 - yt ** 0.62) * 1.14; return s > -0.1 ? 0 : (s + 0.027) * 100;
}
// ---------- rules ----------
const TEXT = [ // [fg, bg, minimum WCAG ratio]
  ['ink', 'bg', 7], ['ink', 'field', 7], ['ink', 'bubble', 7], ['ink', 'src-tint', 7], ['ink', 'you-tint', 7],
  ['muted', 'bg', 4.5], ['muted', 'field', 4.5], ['muted', 'hairline', 4.5], ['muted', 'src-tint', 4.5], ['muted', 'you-tint', 4.5],
  ['brand', 'bg', 4.5], ['brand', 'field', 4.5], ['brand', 'brand-tint', 4.5], ['brand-ink', 'brand', 4.5],
  ['you', 'bg', 4.5], ['src', 'bg', 4.5], ['danger', 'bg', 4.5], ['you-tag-ink', 'you-tag', 4.5], ['src-tag-ink', 'src-tag', 4.5],
];
const css = readFileSync(CSS_PATH, 'utf8');
const fails = [];
const out = [];
const check = (ok, msg) => { out.push(`  ${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) fails.push(msg); };

for (const th of THEMES) {
  out.push(`\n[${th.id}] ${th.selector}`);
  const raw = block(css, th.selector);
  if (!raw) { check(false, `${th.id}: no "${th.selector} { --bg: … }" block in ${CSS_PATH}`); continue; }
  const C = {};
  for (const k of TOKENS) { C[k] = parseColor(raw[k]); if (!C[k]) check(false, `${th.id}: --${k} is missing or not a literal colour ("${raw[k]}")`); }
  if (TOKENS.some(k => !C[k])) continue;
  const bg = C.bg, S = k => over(C[k], bg);
  if (th.frozen) { // Light must stay exactly as it is today
    for (const [k, v] of Object.entries(th.frozen)) { const a = S(k), b = parseColor(v); check(a.r === b.r && a.g === b.g && a.b === b.b, `${th.id}: --${k} is unchanged (${v})`); }
    continue;
  }
  for (const [f, b, min] of TEXT) { const r = wcag(S(f), S(b)); check(r >= min, `${th.id}: --${f} on --${b} ${r.toFixed(2)}:1 (min ${min})`); }
  { const r = wcag(S('ring'), bg); check(r >= 3, `${th.id}: --ring vs --bg ${r.toFixed(2)}:1 (min 3, focus must be visible)`); }
  const L = k => oklch(S(k)).L;
  if (th.kind === 'dark') {
    const r = wcag(S('ink'), bg), lc = Math.abs(apca(S('ink'), bg));
    check(r >= 9 && r <= 15, `${th.id}: body text --ink on --bg ${r.toFixed(2)}:1 is between 9 and 15 (readable, no glare)`);
    check(lc >= 75, `${th.id}: body text APCA Lc ${lc.toFixed(1)} (min 75)`);
    check(L('bg') >= 0.2 && L('bg') <= 0.34, `${th.id}: --bg OKLCH lightness ${L('bg').toFixed(3)} is within 0.20–0.34 (never near-black)`);
    check(L('bg') < L('field') && L('field') < L('hairline') && L('hairline') < L('border'), `${th.id}: surfaces get lighter as they rise (bg < field < hairline < border)`);
    for (const k of ['brand', 'you', 'you-line', 'src', 'src-line', 'danger']) { const c = oklch(S(k)).C; check(c <= 0.135, `${th.id}: --${k} chroma ${c.toFixed(3)} (max 0.135, no neon)`); }
    for (const k of ['you-tint', 'src-tint']) check(C[k].a <= 0.1, `${th.id}: --${k} alpha ${C[k].a.toFixed(2)} (max 0.10)`);
  } else {
    check(L('field') >= L('bg') && L('bg') > L('hairline') && L('hairline') > L('border'), `${th.id}: light surfaces order (field ≥ bg > hairline > border)`);
  }
}
console.log(out.join('\n'));
if (fails.length) { console.error(`\n${fails.length} theme rule(s) failed in ${CSS_PATH}`); process.exit(1); }
console.log(`\nAll themes pass.`);
```

---

## Appendix D · Browser console checks

Paste into the DevTools console on `/study`.

### D-1 · Topic bar position (T-06, T-08)

```js
(() => {
  const grid = document.querySelector('main .grid');
  const [chat, right] = grid.children;
  const bar = document.querySelector('[data-testid="topic-bar"]');
  const list = [...chat.children].find(el => getComputedStyle(el).overflowY === 'auto' && !el.contains(bar));
  const g = grid.getBoundingClientRect(), l = list.getBoundingClientRect();
  return { viewport: `${innerWidth}x${innerHeight}`, barInRightColumn: right.contains(bar), barInChatColumn: chat.contains(bar),
           messageListTopOffset: Math.round(l.top - g.top), messageListHeight: Math.round(l.height) };
})()
```
- **Today (1024×797):** `barInRightColumn: false`, `barInChatColumn: true`, `messageListTopOffset: 110`, `messageListHeight: 549`.
- **After T-06:** `true`, `false`, ≤ 2, ≥ 649.

### D-2 · Stray-colour scan (T-05, T-08; run in Midnight and in Forest)

Wait about a second after switching themes before you run it, because some elements animate their colour change.

```js
(() => {
  const cv = document.createElement('canvas'); cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const rgba = s => { cx.clearRect(0, 0, 1, 1); cx.fillStyle = '#000'; cx.fillStyle = s; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2], d[3] / 255]; };
  const lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const oklch = ([r, g, b]) => { [r, g, b] = [r, g, b].map(lin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return { L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, C: Math.hypot(1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s) }; };
  const hits = new Map();
  const note = (k, el) => { const h = hits.get(k) ?? { n: 0, eg: `${el.tagName.toLowerCase()} "${el.textContent.trim().slice(0, 24)}"` }; h.n++; hits.set(k, h); };
  for (const el of [document.documentElement, document.body, ...document.querySelectorAll('body *')]) {
    if (!el.getClientRects().length) continue;
    const cs = getComputedStyle(el), svg = el instanceof SVGElement;
    for (const [kind, val] of [['background', cs.backgroundColor], ['text', el.childElementCount ? null : cs.color], ['fill', svg ? cs.fill : null], ['stroke', svg ? cs.stroke : null]]) {
      if (!val || val === 'none' || val.startsWith('url')) continue;
      const c = rgba(val); if (c[3] < 0.5) continue;
      const { L, C } = oklch(c);
      if (kind === 'background' && L < 0.2) note(`near-black ${kind} rgb(${c.slice(0, 3)}) L=${L.toFixed(2)}`, el);
      if (C > 0.135) note(`neon ${kind} rgb(${c.slice(0, 3)}) C=${C.toFixed(3)}`, el);
    }
  }
  return hits.size ? [...hits].map(([k, v]) => `${k} ×${v.n}, e.g. ${v.eg}`).join('\n') : 'clean';
})()
```
- **Today, in Dark,** it reports:
  - a near-black `rgb(12,10,9)` page
  - neon `rgb(102,153,255)` links and Send button
  - a neon `rgb(255,185,0)` chart line and dot
- **After T-01 and T-05,** it must print `clean` in Midnight and Forest.

---

## Appendix E · Creating the issues with `gh`

Run inside the repo. `gh` fills in `{owner}` and `{repo}` itself.

```bash
gh label create ready-for-agent --color 0E8A16 --description "Fully specified; an agent can implement it" 2>/dev/null || true
gh label create needs-triage   --color FBCA04 --description "Needs a decision before work starts"     2>/dev/null || true

# 1. Parent issue: title = this file's H1, body = sections 1–5 saved to parent.md
PARENT=$(gh issue create --title "A learner reads the tutor for hours without glare, in the theme they like, with nothing crowding the chat" \
  --body-file parent.md | grep -oE '[0-9]+$')

# 2. One sub-issue per ticket: body = the ticket text from **Why** to **Done when** (+ Find it / Notes), saved to t-0x.md
add_ticket () {  # $1 = title, $2 = label, $3 = body file
  local N ID
  N=$(gh issue create --title "$1" --label "$2" --body-file "$3" | grep -oE '[0-9]+$')
  ID=$(gh api "repos/{owner}/{repo}/issues/$N" --jq .id)
  gh api --method POST "repos/{owner}/{repo}/issues/$PARENT/sub_issues" -F sub_issue_id="$ID" > /dev/null
  echo "#$N  $1"
}
add_ticket "The topic bar sits at the top of the right column, and the chat gets the full height" ready-for-agent t-06.md
add_ticket "Midnight replaces Dark, and Paper and Forest exist as colour themes"                ready-for-agent t-01.md
add_ticket "The site follows the Mac by default, and the header menu picks any of the four themes" ready-for-agent t-02.md
add_ticket "Generative widgets follow the active theme"                                          ready-for-agent t-04.md
add_ticket "Settings lets learners choose their day and night themes"                            ready-for-agent t-03.md
add_ticket "Every colour in the Study Workspace comes from a theme token"                        ready-for-agent t-05.md
add_ticket "Increase Contrast makes text crisper in every theme"                                 needs-triage    t-07.md
add_ticket "Preview check: four themes and the moved topic bar"                                  ready-for-agent t-08.md
```

---

## Appendix F · Docs worth reading

**Dark mode and theming**
- [Apple HIG: Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode.md): dark colours aren't inversions; 4.5:1 minimum, 7:1 for small text; base vs elevated backgrounds; test with Increase Contrast.
- [Material: Design a dark theme (codelab)](https://codelabs.developers.google.com/codelabs/design-material-darktheme/) and [Material dark theme](https://m2.material.io/design/color/dark-theme): `#121212` surfaces, lighter elevated surfaces, desaturated accents, 87 % / 60 % / 38 % text emphasis.
- [NN/g: Dark Mode, how users think about it and issues to avoid](https://www.nngroup.com/articles/dark-mode-users-issues/): pure black, saturated colours, swallowed dividers; respect system settings; honest research on eye strain.
- [Hello darkness, my old friend (Thomas Steiner, web.dev)](https://dev.to/chromiumdev/hello-darkness-my-old-friend-3jcg): `color-scheme`, no flash, semantic custom properties, no pure white.

**CSS mechanics**
- [MDN: light-dark()](https://developer.mozilla.org/en-us/docs/web/css/color_value/light-dark) and [Stefan Judis: light-dark() isn't the same as prefers-color-scheme](https://www.stefanjudis.com/today-i-learned/light-dark-isnt-the-same-as-prefers-color-scheme/): why media-query styles ignore a manual toggle.
- [Tailwind CSS: dark mode](https://github.com/tailwindlabs/tailwindcss.com/blob/main/src/docs/dark-mode.mdx): class-based `dark:` and the three-way toggle script in `<head>`.
- [Radix Colors: understanding the scale](https://radix-ui.com/colors/docs/palette-composition/understanding-the-scale): what each step of a 12-step scale is for, in light and dark.

**Contrast**
- [APCA Bronze simple mode](https://a11yreadtech.github.io/ARC/tests/bronze-simple-mode): Lc 90 preferred for body text, Lc 75 minimum, Lc 60 for other content text.

**Switching themes**
- [GitHub: managing your theme settings](https://docs.github.com/en/enterprise-server@3.15/get-started/accessibility/managing-your-theme-settings): follow the system with a chosen day and night theme.
- [Apple Books: themes](https://support.apple.com/guide/books/ibks8923126d): named reading themes plus Light / Dark / Automatic backgrounds.

**Palettes**
- [Catppuccin](https://ctan.csail.mit.edu/macros/latex/contrib/catppuccinpalette/catppuccinpalette.pdf) · [Rosé Pine](https://docs.rs/crate/chromata/1.0.0/source/src/popular/rose_pine.rs) ([npm](https://www.npmjs.com/package/@rose-pine/palette)) · [Everforest](https://deepwiki.com/sainnhe/everforest/2-color-palette) · [Nord](https://www.nordtheme.com/docs/colors-and-palettes) · [Solarized](https://en.wikipedia.org/wiki/Solarized)

**Widgets**
- [OpenUI ThemeProvider](https://github.com/thesysdev/openui/blob/main/packages/react-ui/src/components/ThemeProvider/README.md): `mode`, `lightTheme`, `darkTheme`, `cssSelector` and the token reference.

**Layout**
- [NN/g: Sticky headers](https://www.nngroup.com/articles/sticky-headers/) · [Smashing: Sticky menus UX guidelines](https://www.smashingmagazine.com/2023/05/sticky-menus-ux-guidelines/) · [WCAG 2.4.11 Focus Not Obscured](https://kb.daisy.org/publishing/docs/wcag/focus-not-obscured-minimum.html)

