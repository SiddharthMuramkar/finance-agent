import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CHART_SERIES, CHART_SURFACES } from "@/widgets/genui-theme";

// Issue #457, spec 2026-11-05 §4 rule 4, §6.2 and Appendix A.3 (WCAG 2.2 SC 1.4.11), seam S7. An accent fill needs 3:1
// against its surface only when colour alone carries its meaning; a decorative fill, or one always paired with a text label
// or an icon, is exempt. The fills are --mint, --coral, --sun and --violet, plus --you-line and --src-line, which are the
// mint and sunflower fills under their older names. This inventory holds every place src/ paints one, with its verdict. A
// new use changes its file's count, so this test fails until someone decides: decorative, paired, or colour-only. A
// colour-only use should gain a label or an icon; if it cannot, its [fill, surface] goes into COLOUR_ONLY in
// scripts/check-theme-contrast.mjs, which then checks it at 3:1 in both themes. The kit's chart series are colour-only
// (review C1): their tokens, CHART_SERIES in src/widgets/genui-theme.tsx, are listed there on each chart surface.

type Verdict = "decorative" | "paired" | "colour-only";
type Use = { uses: number; verdict: Verdict; why: string; pairs?: [string, string][] };

const INVENTORY: Record<string, Use> = {
  "src/app/globals.css": {
    uses: 13,
    verdict: "paired",
    why: "Name mappings for Tailwind (--color-*) and OpenUI (--openui-border-*), which paint nothing by themselves, and the dot of each toned Tag, whose words always say the status",
  },
  "src/app/course/course-map-view.tsx": { uses: 1, verdict: "paired", why: "A passed Check's bar segment; the row says \"n of m\" in text beside the bar and each segment has a Passed or Not passed yet title" },
  "src/app/course/jump-button.tsx": { uses: 1, verdict: "decorative", why: "Sunflower frame of the prerequisite box; its sentence and two labelled buttons say everything" },
  "src/app/quiz-panel.tsx": { uses: 1, verdict: "paired", why: "Mint border of a right answer, with a check mark and the word Correct; a wrong one has a cross" },
  "src/app/topic-complete-card.tsx": { uses: 1, verdict: "paired", why: "Mint border of the Topic complete card, always with the mint-ink \"Topic complete ✓\" eyebrow and the card's title (#479)" },
  "src/app/ui.tsx": { uses: 2, verdict: "paired", why: "Provenance box rule (mint for you, sunflower for sourced), always with the \"Your assumption\" or \"Sourced\" Tag" },
  "src/app/widget-panel.tsx": { uses: 1, verdict: "paired", why: "Sunflower rule of the sourced strip, which starts with the Sourced Tag" },
  "src/widgets/case-data-view.tsx": { uses: 3, verdict: "paired", why: "Sourced and assumption rules, each block led by the Sourced or Your assumption Tag" },
  "src/widgets/formula-card-view.tsx": {
    uses: 2,
    verdict: "paired",
    why: "Underline of a filled-in value by origin; the symbol table below repeats each value with its Your assumption or Sourced Tag",
  },
  "src/widgets/genui-theme.tsx": {
    uses: 3,
    verdict: "colour-only",
    why: "The three counted uses are OpenUI's success, alert and danger borders, which are paired: only danger paints, on labelled destructive buttons, an input error (whose own border is coral-ink, 5.5:1) and a tool error (icon and text). The kit's chart series are colour-only: a series mark is needed to read the chart and a legend does not exempt it, so every CHART_SERIES token is checked at 3:1 on each chart surface (review C1)",
    pairs: CHART_SERIES.flatMap((series) => CHART_SURFACES.map((surface): [string, string] => [series, surface])),
  },
  "src/widgets/primitives/wave1/breakeven.tsx": {
    uses: 1,
    verdict: "paired",
    why: "Swatch before the sourced marker's line, which always names it in words (\"Sourced\" when the model gives no markerLabel; parts.test.tsx checks it)",
  },
  "src/widgets/primitives/wave1/quick-check.tsx": { uses: 1, verdict: "paired", why: "Border of the right option, with a check icon and the feedback line; a wrong pick gets a cross" },
  "src/widgets/primitives/wave1/tones.ts": {
    uses: 2,
    verdict: "paired",
    why: "The rule of a you or src Stat, its only consumer; the Stat also shows the 'From your inputs' or 'Sourced' Tag (issue #457)",
  },
  "src/widgets/primitives/wave1/track.tsx": { uses: 1, verdict: "paired", why: "The sourced tick on a track, used by Breakeven only, which always labels it in words below the track, \"Sourced\" at the least" },
  "src/widgets/primitives/wave3/choice-cards.tsx": { uses: 2, verdict: "paired", why: "Lip of a right or wrong card, with a check or cross on the card and \"Yes\" or the fix in the status line" },
  "src/widgets/primitives/wave3/headline.tsx": { uses: 2, verdict: "decorative", why: "Sunflower top border and rule of the front page: the story colour as decoration around the headline text" },
  "src/widgets/primitives/wave3/lingo-card.tsx": { uses: 6, verdict: "paired", why: "Violet front (the Lingo Tag says it), sunflower back (the In the story Tag says it), and the decorative peek and stickers" },
  "src/widgets/primitives/wave3/money-jar.tsx": {
    uses: 7,
    verdict: "paired",
    why: "Mint when the jar fills, coral when it drains; the words line says the size, drained places are dashed outlines and new objects are counted on screen",
  },
  "src/widgets/primitives/wave3/myth-or-fact.tsx": {
    uses: 5,
    verdict: "paired",
    why: "Verdict border with a check or cross and \"Right\" or \"Not quite: it is a fact\"; the Myth and Fact buttons are labelled; the open card's sunflower top is decoration",
  },
  "src/widgets/primitives/wave3/story-scene.tsx": { uses: 1, verdict: "decorative", why: "Sunflower frame of the story stage around the cast and the speech bubble" },
  "src/widgets/primitives/wave3/timeline-strip.tsx": {
    uses: 4,
    verdict: "paired",
    why: "Sunflower ring of an open moment (a locked one is dashed with a ? icon), the solid story line (dashed after the date) and the label card's frame",
  },
  "src/widgets/primitives/wave3/two-paths.tsx": { uses: 4, verdict: "decorative", why: "Both paths are sunflower, so the colour tells nothing apart; names, choices and outcome lines are text" },
};

// A fill is painted three ways: var(--mint) (also inside bg-[var(--mint)]); the bg-(--mint) shorthand; or a Tailwind 4
// utility named after the --color-* mapping in globals.css (bg-mint, border-t-sun, hover:fill-coral/40, from-violet, …). A
// name that runs on (mint-ink, sun-tag, coral-tint) is another token, not a fill.
const NAMES = "(?:mint|coral|sun|violet|you-line|src-line)";
const UTILITY = "(?:bg|text|fill|stroke|ring|ring-offset|inset-ring|outline|border(?:-[xytrblse])?|divide|from|via|to|decoration|shadow|inset-shadow|accent|caret|placeholder)";
const FILL = new RegExp(`(?:var)?\\(--${NAMES}\\)|(?<![\\w-])${UTILITY}-${NAMES}(?![\\w-])`, "g");
const SRC = join(process.cwd(), "src");

/** How many times `text` paints an accent fill. */
function fillUses(text: string): number {
  return text.match(FILL)?.length ?? 0;
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Each source file that paints an accent fill, with how many times. */
function found(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of sources(SRC)) {
    const n = fillUses(readFileSync(file, "utf8"));
    if (n) counts[relative(process.cwd(), file)] = n;
  }
  return counts;
}

describe("accent fills and the 3:1 rule", () => {
  // Issue #457, review T1: Tailwind 4 utilities and the bg-(--token) shorthand paint the same fills as var(--token).
  it("counts a fill however it is written: var(), a Tailwind utility, or the (--token) shorthand", () => {
    expect(fillUses('<span className="h-2 w-2 rounded-full bg-coral" />')).toBe(1);
    expect(fillUses('className="border-l-4 border-you-line hover:bg-src-line/40 fill-mint stroke-violet ring-sun outline-coral"')).toBe(6);
    expect(fillUses('className="from-mint via-sun to-coral decoration-violet border-t-sun text-violet"')).toBe(6);
    expect(fillUses('className="bg-(--mint) bg-[var(--coral)]" style={{ color: "var(--sun)" }}')).toBe(3);
    expect(fillUses('className="bg-mint-tint text-coral-ink border-sun-tag bg-(--violet-ink) var(--mint-ink) bg-you"')).toBe(0);
  });

  it("has a verdict for every accent fill in src", () => {
    const expected = Object.fromEntries(Object.entries(INVENTORY).map(([file, use]) => [file, use.uses]));
    expect(found()).toEqual(expected);
    for (const [file, use] of Object.entries(INVENTORY)) expect(use.why.length, file).toBeGreaterThan(20);
  });

  it("has the contrast script check exactly the colour-only fills at 3:1 (the kit's chart series today)", () => {
    const pairs = Object.values(INVENTORY).flatMap((use) => (use.verdict === "colour-only" ? (use.pairs ?? []) : []));
    for (const [file, use] of Object.entries(INVENTORY)) if (use.verdict === "colour-only") expect(use.pairs?.length, file).toBeGreaterThan(0);
    const done = spawnSync(process.execPath, [join(process.cwd(), "scripts/check-theme-contrast.mjs")], { encoding: "utf8" });
    const listed = /Fills that carry meaning by colour alone: (.*)/.exec(done.stdout)?.[1] ?? "";
    expect(pairs.length).toBeGreaterThan(0);
    expect(listed).toBe(pairs.map(([f, b]) => `--${f} on --${b}`).join(", "));
    expect(done.status).toBe(0);
  });
});
