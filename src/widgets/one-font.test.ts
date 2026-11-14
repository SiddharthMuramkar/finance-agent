import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Every Widget source except tests (spec 2026-11-11, A3a). Nothing in a Widget sets a heavy weight or another face. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return name.endsWith(".tsx") && !name.includes(".test.") ? [path] : [];
  });
}

const HEAVY = /font-(?:semibold|bold|extrabold|black|serif|mono)\b/;
const WEIGHT = /fontWeight\s*[=:]\s*\{?\s*[^,}\n]*\b[6-9]00\b/;

describe("one font in Widgets (A3a)", () => {
  it("no Widget part sets a heavy weight or another face", () => {
    const hits: string[] = [];
    for (const file of sources("src/widgets")) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((line, i) => {
        if (HEAVY.test(line) || WEIGHT.test(line)) hits.push(`${file}:${i + 1}`);
      });
    }
    expect(hits).toEqual([]);
  });
});
