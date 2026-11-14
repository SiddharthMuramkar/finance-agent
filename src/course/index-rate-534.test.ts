import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { MISTAKE_FNS } from "@/teaching/mistakes";

// Issue #534 (math police MP-1): cp-q-index-rate must be answerable from the idea alone. Its old choice d,
// "About 13% a year", was the year count read as a rate (not a real slip), and only a 13th-root sum told it from the
// answer. Every wrong choice is now a known slip, only the answer names one steady compound rate, and the explanation
// names the CAGR idea instead of working the sum.

/** Known slips a written-out choice may stand for: the template Known mistakes, plus reading the whole rise as one year. */
const KNOWN_SLIPS = new Set<string>([...MISTAKE_FNS, "too_big"]);

const question = () => {
  const q = loadCourseMap()
    .topic("num-compounding")!
    .questions.find((x) => x.id === "cp-q-index-rate");
  if (!q || !("choices" in q) || !q.choices) throw new Error("cp-q-index-rate with choices not found");
  return q as typeof q & { choices: { id: string; text: string; mistake?: { tag: string; fix: string } }[]; answer: string; explanation: string };
};

describe("issue #534: cp-q-index-rate picks on the idea, not a sum", () => {
  it("has no choice that is the year count read as a percent", () => {
    const years = question().prompt.match(/in (\d+) years/)?.[1];
    expect(years).toBe("13");
    for (const c of question().choices) expect(c.text, c.id).not.toMatch(new RegExp(`\\b${years}\\s*%`));
  });

  it("tags every wrong choice with a known slip, never a made-up mix-up", () => {
    const wrong = question().choices.filter((c) => c.id !== question().answer);
    expect(wrong).toHaveLength(3);
    for (const c of wrong) expect(KNOWN_SLIPS.has(c.mistake?.tag ?? ""), `${c.id}: ${c.mistake?.tag}`).toBe(true);
    expect(wrong.map((c) => c.mistake?.tag)).toContain("simple_growth");
  });

  it("lets only the answer say compound or steady rate", () => {
    const q = question();
    expect(q.answer).toBe("a");
    for (const c of q.choices) expect(/compound|steady/i.test(c.text), c.id).toBe(c.id === "a");
  });

  it("explains with the CAGR idea and works no root sum", () => {
    const e = question().explanation;
    expect(e).toMatch(/CAGR/);
    expect(e).not.toMatch(/42\.85|33%|grown 13 times/);
  });
});
