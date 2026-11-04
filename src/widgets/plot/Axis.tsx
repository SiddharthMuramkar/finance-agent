import { useEffect, useState, type RefObject } from "react";

// The labels beside a plot: the value axis up the left, and the category or time axis along the bottom. They are
// page text (not SVG text) so they keep their size while the drawing scales to the panel.

/** Drawing size shared by every plot: the width and height of the SVG's viewBox. */
export const PLOT_W = 600;
export const PLOT_H = 180;

export const share = (part: number, whole: number) => `${(part / whole) * 100}%`;

/** Drawing units per screen pixel of a plot's SVG, kept up to date as the panel resizes; 1 until measured. */
export function useUnitsPerPixel(svg: RefObject<Element | null>): number {
  const [unitsPerPixel, setUnitsPerPixel] = useState(1);
  useEffect(() => {
    const el = svg.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      const width = el.getBoundingClientRect().width;
      if (width > 0) setUnitsPerPixel(PLOT_W / width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [svg]);
  return unitsPerPixel;
}

/** The value labels up the left of a plot: each tick's text at its height (`y` maps a value to 0..PLOT_H). */
export function YAxis({ ticks, y, format, testid = "plot-y-label" }: { ticks: number[]; y: (v: number) => number; format: (v: number) => string; testid?: string }) {
  return (
    <div aria-hidden className="relative w-14 shrink-0">
      {ticks.map((t) => (
        <span
          key={t}
          data-testid={testid}
          className="absolute right-0 -translate-y-1/2 whitespace-nowrap text-[11px] leading-none tabular-nums text-[var(--muted)]"
          style={{ top: share(y(t), PLOT_H) }}
        >
          {format(t)}
        </span>
      ))}
    </div>
  );
}

/** One label along the bottom: where it sits (0..PLOT_W), what it says, and whether it is the first or last of the axis. */
export type XMark = { at: number; text: string; edge?: "start" | "end"; hideNarrow?: boolean };

/** The style that places a label: the first and last are anchored to the edges, the rest centred under their mark. */
export function markStyle(m: XMark, anchorEdges = true): { left?: string | number; right?: string | number; transform?: string } {
  if (anchorEdges && m.edge === "start") return { left: 0 };
  if (anchorEdges && m.edge === "end") return { right: 0 };
  return { left: share(m.at, PLOT_W), transform: "translateX(-50%)" };
}

/**
 * Keeps the first and last marks and every mark that is at least `minGap` drawing units from the one kept before
 * it (and from the last), so labels never print over one another. Marks must be in order of `at`.
 */
export function thinMarks(marks: XMark[], minGap: number): XMark[] {
  if (marks.length <= 2) return marks;
  const last = marks[marks.length - 1];
  const kept = [marks[0]];
  for (const m of marks.slice(1, -1)) {
    if (m.at - kept[kept.length - 1].at >= minGap && last.at - m.at >= minGap) kept.push(m);
  }
  kept.push(last);
  return kept;
}

/**
 * The labels along the bottom of a plot, lined up with the drawing (a `ml-16` gutter matches the value axis). The
 * first and last are anchored to the edges (`left: 0` / `right: 0`) when they lie within `edgeShare` of an end of
 * the drawing, so a long label never hangs outside the panel; the others are centred. A lone mark is centred.
 */
export function XAxis({ marks, edgeShare = 0.12, testid = "plot-x-label" }: { marks: XMark[]; edgeShare?: number; testid?: string }) {
  const n = marks.length;
  return (
    <div aria-hidden className="relative ml-16 mt-1 h-4">
      {marks.map((m, i) => {
        const nearStart = i === 0 && n > 1 && m.at <= edgeShare * PLOT_W;
        const nearEnd = i === n - 1 && n > 1 && m.at >= (1 - edgeShare) * PLOT_W;
        const placed: XMark = { ...m, edge: nearStart || m.edge === "start" ? "start" : nearEnd || m.edge === "end" ? "end" : undefined };
        return (
          <span
            key={`${i}-${m.text}`}
            data-testid={testid}
            className={`absolute top-0 whitespace-nowrap text-[11px] leading-4 tabular-nums text-[var(--muted)] ${m.hideNarrow ? "@max-2xs:hidden" : ""}`}
            style={markStyle(placed)}
          >
            {m.text}
          </span>
        );
      })}
    </div>
  );
}
