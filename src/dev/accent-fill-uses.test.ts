import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CHART_SERIES, CHART_SURFACES } from "@/widgets/genui-theme";

// Issue #457, spec §2.2 rules 1 and 6, spec 2026-11-11 A10a (ADR 0014), seam S7. The signal colours (--gain, --gain-deep,
// --loss and --wait; decision #17) and the older family names (--mint is gain, --coral is loss; --sun, --violet, --you-line
// and --src-line now point at ink, muted and blue, and stay listed until their files move to the spec names) appear in a
// Widget only as small marks: a 1-2 px edge or rule, a dot, a bar or an Icon stroke beside words that already say what it
// means. This inventory
// holds every place src/ paints one, with its verdict: "mark" (a thin mark beside words), "mapping" (the token mappings in
// globals.css, which paint nothing alone) or "colour-only" (the kit's chart series, which carry meaning by colour alone, so
// their [fill, surface] pairs are in COLOUR_ONLY in scripts/check-theme-contrast.mjs and checked at 3:1). A
// new use changes its file's count, so this test fails until someone decides which it is.

type Verdict = "mark" | "mapping" | "colour-only";
type Use = { uses: number; verdict: Verdict; why: string; pairs?: [string, string][] };

const INVENTORY: Record<string, Use> = {
  "src/app/globals.css": {
    uses: 21,
    verdict: "mapping",
    why: "Name mappings: the older names pointed at the signal tokens (--mint, --coral, --danger ... at --gain and --loss), Tailwind's --color-* and OpenUI's --openui-border-*, which paint nothing by themselves, and the dot of each toned Tag, whose words always say the status (the Value It bars are solid accent since ADR 0013, no mint)",
  },
  "src/app/widget-panel.tsx": { uses: 1, verdict: "mark", why: "A 2 px sunflower edge down the sourced strip, which starts with the Sourced Tag" },
  "src/widgets/case-data-view.tsx": { uses: 3, verdict: "mark", why: "2 px sourced and assumption edges, each block led by the Sourced or Your assumption Tag" },
  "src/widgets/formula-card-view.tsx": {
    uses: 2,
    verdict: "mark",
    why: "A 2 px edge under a filled-in value, by origin; the symbol table below repeats each value with its Your assumption or Sourced Tag",
  },
  "src/widgets/genui-theme.tsx": {
    uses: 3,
    verdict: "colour-only",
    why: "The three counted uses are OpenUI's success, alert and danger borders (gain, wait, loss), which are paired: only danger paints, on labelled destructive buttons, an input error (whose own border is loss-ink) and a tool error (icon and text). The kit's chart series are colour-only: a series mark is needed to read the chart and a legend does not exempt it, so every CHART_SERIES token is checked at 3:1 on each chart surface (review C1)",
    pairs: CHART_SERIES.flatMap((series) => CHART_SURFACES.map((surface): [string, string] => [series, surface])),
  },
  "src/widgets/primitives/wave1/breakeven.tsx": {
    uses: 1,
    verdict: "mark",
    why: "An 8 px swatch before the sourced marker's line, which always names it in words (\"Sourced\" when the model gives no markerLabel; parts.test.tsx checks it)",
  },
  "src/widgets/primitives/wave1/tones.ts": {
    uses: 2,
    verdict: "mark",
    why: "The 2 px left rule of a you or src Stat, its only consumer; the Stat also shows the 'From your inputs' or 'Sourced' Tag (issue #457)",
  },
  "src/widgets/primitives/wave1/track.tsx": { uses: 1, verdict: "mark", why: "The 2 px sourced tick on a track, used by Breakeven only, which always labels it in words below the track, \"Sourced\" at the least" },
  "src/widgets/primitives/wave2/rate-move.tsx": { uses: 1, verdict: "mark", why: "A 2px violet rule beside the three ways to say the move; each line is labelled" },
  "src/widgets/primitives/wave2/step-through.tsx": { uses: 2, verdict: "mark", why: "A 2px underline in the tone's base colour under a number the step's words already name" },
  "src/widgets/primitives/wave3/headline.tsx": { uses: 1, verdict: "mark", why: "A sunflower top edge on the front page" },
  "src/widgets/primitives/wave3/lingo-card.tsx": { uses: 2, verdict: "mark", why: "A violet edge on the front and a sunflower edge on the story side; the Lingo and In the story Tags name them" },
  "src/widgets/primitives/wave3/money-jar.tsx": { uses: 5, verdict: "mark", why: "A mint or coral base edge, a thin mint edge on a new object and a dashed coral outline where one left; the words line says the size" },
  "src/widgets/primitives/wave3/story-scene.tsx": { uses: 2, verdict: "mark", why: "A sunflower edge on the stage and a sunflower ring on the character who is speaking" },
  "src/widgets/primitives/wave3/timeline-strip.tsx": { uses: 2, verdict: "mark", why: "A 2px sunflower line up to the story's date and a sunflower edge on the open moment's card" },
  "src/widgets/primitives/wave3/two-paths.tsx": { uses: 1, verdict: "mark", why: "A sunflower top edge on each path; the names, choices and outcome lines are text" },
  "src/widgets/workbench/bench-view.tsx": {
    uses: 3,
    verdict: "mark",
    why: "The five B4 Workbenches' one chart (BarRows, spec 2026-11-12 B4): SVG bars, a gain in mint, a loss in coral and a market or history figure in sunflower, each row led by its label in words, its figure in the bar's title, and every label and figure in the chart's accessible name",
  },
  "src/widgets/workbench/value-levers-view.tsx": {
    uses: 3,
    verdict: "mark",
    why: "Value levers (spec 2026-11-12, B3): the cash-flow bars' coral losses and mint gains, as the spec asks, each bar titled with its year and figure and the whole read aloud, like Home's Explorable bars; and the 2 px sunflower tick of the price on the value bar, beside the price readout that names it",
  },
};

// Spec 2026-11-12 F1 and F5 (ADR 0022): "the test that lists where an accent fill may appear gains the Bands". A Band is a
// full-width royal surface (--band, which is --royal, the same in both themes) with white text on it, and F1 names the only
// places one may stand. This inventory holds every place src/ paints one: "band" (a Band surface, with the F1 place it is),
// or "mapping" (globals.css: the Band tokens, their Tailwind names and the .band and .home-band rules that paint a Band
// and what sits on it, which paint nothing until a page puts the class on a block). A new Band changes its file's count, so
// this test fails until someone names its place.
type BandPlace =
  | "Home's hero"
  | "Home's How every Topic works"
  | "Home's closing"
  | "About's opening"
  | "the sign-in and Waiting pages' top strip"
  | "the Topic bar";
type BandUse = { uses: number; verdict: "band" | "mapping"; place?: BandPlace; why: string };

/** F1's list of the places a Band is used, word for word from the spec, so a row cannot name a place of its own. */
const F1_PLACES: readonly BandPlace[] = ["Home's hero", "Home's How every Topic works", "Home's closing", "About's opening", "the sign-in and Waiting pages' top strip", "the Topic bar"];

const BAND_INVENTORY: Record<string, BandUse> = {
  "src/app/globals.css": {
    uses: 32,
    verdict: "mapping",
    why: "The Band tokens (--band is --royal), the Tailwind name bg-band, and the .band and .home-band rules: the surface, its white and 72% text, its 18% rules, its white buttons (whose bars take the Band's blue), its white focus ring and Home's type on it",
  },
  "src/app/login/page.tsx": { uses: 1, verdict: "band", place: "the sign-in and Waiting pages' top strip", why: "The strip under the public header that holds the sign-in page's heading, the Waiting and Access not approved screens' included" },
  "src/app/workspace-parts.tsx": { uses: 1, verdict: "band", place: "the Topic bar", why: "The Topic bar across the Study Workspace (F3): title, goal, step bar, All steps and Topic options, above both columns" },
  "src/app/route-skeleton.tsx": { uses: 1, verdict: "band", place: "the Topic bar", why: "The Topic bar's empty Band while /study loads, so the skeleton and the page draw the same rows" },
};

// A Band is painted with the --band or --royal token, the bg-band utility, or the band and home-band classes (in a
// className, or as a CSS selector). band-card, band-faint, data-band and the like are other names, not a Band.
const BAND = /var\(--(?:band|royal)\)|(?<![\w-])bg-(?:band|\(--band\))(?![\w-])|(?<=className=(?:"|\{`)[^"`]*)(?<![\w-])(?:home-)?band(?![\w-])|\.(?:home-)?band(?![\w-])/g;

/** How many times `text` paints a Band. */
function bandUses(text: string): number {
  return text.match(BAND)?.length ?? 0;
}

// A fill is painted three ways: var(--gain) (also inside bg-[var(--gain)]); the bg-(--gain) shorthand; or a Tailwind 4
// utility named after the --color-* mapping in globals.css (bg-gain, border-t-wait, hover:fill-loss/40, from-mint, …). A
// name that runs on (gain-ink, wait-tint, loss-line, mint-ink) is another token, not a fill.
const NAMES = "(?:gain|gain-deep|loss|wait|mint|coral|sun|violet|you-line|src-line)";
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

/** Each source file that paints an accent fill (or, with `count`, a Band), with how many times. */
function found(count: (text: string) => number = fillUses): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const file of sources(SRC)) {
    const n = count(readFileSync(file, "utf8"));
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
    expect(fillUses('className="bg-gain border-t-wait fill-loss" style={{ color: "var(--gain-deep)" }}')).toBe(4);
    expect(fillUses('className="bg-gain-tint text-loss-ink border-wait-line bg-(--gain-ink)"')).toBe(0);
  });

  it("has a verdict for every accent fill in src", () => {
    const expected = Object.fromEntries(Object.entries(INVENTORY).map(([file, use]) => [file, use.uses]));
    expect(found()).toEqual(expected);
    for (const [file, use] of Object.entries(INVENTORY)) expect(use.why.length, file).toBeGreaterThan(20);
  });

  // Spec 2026-11-11 A10a test 6 (ADR 0014): a family in a Widget is a thin mark beside words. Every Widget file's row is a
  // "mark"; the kit's theme is the one "colour-only" row (its chart series), and globals.css holds only the mappings.
  it("has every Widget row as a mark, the kit's theme as the one colour-only row, and globals.css as the mappings", () => {
    const widget = (file: string) => file.startsWith("src/widgets/") || /^src\/app\/widget-[^/]+\.tsx$/.test(file);
    const verdicts = Object.fromEntries(Object.entries(INVENTORY).map(([file, use]) => [file, use.verdict]));
    const expected = Object.fromEntries(
      Object.keys(INVENTORY).map((file) => [file, file === "src/app/globals.css" ? "mapping" : file === "src/widgets/genui-theme.tsx" ? "colour-only" : "mark"]),
    );
    expect(verdicts).toEqual(expected);
    expect(Object.keys(INVENTORY).filter((file) => !widget(file) && file !== "src/app/globals.css")).toEqual([]);
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

  // Spec F5 named two family colours a Band could carry (sunflower and mint). Under the Signal colours (decision #17) neither
  // reads on the royal Band (sunflower is ink now, and green on blue is 2.96:1), so no signal colour sits on a Band: the
  // contrast script checks only white, white at 72%, the 18% rule and the white button's ink there.
  it("has the contrast script check only white and ink against the Band", () => {
    const done = spawnSync(process.execPath, [join(process.cwd(), "scripts/check-theme-contrast.mjs")], { encoding: "utf8" });
    expect(done.stdout).toMatch(/ok +--on-band on --band 8\.82:1/);
    expect(done.stdout).toMatch(/ok +--on-band-2 on --band 5\.36:1/);
    expect(done.stdout).not.toMatch(/--(?:sun|mint|gain|loss|wait) on --band/);
    expect(done.status).toBe(0);
  });
});

describe("Bands: where the royal brand surface may appear (spec 2026-11-12 F1, F5)", () => {
  it("counts a Band however it is painted, and not the names that only sound like one", () => {
    expect(bandUses('<section className="band">')).toBe(1);
    expect(bandUses('<nav className={`band relative ${x}`}>')).toBe(1);
    expect(bandUses('<section className="home-band home-section">')).toBe(1);
    expect(bandUses('.band .btn, .home-band a { background: var(--band); border-color: var(--royal); } .x { @apply bg-band; }')).toBe(5);
    expect(bandUses('<div className="band-card band-faint" data-band="x" />')).toBe(0);
    expect(bandUses("// the closing band, a fade band")).toBe(0);
    expect(bandUses('<p className="text-on-band border-band-rule bg-band-card">')).toBe(0);
  });

  it("has a verdict, and for a Band its F1 place, for every Band in src", () => {
    const expected = Object.fromEntries(Object.entries(BAND_INVENTORY).map(([file, use]) => [file, use.uses]));
    expect(found(bandUses)).toEqual(expected);
    for (const [file, use] of Object.entries(BAND_INVENTORY)) {
      expect(use.why.length, file).toBeGreaterThan(20);
      if (use.verdict === "band") expect(F1_PLACES, file).toContain(use.place);
      else expect(file).toBe("src/app/globals.css");
    }
  });

  it("puts the Band's tokens in the stylesheet only: no file paints --band or --royal by hand", () => {
    for (const file of Object.keys(BAND_INVENTORY).filter((f) => f !== "src/app/globals.css")) {
      expect(readFileSync(join(process.cwd(), file), "utf8"), file).not.toMatch(/var\(--(?:band|royal)\)|#1f3fae/i);
    }
  });
});
