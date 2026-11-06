// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

/** The body of the first rule at or after `from` whose text contains `selector`, found by brace matching. */
function rule(selector: string, from = 0): string {
  const at = css.indexOf(selector, from);
  expect(at, `${selector} is in globals.css`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}" && --depth === 0) return css.slice(open + 1, i);
  }
  throw new Error("unbalanced braces");
}

describe("button anatomy", () => {
  it("is in the stylesheet", () => {
    expect(rule(".btn:active:not(:disabled)")).toContain("translateY(2px)");
    const reduced = css.indexOf("@media (prefers-reduced-motion: reduce) {", css.indexOf(".btn-primary"));
    expect(reduced).toBeGreaterThan(-1);
    expect(rule(".btn,\n    .chip {", reduced)).toContain("transition: none");
  });

  it("gives the current filmstrip thumbnail the B.2 showing face, not the focus outline (F2-PM-1)", () => {
    const showing = rule('.btn[aria-current="true"]');
    expect(showing).toContain("--face: var(--brand-tint)");
    expect(showing).toContain("--rim: var(--brand)");
    expect(showing).not.toMatch(/outline/);
  });

  it("drops the shadow on a disabled control, so it reads as off by its shape (Appendix B.3)", () => {
    const disabled = rule('.chip:disabled {');
    expect(disabled).toMatch(/box-shadow:\s*none;/);
    expect(disabled).toContain("opacity: 0.55");
  });
});
