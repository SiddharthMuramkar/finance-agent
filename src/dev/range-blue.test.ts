import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Spec 2026-11-12, Part F (F2): every slider's fill and thumb is the accent blue. This sweeps every range input in src/
// so a new slider cannot slip in with the browser's default colour or a family colour. A slider is drawn one of two ways:
// - the `range-you` utility (globals.css), whose filled track and thumb are the accent, checked below; or
// - an invisible native range (opacity-0) laid over a track the file paints itself: then the file must paint a fill and a
//   thumb in var(--accent).

const ROOT = process.cwd();

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === "node_modules" ? [] : files(path);
    return /\.tsx$/.test(name) && !/\.test\.tsx$/.test(name) ? [path] : [];
  });
}

/** Each `<input … type="range" …>` element's text, from `<input` to its closing `/>`. */
function rangeInputs(text: string): string[] {
  return [...text.matchAll(/<input\b[\s\S]*?\/>/g)].map((m) => m[0]).filter((el) => /type="range"/.test(el));
}

describe("every range slider is the accent blue (F2)", () => {
  const sliders = files(join(ROOT, "src")).flatMap((path) => {
    const text = readFileSync(path, "utf8");
    return rangeInputs(text).map((el) => ({ file: relative(ROOT, path), el, text }));
  });

  it("finds the product's sliders", () => {
    expect(sliders.map((s) => s.file)).toEqual(
      expect.arrayContaining(["src/widgets/slider-control.tsx", "src/widgets/primitives/wave1/predict.tsx", "src/widgets/primitives/wave2/time-travel.tsx", "src/widgets/primitives/wave2/rate-move.tsx", "src/app/_landing/home-explorable.tsx"]),
    );
  });

  it("each uses range-you, or is an invisible range over an accent fill and thumb its file paints", () => {
    const wrong = sliders.flatMap(({ file, el, text }) => {
      if (/range-you/.test(el)) return [];
      if (/opacity-0/.test(el)) {
        const fills = (text.match(/bg-\[var\(--accent\)\]/g) ?? []).length + (text.match(/borderColor: "var\(--accent\)"/g) ?? []).length;
        return fills >= 2 ? [] : [`${file}: an invisible range, but the file paints fewer than a fill and a thumb in var(--accent)`];
      }
      return [`${file}: a visible range without range-you, so the browser's colours show`];
    });
    expect(wrong).toEqual([]);
  });

  it("no slider sets its own colour with accent-color or a family colour", () => {
    for (const { file, el } of sliders) {
      expect(el, file).not.toMatch(/accent-color|accent-\[|--mint|--coral|--sun|--violet/);
    }
  });

  it("range-you fills the track and draws the thumb in the accent", () => {
    const css = readFileSync(join(ROOT, "src/app/globals.css"), "utf8");
    const block = css.slice(css.indexOf("@utility range-you"), css.indexOf("@utility range-you") + 2500);
    expect(block).toMatch(/linear-gradient\(to right, var\(--accent\) var\(--range-fill/);
    expect((block.match(/radial-gradient\(circle, var\(--accent-fill\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
