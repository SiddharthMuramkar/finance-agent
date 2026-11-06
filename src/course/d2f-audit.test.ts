import { describe, expect, it } from "vitest";
import { sumAsk } from "@/teaching/no-sums";
import { loadCourseMap } from "./map";

/**
 * Audit of D2f (#349) on main: the confirmed critic findings, each pinned so it cannot come back.
 * MP-1, MP-2 (math police): two bank questions in cf-venture's quiz ask for a sum.
 * H1, H2 (historian): a wrong cause for a Philly Fed figure; a misread CNBC "most".
 * BP-1, BP-3..BP-8 (beginner persona): a Case question asking for a figure, abstract stems, and explanations whose
 * figures the stem never gave.
 */
const map = loadCourseMap();
const topic = (id: string) => {
  const t = map.topics.find((x) => x.id === id);
  if (!t) throw new Error(`no Topic ${id}`);
  return t;
};
const question = (topicId: string, id: string) => {
  const q = topic(topicId).questions.find((x) => x.id === id);
  if (!q) throw new Error(`no question ${id}`);
  return q;
};
const numbers = (text: string) => text.match(/\d[\d,.]*\d|\d/g) ?? [];

describe("D2f audit: cf-venture", () => {
  it("MP-1, MP-2: cv-quiz-rounds draws no arithmetic bank question and still fills an attempt", () => {
    const quiz = topic("cf-venture").checks.find((c) => c.id === "cv-quiz-rounds");
    if (quiz?.kind !== "quiz") throw new Error("cv-quiz-rounds is not a quiz");
    expect(quiz.questions).not.toContain("bank:eab:MBA-ENT-0014");
    expect(quiz.questions).not.toContain("bank:eab:MBA-FIN-VAL-0036");
    expect(quiz.questions.length).toBeGreaterThanOrEqual(quiz.perAttempt ?? 1);
  });

  it("H2: the WeWork Check says 'most' of SoftBank's recent investment, as CNBC did", () => {
    const check = topic("cf-venture").checks.find((c) => c.id === "cv-wework-round");
    const prompt = check && "prompt" in check ? String(check.prompt).replace(/\s+/g, " ") : "";
    expect(prompt).toContain("most of SoftBank's recent investment");
    expect(prompt).not.toMatch(/\$2 billion investment from SoftBank, with most of it/);
  });

  it("BP-4: the ownership, pre-money and VC-method stems are told through WeWork, and explanations do no division", () => {
    for (const id of ["cv-q-ownership", "cv-q-pre-money", "cv-q-vc-method"]) {
      const q = question("cf-venture", id);
      expect(q.prompt, id).toContain("WeWork");
      expect(sumAsk(q.explanation), id).toBeNull();
    }
  });
});

describe("D2f audit: struct-securitisation", () => {
  const c = topic("struct-securitisation").cases.find((x) => x.id === "subprime-aaa-2006-tranches");

  it("BP-1: the Case story's closing question asks for no figure", () => {
    const ask = (c?.story ?? "").replace(/\s+/g, " ").split(/(?<=[.!])\s+/).filter((s) => s.includes("?"));
    expect(ask.length).toBeGreaterThan(0);
    for (const s of ask) {
      expect(sumAsk(s), s).toBeNull();
      expect(s).not.toMatch(/how much/i);
    }
  });

  it("H1: the reveal gives the paper's cause for $64bn becoming $140bn: the same bonds used in many CDOs", () => {
    const reveal = (c?.reveal ?? "").replace(/\s+/g, " ");
    expect(reveal).not.toMatch(/Because the unsold lower layers of CDOs were mostly put into other CDOs, \$64 billion/);
    expect(reveal).toMatch(/referenced through credit default swaps/);
  });

  it("BP-5: the tranche stems no longer repeat one set-up word for word", () => {
    const stems = ["ss-q-first-loss", "ss-q-partial-loss", "ss-q-wipe-bbb"].map((id) => question("struct-securitisation", id).prompt);
    const opener = (s: string) => s.trim().split(/\s+/).slice(0, 12).join(" ");
    expect(new Set(stems.map(opener)).size).toBe(3);
    for (const s of stems) expect(s).not.toMatch(/Which statement about it is right\?/);
  });
});

describe("D2f audit: bank-regulation, val-india, private-credit", () => {
  it("BP-3: every bank-regulation question is told through SVB with a person", () => {
    for (const id of ["br-q-cet1", "br-q-aoci", "br-q-lcr", "br-q-leverage", "br-q-deposit-insurance"]) {
      const p = question("bank-regulation", id).prompt;
      expect(p, id).toMatch(/SVB|Silicon Valley Bank/);
      expect(p, id).toMatch(/Nina/);
      expect(p, id).not.toMatch(/What is the right reading\?/);
    }
  });

  it("BP-6: the val-india textbook stems use the Case's fund people", () => {
    for (const id of ["vi-q-consistency", "vi-q-crp", "vi-q-consistent"]) {
      expect(question("val-india", id).prompt, id).toMatch(/Priya|Ravi/);
    }
    expect(question("val-india", "vi-q-consistent").prompt).not.toMatch(/the value should be:\s*$/);
  });

  it("BP-7, BP-8: explanations bring in no figure the stem never gave, and do no sums", () => {
    const named: [string, string][] = [
      ["private-credit", "pc-q-nav"],
      ["private-credit", "pc-q-remaining-share"],
      ["bank-regulation", "br-q-leverage"],
      ["val-india", "vi-q-crp"],
    ];
    for (const [t, id] of named) {
      const q = question(t, id);
      const known = new Set([...numbers(q.prompt), ...topic(t).cases.flatMap((c) => numbers(c.story))]);
      expect(numbers(q.explanation).filter((n) => !known.has(n)), id).toEqual([]);
      expect(sumAsk(q.explanation), id).toBeNull();
    }
  });
});
