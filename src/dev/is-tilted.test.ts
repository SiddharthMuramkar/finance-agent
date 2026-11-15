import { describe, expect, it } from "vitest";
import { isTilted } from "../../e2e/support/measure";

// A10b, ADR 0015: no sticker slant in a Widget. The browser probe's rule, pinned: a slant of any angle off the quarter
// turns counts, by `rotate` or by a matrix; a quarter turn (a disclosure chevron turned to say "open") does not.
const rot = (deg: number) => {
  const r = (deg * Math.PI) / 180;
  return `matrix(${Math.cos(r)}, ${Math.sin(r)}, ${-Math.sin(r)}, ${Math.cos(r)}, 0, 0)`;
};

describe("isTilted", () => {
  it("counts a slant, by rotate or by a matrix, and a skew", () => {
    expect(isTilted("4deg", "none")).toBe(true);
    expect(isTilted("-2.5deg", "none")).toBe(true);
    expect(isTilted("none", rot(8))).toBe(true);
    expect(isTilted("none", rot(-3))).toBe(true);
    expect(isTilted("none", "matrix(1, 0, 0.2, 1, 0, 0)")).toBe(true);
    expect(isTilted("0.1turn", "none")).toBe(true);
  });

  it("does not count no turn, a translate or scale, or a quarter turn", () => {
    expect(isTilted("none", "none")).toBe(false);
    expect(isTilted("0deg", "none")).toBe(false);
    expect(isTilted("none", "matrix(1, 0, 0, 1, 10, 4)")).toBe(false);
    expect(isTilted("none", "matrix(1.2, 0, 0, 1.2, 0, 0)")).toBe(false);
    expect(isTilted("90deg", "none")).toBe(false);
    expect(isTilted("-90deg", "none")).toBe(false);
    expect(isTilted("180deg", "none")).toBe(false);
    expect(isTilted("none", rot(90))).toBe(false);
    expect(isTilted("none", rot(180))).toBe(false);
  });
});
