import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { clerkAppearance } from "./clerk-appearance";

// Clerk's cards on /join, /sign-in and /sign-up wear the site's look (issue #76): its tokens, its font, flat controls,
// and no second heading. The look with Clerk on is checked by eye on value-it.xyz; this pins what the code hands Clerk.

const css = readFileSync(join(import.meta.dirname, "..", "app", "globals.css"), "utf8");
const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
const values = (o: object): string[] => Object.values(o).flatMap((v) => (typeof v === "object" ? values(v) : [String(v)]));

describe("Clerk's appearance", () => {
  it("takes every colour and the font from the site's tokens, with no literal colour", () => {
    const vars = clerkAppearance.variables;
    expect(vars).toMatchObject({ colorPrimary: "var(--accent)", colorPrimaryForeground: "var(--on-accent)", colorForeground: "var(--ink)", fontFamily: "var(--font-body)" });
    for (const [name, value] of Object.entries(vars)) {
      if (name === "borderRadius" || value === "transparent") continue;
      expect(value, name).toMatch(/^var\(--[\w-]+\)$/);
    }
    const used = values(clerkAppearance).flatMap((v) => [...v.matchAll(/var\((--[\w-]+)\)/g)].map((m) => m[1]));
    expect(used.filter((t) => !defined.has(t))).toEqual([]);
    expect(values(clerkAppearance).filter((v) => /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(v))).toEqual([]);
  });

  it("hides Clerk's own header, so each page keeps its one heading", () => {
    expect(clerkAppearance.elements.header).toEqual({ display: "none" });
  });

  it("draws flat controls and cards: no shadow, no gradient (ADR 0018)", () => {
    expect(clerkAppearance.variables.colorShadow).toBe("transparent");
    expect(clerkAppearance.elements.formButtonPrimary).toEqual({ boxShadow: "none", backgroundImage: "none" });
    expect(clerkAppearance.elements.cardBox).toMatchObject({ boxShadow: "none" });
    expect(clerkAppearance.elements.card).toEqual({ boxShadow: "none" });
  });
});
