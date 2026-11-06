import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// Issue #501 (historian H2): no source counts how many dot-com companies survived, so the mkt-efficiency reveal and
// its outline outcome must not say Blodget's survival warning was borne out. They say it was not counted, as the
// sibling Topic ana-decide-between does.
const read = (path: string) => parse(readFileSync(join(process.cwd(), path), "utf8"));

const reveal = (): string => {
  const doc = read("course/topics/mkt-efficiency.yaml") as { cases: { id: string; reveal: string }[] };
  return doc.cases.find((c) => c.id === "blodget-grantham-2000")?.reveal ?? "";
};

const outcome = (): string => {
  const doc = read("course/outline.yaml") as { topics: { id: string; cases: { outcome: string }[] }[] };
  return doc.topics.find((t) => t.id === "mkt-efficiency")?.cases[0]?.outcome ?? "";
};

describe("issue #501: the dot-com survival claim", () => {
  for (const [name, text] of [
    ["reveal", reveal],
    ["outline outcome", outcome],
  ] as const) {
    it(`${name} does not claim the survival warning was borne out`, () => {
      expect(text()).not.toBe("");
      expect(text()).not.toMatch(/would not survive|borne out/i);
    });

    it(`${name} says the share that disappeared was not counted`, () => {
      expect(text()).toMatch(/not counted/i);
    });
  }
});
