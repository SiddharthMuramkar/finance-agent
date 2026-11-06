import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { sumAsk } from "../teaching/no-sums.ts";

// Issue #535 (math-police MP-2): the fr-coffee-roe Check lists the prospectus figures, then asked "how much of the
// business rests on borrowing", which invites an assets-to-equity sum. It now asks whether most of the business rests
// on borrowing or on the owners' money: an idea, not a size.
const prompt = (): string => {
  const doc = parse(readFileSync(join(process.cwd(), "course/topics/fs-ratios.yaml"), "utf8")) as {
    checks: { id: string; prompt?: string }[];
  };
  return doc.checks.find((c) => c.id === "fr-coffee-roe")?.prompt ?? "";
};

describe("issue #535: fr-coffee-roe asks no size", () => {
  it("has no how much / how many ask", () => {
    expect(prompt()).not.toBe("");
    expect(prompt()).not.toMatch(/how (much|many)/i);
  });

  it("asks whether most of the business rests on borrowing or on the owners' money", () => {
    expect(prompt()).toMatch(/whether most of the business rests on borrowing or on the owners' money/);
  });

  it("passes the no-sums check", () => {
    expect(sumAsk(prompt())).toBeNull();
  });
});
