import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Issue #457, spec 2026-11-05 §4 rule 4, §6.2 and Appendix A.3 (WCAG 2.2 SC 1.4.11), seam S7. An accent fill needs 3:1
// against its surface only when colour alone carries its meaning; a decorative fill, or one always paired with a text label
// or an icon, is exempt. The fills are --mint, --coral, --sun and --violet, plus --you-line and --src-line, which are the
// mint and sunflower fills under their older names. This inventory holds every place src/ paints one, with its verdict. A
// new use changes its file's count, so this test fails until someone decides: decorative, paired, or colour-only. A
// colour-only use should gain a label or an icon; if it cannot, its [fill, surface] goes into COLOUR_ONLY in
// scripts/check-theme-contrast.mjs, which then checks it at 3:1 in both themes.

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
    verdict: "paired",
    why: "OpenUI's success, alert and danger borders: only danger paints, on labelled destructive buttons, an input error (whose own border is coral-ink, 5.5:1) and a tool error (icon and text). The hex chart palette feeds the kit's charts, which all show a legend by default",
  },
  "src/widgets/primitives/wave1/breakeven.tsx": { uses: 1, verdict: "paired", why: "Swatch before the sourced marker's label, which names it in words" },
  "src/widgets/primitives/wave1/quick-check.tsx": { uses: 1, verdict: "paired", why: "Border of the right option, with a check icon and the feedback line; a wrong pick gets a cross" },
  "src/widgets/primitives/wave1/tones.ts": {
    uses: 2,
    verdict: "paired",
    why: "The rule of a you or src Stat, its only consumer; the Stat also shows the Your assumption or Sourced Tag (issue #457)",
  },
  "src/widgets/primitives/wave1/track.tsx": { uses: 1, verdict: "paired", why: "The sourced tick on a track, used by Breakeven only, which labels it in words below the track" },
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

const FILL = /var\(--(mint|coral|sun|violet|you-line|src-line)\)/g;
const SRC = join(process.cwd(), "src");

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
    const n = readFileSync(file, "utf8").match(FILL)?.length ?? 0;
    if (n) counts[relative(process.cwd(), file)] = n;
  }
  return counts;
}

describe("accent fills and the 3:1 rule", () => {
  it("has a verdict for every accent fill in src", () => {
    const expected = Object.fromEntries(Object.entries(INVENTORY).map(([file, use]) => [file, use.uses]));
    expect(found()).toEqual(expected);
    for (const [file, use] of Object.entries(INVENTORY)) expect(use.why.length, file).toBeGreaterThan(20);
  });

  it("has the contrast script check exactly the colour-only fills at 3:1 (none today)", () => {
    const pairs = Object.values(INVENTORY).flatMap((use) => (use.verdict === "colour-only" ? (use.pairs ?? []) : []));
    for (const [file, use] of Object.entries(INVENTORY)) if (use.verdict === "colour-only") expect(use.pairs?.length, file).toBeGreaterThan(0);
    const done = spawnSync(process.execPath, [join(process.cwd(), "scripts/check-theme-contrast.mjs")], { encoding: "utf8" });
    const listed = /Accent fills that carry meaning by colour alone: (.*)/.exec(done.stdout)?.[1] ?? "";
    if (pairs.length) expect(listed).toBe(pairs.map(([f, b]) => `--${f} on --${b}`).join(", "));
    else expect(listed).toMatch(/^none /);
  });
});
