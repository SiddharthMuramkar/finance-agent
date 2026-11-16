import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { LAPTOP_PX, LAPTOP_UP, screenAt, TABLET_PX, TABLET_UP } from "./screen";

// The one screen-size rule (#81): phone below 768 px, tablet below 1024, laptop from 1024. CSS (Tailwind's md and lg)
// and the scripts read the same numbers, and no other file spells a width rule of its own.

const css = readFileSync(join(__dirname, "globals.css"), "utf8");
const rem = (token: string) => Number(css.match(new RegExp(`${token}:\\s*([\\d.]+)rem`))?.[1]) * 16;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : /\.(tsx?|css)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("the screen-size rule", () => {
  it("names a phone below 768 px, a tablet below 1024 and a laptop from 1024", () => {
    expect([360, 390, 767].map(screenAt)).toEqual(["phone", "phone", "phone"]);
    expect([768, 820, 1023].map(screenAt)).toEqual(["tablet", "tablet", "tablet"]);
    expect([1024, 1512, 1920].map(screenAt)).toEqual(["laptop", "laptop", "laptop"]);
    expect([TABLET_UP, LAPTOP_UP]).toEqual(["(min-width: 768px)", "(min-width: 1024px)"]);
  });

  it("is the same rule in CSS: Tailwind's md and lg breakpoints", () => {
    expect(rem("--breakpoint-md")).toBe(TABLET_PX);
    expect(rem("--breakpoint-lg")).toBe(LAPTOP_PX);
  });

  it("is defined once: no other app file writes a 768 or 1024 px media rule", () => {
    const own = /\(\s*(?:min-|max-)?width\s*(?::|>=|<=|<|>)\s*(?:768|1024|767|1023)px\s*\)/;
    const app = join(__dirname);
    const offenders = files(app).filter((f) => !f.endsWith("screen.ts") && own.test(readFileSync(f, "utf8")));
    expect(offenders.map((f) => f.slice(app.length + 1))).toEqual([]);
  });
});
