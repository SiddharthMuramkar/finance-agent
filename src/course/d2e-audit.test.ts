import { describe, expect, it } from "vitest";
import { loadCourseMap } from "./map";

/**
 * Audit D2e (#348): confirmed critic findings on main.
 * MP-1..MP-4 (math police): four Question Bank items ask for a sum with bare-number choices, so their quizzes leave them out.
 * H1..H4 (historian): wrong figures in the Buffett bet reveal, the funds-passive concept and the Microsoft Case.
 */
const topics = loadCourseMap().topics;
const topic = (id: string) => {
  const t = topics.find((x) => x.id === id);
  if (!t) throw new Error(`no Topic ${id}`);
  return t;
};
const quiz = (topicId: string, checkId: string) => {
  const c = topic(topicId).checks.find((x) => x.id === checkId);
  if (c?.kind !== "quiz") throw new Error(`${checkId} is not a quiz`);
  return c;
};
const flat = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ");

describe("D2e audit: quizzes draw no arithmetic bank question", () => {
  it.each([
    ["cf-capital-budgeting", "cb-quiz-npv-irr", ["bank:eab:MBA-FIN-CF-0011", "bank:eab:MBA-FIN-CF-0012"]],
    ["cf-wacc", "wc-quiz-wacc", ["bank:eab:MBA-FIN-CF-0030"]],
    ["cf-capital-structure", "cs-quiz-structure", ["bank:eab:MBA-FIN-CF-0036"]],
    ["val-multiples", "vm-quiz-multiples", ["bank:eab:MBA-FIN-VAL-0009"]],
  ] as const)("%s %s leaves out %j and still fills an attempt", (t, c, ids) => {
    const q = quiz(t, c);
    for (const id of ids) expect(q.questions).not.toContain(id);
    expect(q.questions.length).toBeGreaterThanOrEqual(q.perAttempt ?? 1);
  });
});

describe("D2e audit: historian facts", () => {
  it("H1: the funds-of-funds average is about 3.1% a year, not 2.2%", () => {
    const reveal = flat(topic("funds-passive").cases.find((c) => c.id === "buffett-protege-bet-2007")?.reveal);
    expect(reveal).toContain("around 3.1 per cent a year");
    expect(reveal).not.toContain("2.2 per cent");
  });

  it("H4: a 1% yearly cost over 20 years takes about a sixth of the final amount, never 'far more than 20 per cent'", () => {
    const concept = flat(topic("funds-passive").concept);
    expect(concept).not.toContain("far more than 20 per cent");
    expect(concept).toContain("about a sixth of the final amount");
  });

  it("H2, H3: Microsoft held $46.18bn at 31 March 2003, and moved from an annual to a quarterly dividend", () => {
    const c = topic("cf-payout").cases.find((x) => x.id === "microsoft-special-dividend-2004");
    expect(flat(c?.story)).toContain("up from $46.18 billion a year earlier");
    expect(flat(c?.reveal)).not.toContain("double its regular quarterly dividend");
    expect(flat(c?.reveal)).toContain("from an annual dividend of 16 cents a share to a quarterly dividend of 8 cents");
  });
});
