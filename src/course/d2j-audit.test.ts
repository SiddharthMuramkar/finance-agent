import { describe, expect, it } from "vitest";
import { loadCourseMap, readOutlineText } from "./map";
import { parseOutline } from "./outline";

/**
 * Audit of D2j (#353), critic findings on main.
 * MP-1, MP-2 (math police): bank items MBA-FIN-CF-0006 (present value of a lease) and MBA-FIN-VAL-0014 (justified
 * forward P/E) have choices that only arithmetic separates, so their quizzes no longer draw them.
 * H1 (historian): in the Forbes copy, "[It sells at 340 times earnings.]" is an editor's bracketed insertion, not
 * Blodget's words, so no text may say Blodget said it.
 * H2 (historian): Damodaran's cash "already at $114 billion" matches the S-1's cash, cash equivalents and restricted
 * cash of $114,918m at 30 Jun 2026, so it is not graded as a slip.
 * H3 (historian): the S-1's contractual-obligations table is blank; $430.6bn is a sum of named passages, not a table.
 */
const map = loadCourseMap();
const topic = (id: string) => {
  const t = map.topics.find((x) => x.id === id);
  if (!t) throw new Error(`no Topic ${id}`);
  return t;
};
const quiz = (topicId: string, checkId: string) => {
  const c = topic(topicId).checks.find((x) => x.id === checkId);
  if (c?.kind !== "quiz") throw new Error(`${checkId} is not a quiz`);
  return c;
};
const outlineCase = (topicId: string, title: string) =>
  parseOutline(readOutlineText()).outline?.topics.find((t) => t.id === topicId)?.cases?.find((c) => c.title === title);

describe("D2j audit: no arithmetic bank items", () => {
  it.each([
    ["ana-commitments-debt", "cd-quiz-commitments", "bank:eab:MBA-FIN-CF-0006"],
    ["ana-decide-between", "adb-quiz-sorting", "bank:eab:MBA-FIN-VAL-0014"],
  ])("MP: %s %s leaves out %s and still fills an attempt", (topicId, checkId, bankId) => {
    const q = quiz(topicId, checkId);
    expect(q.questions).not.toContain(bankId);
    expect(q.questions.length).toBeGreaterThanOrEqual(q.perAttempt ?? 1);
  });
});

describe("D2j audit: facts about named writers", () => {
  const SAID_340 = /Blodget said[^.]*340|his 340|Yahoo is now a \$70 billion company\s+selling at 340/;

  it("H1: no Topic text or outline outcome attributes the 340 times to Blodget", () => {
    const t = topic("ana-decide-between");
    const texts = [
      ...t.cases.flatMap((c) => [c.story, c.reveal]),
      ...t.questions.map((q) => q.prompt),
      ...t.checks.flatMap((c) => (c.kind === "conversation" ? [c.prompt, c.passCriteria] : [])),
      outlineCase("ana-decide-between", "Two investors, one market, and what each claim is made of")?.outcome ?? "",
    ];
    expect(texts.filter((s) => SAID_340.test(s))).toEqual([]);
    expect(t.cases[0].story).toMatch(/\[It sells at 340 times\s+earnings\.\]/);
  });

  it("H2 and H3: the Damodaran reveal and outcome grade the $114bn cash as a match and name no $430.6bn table", () => {
    const reveal = topic("ana-anthropic-s1").cases.find((c) => c.id === "anthropic-s1-2026-damodaran-reading")?.reveal ?? "";
    const outcome = outlineCase("ana-anthropic-s1", "The Anthropic S-1, and Damodaran's reading of it")?.outcome ?? "";
    for (const text of [reveal, outcome]) {
      expect(text).not.toMatch(/Three of his figures/);
      expect(text).not.toMatch(/\$114bn matches neither/);
      expect(text).toMatch(/114,918m/);
      expect(text).not.toMatch(/commitments table\s+holds/);
      expect(text).toMatch(/265\.6bn/);
    }
  });
});
