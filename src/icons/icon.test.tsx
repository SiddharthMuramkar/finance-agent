import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Icon } from "./icon";
import { ICON_SET, ICON_SET_NAMES, type IconName } from "./names";

afterEach(() => vi.restoreAllMocks());

/** Every drawn shape in an svg's markup: Lucide draws with these elements. */
const shapes = (html: string) => html.match(/<(path|circle|rect|line|polyline|polygon|ellipse)\b[^>]*>/g) ?? [];
const svgTag = (html: string) => /^<svg\b[^>]*>/.exec(html)?.[0] ?? "";

describe("<Icon> (A1a)", () => {
  it("draws a decorative Icon as a thin line svg, with a non-scaling stroke from 32 px up", () => {
    const html = renderToStaticMarkup(<Icon name="money-bag" size={48} />);
    const svg = svgTag(html);
    expect(html).toMatch(/^<svg\b/);
    expect(svg).toContain('data-icon="money-bag"');
    expect(svg).toContain('width="48"');
    expect(svg).toContain('height="48"');
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).toContain('focusable="false"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('stroke-width="1.75"');
    expect(svg).toMatch(/class="[^"]*\blucide-wallet\b[^"]*"/);
    expect(svg).not.toContain("role=");
    expect(shapes(html).length).toBeGreaterThan(0);
    for (const s of shapes(html)) expect(s).toContain('vector-effect="non-scaling-stroke"');
    expect(html).not.toContain("<img");
  });

  it("draws a small Icon at stroke 1.75 in plain Lucide geometry, with no vector-effect", () => {
    const html = renderToStaticMarkup(<Icon name="bank" size={16} />);
    expect(svgTag(html)).toContain('stroke-width="1.75"');
    expect(svgTag(html)).toContain('width="16"');
    expect(svgTag(html)).toMatch(/class="[^"]*\blucide-landmark\b[^"]*"/);
    expect(html).not.toContain("vector-effect");
  });

  it("is an image with its label, or with the set's alt when label is true, and then not aria-hidden", () => {
    const labelled = svgTag(renderToStaticMarkup(<Icon name="bank" size={24} label="the central bank" />));
    expect(labelled).toContain('role="img"');
    expect(labelled).toContain('aria-label="the central bank"');
    expect(labelled).not.toContain("aria-hidden");
    const own = svgTag(renderToStaticMarkup(<Icon name="bank" size={24} label />));
    expect(own).toContain('role="img"');
    expect(own).toContain('aria-label="bank"');
    expect(own).not.toContain("aria-hidden");
  });

  it("passes className through beside Lucide's own classes", () => {
    const svg = svgTag(renderToStaticMarkup(<Icon name="bank" size={20} className="text-[var(--muted)]" />));
    expect(svg).toMatch(/class="[^"]*\blucide-landmark\b[^"]*"/);
    expect(svg).toContain("text-[var(--muted)]");
  });

  it("renders nothing for an unknown name and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = "pizza-slice-unknown" as IconName;
    expect(renderToStaticMarkup(<Icon name={bad} size={24} />)).toBe("");
    expect(renderToStaticMarkup(<Icon name={bad} size={24} />)).toBe("");
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("maps every one of the 167 names to an Icon: an svg with its Lucide drawing's class", () => {
    expect(ICON_SET_NAMES).toHaveLength(167);
    for (const name of ICON_SET_NAMES) {
      const html = renderToStaticMarkup(<Icon name={name} size={24} />);
      expect(html, name).toMatch(/^<svg\b/);
      expect(svgTag(html), name).toContain(`data-icon="${name}"`);
      expect(svgTag(html), `${name} -> ${ICON_SET[name].drawing}`).toMatch(new RegExp(`class="[^"]*\\blucide-${ICON_SET[name].drawing}(\\s|")`));
    }
  });

  it("pins lucide-react to exactly 1.71.0", () => {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { dependencies: Record<string, string> };
    expect(pkg.dependencies["lucide-react"]).toBe("1.71.0");
  });
});
