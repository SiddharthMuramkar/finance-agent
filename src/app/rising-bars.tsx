// The Value It mark: four solid bars rising short to tall, in the accent fill (royal blue in Light), with 1px corners
// (ADR 0013: flat and sharp, no gradient, no pill ends). Drawn with CSS (globals.css, "Rising bars"), so it needs no image
// and follows the theme. Each bar grows from the bottom, one after another, when the page opens; BarsReplay plays the
// rise again. Server-safe: no "use client".

const HEIGHTS = [25, 50, 75, 100];

/** The four-bar mark, `size` px tall and about 1.1 × as wide; bar widths and gaps are whole pixels, so small marks stay crisp.
 * Decorative: the words beside it name the brand. `onBrand` draws the bars in the text colour, for a filled surface (the
 * royal-blue band, a filled button). */
export function RisingBars({ size = 24, onBrand = false, className = "" }: { size?: number; onBrand?: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={["bars", onBrand && "bars-on-brand", className].filter(Boolean).join(" ")} style={{ height: size, gap: Math.round(size * 0.12) }}>
      {HEIGHTS.map((h, i) => (
        <span key={h} className="bar" style={{ height: `${h}%`, width: Math.round(size * 0.19), animationDelay: `${i * 140}ms` }} />
      ))}
    </span>
  );
}
