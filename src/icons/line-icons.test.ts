import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Line Icons are Lucide at stroke 1.75 (spec 2026-11-11 §4 rule 4; parts rules "Icons"; ticket A10a). Lucide's own
 * default is 2, so every lucide-react component must say `strokeWidth={1.75}` (or spread props that do), and a Widget
 * part or Library piece (`src/widgets`) draws no hand-made icon `<svg>`: a glyph comes from lucide-react or the Icon set (`src/icons`). Charts, drawn
 * lines and IconGrid's 16 objects (R7) are drawings, not icons, and are named below.
 */

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, acc);
    else acc.push(path);
  }
  return acc;
}

const product = (dir: string) => walk(dir).filter((file) => file.endsWith(".tsx") && !/\.test\.tsx$/.test(file));

/** The components a file imports from lucide-react (not types), by their local name. */
function lucideNames(text: string): string[] {
  const names: string[] = [];
  for (const match of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"lucide-react"/g)) {
    for (const part of match[1].split(",")) {
      const item = part.trim();
      if (!item || item.startsWith("type ")) continue;
      names.push(item.split(/\s+as\s+/).pop()!.trim());
    }
  }
  return names;
}

/** `file:line` of every lucide-react element that does not set stroke 1.75. */
function thickIcons(file: string, text: string): string[] {
  const spreadsThin = /strokeWidth:\s*1\.75\b/.test(text);
  const found: string[] = [];
  for (const name of lucideNames(text)) {
    for (const match of text.matchAll(new RegExp(`<${name}\\b([^<>]*?)/?>`, "g"))) {
      const attrs = match[1];
      if (/strokeWidth=\{1\.75\}/.test(attrs) || (spreadsThin && /\{\.\.\.\w+\}/.test(attrs))) continue;
      found.push(`${file}:${text.slice(0, match.index).split("\n").length} <${name}>`);
    }
  }
  return found;
}

/** Widget-part files whose `<svg>` is a chart or a drawing, not an icon. */
const DRAWINGS: Record<string, string> = {
  "src/widgets/primitives/wave1/icons.tsx": "IconGrid's 16 hand-drawn objects stay line art at stroke 1.75 (R7)",
  "src/widgets/primitives/wave2/draw-the-line.tsx": "the chart the Learner draws on",
  "src/widgets/primitives/wave2/rate-move.tsx": "the rate chart",
  "src/widgets/primitives/wave2/waterfall.tsx": "the waterfall chart",
  "src/widgets/primitives/wave3/who-pays-whom.tsx": "the money's flow line (flow-draw)",
  "src/widgets/history-plot.tsx": "the history chart",
  "src/widgets/annuity-plot.tsx": "the annuity chart",
  "src/widgets/plot/LinePlot.tsx": "the line chart",
  "src/widgets/plot/BarPlot.tsx": "the bar chart",
  "src/widgets/workbench/value-levers-view.tsx": "Value levers' cash-flow bars (spec 2026-11-12, B3)",
  "src/widgets/workbench/bench-view.tsx": "BarRows, the bar chart of the B4 Workbenches (spec 2026-11-12, B4)",
  "src/widgets/workbench/multiple-decoder-view.tsx": "the multiple decoder's scale, a dot per multiple beside its name (B4)",
  "src/widgets/workbench/terminal-seesaw-view.tsx": "the terminal seesaw's beam and weights (B4)",
};

describe("line Icons are Lucide at stroke 1.75 (A10a)", () => {
  it("flags a lucide element at the default stroke and passes one at 1.75", () => {
    const text = 'import { Lock, X } from "lucide-react";\nconst a = <Lock size={16} aria-hidden />;\nconst b = <X size={16} strokeWidth={1.75} />;';
    expect(thickIcons("f.tsx", text)).toEqual(["f.tsx:2 <Lock>"]);
  });

  it("every lucide-react element in src sets strokeWidth 1.75", () => {
    expect(product("src").flatMap((file) => thickIcons(file, readFileSync(file, "utf8")))).toEqual([]);
  });

  it("no Widget part or Library piece draws a hand-made icon svg; only charts and drawings do", () => {
    const found = product("src/widgets")
      .filter((file) => !(file in DRAWINGS))
      .flatMap((file) =>
        readFileSync(file, "utf8")
          .split("\n")
          .flatMap((line, i) => (/<svg\b/.test(line) ? [`${file}:${i + 1}`] : [])),
      );
    expect(found).toEqual([]);
  });
});
