import { describe, expect, it } from "vitest";
import { loadCourseMap } from "./map";

/**
 * Audit of D2d (#347) on main: critic findings MP1 and BP-1..BP-7.
 * MP1 (math-police): bank question MBA-FIN-VAL-0045 asks for a two-asset portfolio's standard deviation from weights,
 * SDs and a correlation, so only arithmetic separates its choices. It is not drawn into rp-quiz-diversification;
 * rp-q-correlation already teaches the idea.
 * BP-2..BP-6 (beginner-persona): conversation Check prompts read as exam essays ("Explain what..., what... and what...").
 * They now ask "in your own words" or "which would you pick".
 * BP-1: eh-q-up-down is a story with a person, not a bare percent puzzle.
 * BP-7: the sensex-boom-1992 closing question no longer asks the Learner to turn fifteen months into a yearly rate.
 */
const map = loadCourseMap();
const topic = (id: string) => {
  const t = map.topics.find((x) => x.id === id);
  if (!t) throw new Error(`no Topic ${id}`);
  return t;
};

describe("D2d audit: risk-portfolio quiz draws no arithmetic bank question", () => {
  it("MP1: rp-quiz-diversification leaves out bank:eab:MBA-FIN-VAL-0045 and still fills an attempt", () => {
    const quiz = topic("risk-portfolio").checks.find((c) => c.id === "rp-quiz-diversification");
    if (quiz?.kind !== "quiz") throw new Error("rp-quiz-diversification is not a quiz");
    expect(quiz.questions).not.toContain("bank:eab:MBA-FIN-VAL-0045");
    expect(quiz.questions.length).toBeGreaterThanOrEqual(quiz.perAttempt ?? 1);
  });
});

const EXAM_OPENER = /^\s*(?:explain|judge it)\b/i;
const CONVERSATIONS: Array<[string, string]> = [
  ["eq-markets", "em-regulator-powers"],
  ["risk-portfolio", "rp-diversify-limits"],
  ["der-rates-fx", "rx-swap-risk"],
  ["mkt-ipo-float", "ip-float-and-price"],
  ["der-hedging", "hr-pool-hedge-or-bet"],
];

describe("D2d audit: conversation Checks ask in the Learner's own words", () => {
  it.each(CONVERSATIONS)("BP: %s / %s is not an exam essay prompt", (topicId, checkId) => {
    const check = topic(topicId).checks.find((c) => c.id === checkId);
    if (check?.kind !== "conversation") throw new Error(`${checkId} is not a conversation Check`);
    const prompt = check.prompt.trim();
    const lastSentence = prompt.split(/(?<=[.:])\s+/).pop() ?? "";
    expect(lastSentence).not.toMatch(EXAM_OPENER);
    expect(prompt).not.toMatch(/\bExplain\b/);
    expect(prompt).toMatch(/in your own words|which would you|what would you/i);
  });
});

describe("D2d audit: eq-history story questions", () => {
  it("BP-1: eh-q-up-down opens with a person", () => {
    const q = topic("eq-history").questions.find((x) => x.id === "eh-q-up-down");
    expect(q?.prompt).toBeDefined();
    expect(q?.prompt.trim()).not.toMatch(/^A portfolio\b/);
    expect(q?.prompt.trim()).toMatch(/^(?:On [^,]+, )?[A-Z][a-z]+(?:'s)? (?:is|says|tells|asks|has|wants)\b/);
  });

  it("BP-7: sensex-boom-1992 does not ask for a yearly pace, and keeps its facts", () => {
    const c = topic("eq-history").cases.find((x) => x.id === "sensex-boom-1992");
    expect(c?.story).toBeDefined();
    expect(c?.story).not.toMatch(/yearly pace/i);
    for (const fact of ["31 March 1992", "779", "1,048", "999", "1,909", "3,018", "9.4%", "42%", "4,285", "fifteen"]) {
      expect(c?.story).toContain(fact);
    }
  });
});
