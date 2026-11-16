import { describe, expect, it } from "vitest";
import { loadCourseMap } from "./map";
import { courseOverview, navigate, type Progress } from "./navigator";
import { topicTexts } from "./topic-texts";

// Ticket #91 (spec #68, stories 62 and 63; ADR 0004, ADR 0020): Topic 7 splits in two. The risk Topic keeps its id and
// teaches the cost of equity; the cost-of-capital Topic, right after it, adds the after-tax cost of debt and the weights,
// and names the WACC once. Expected values are the ticket's, not the course read back.

const map = loadCourseMap();
const RISK = "spine-07-risk";
const CAPITAL = "spine-cost-of-capital";
const risk = map.topic(RISK)!;
const capital = map.topic(CAPITAL)!;
const words = (id: string) => topicTexts(map.topic(id)!).map((t) => t.text);

describe("Topic 7 split into the cost of equity and the cost of capital (#91)", () => {
  it("puts the cost-of-capital Topic on the Spine right after the risk Topic", () => {
    expect(risk.stage).toBe("spine");
    expect(capital.stage).toBe("spine");
    expect(capital.spine).toBe(risk.spine! + 1);
  });

  it("keeps the risk Topic's Check ids and question ids, so its passes and Reviews stay", () => {
    expect(risk.checks.map((c) => c.id)).toEqual(["rate-check", "rate-talk"]);
    expect(risk.checks.every((c) => !c.required)).toBe(true);
    for (const q of ["rate-q-lever", "rate-q-price", "rate-q-predict", "rate-q-direction", "rate-q-fed", "rate-q-hold", "rate-q-pricevalue"]) {
      expect(risk.questions.some((x) => x.id === q), `${q} stays in the risk Topic`).toBe(true);
    }
  });

  it("gives the new Topic ids of its own, so no Review or pass points across", () => {
    const old = new Set([...risk.checks.map((c) => c.id), ...risk.questions.map((q) => q.id)]);
    for (const id of [...capital.checks.map((c) => c.id), ...capital.questions.map((q) => q.id)]) expect(old.has(id), id).toBe(false);
  });

  it("keeps a Learner's pass of the risk Topic, and starts the new Topic unpassed", () => {
    const passedThrough = map.topics.filter((t) => t.stage === "spine" && t.spine! <= risk.spine!);
    const progress: Progress = {
      currentTopicId: null,
      topics: Object.fromEntries(
        passedThrough.map((t) => [t.id, { step: "principle", passedChecks: t.id === RISK ? ["rate-check", "rate-talk"] : t.checks.map((c) => c.id), revealShown: true, status: "passed" as const }]),
      ),
    };
    const view = courseOverview(map, progress);
    expect(view.find((t) => t.id === RISK)).toMatchObject({ status: "passed", checks: [{ id: "rate-check", passed: true }, { id: "rate-talk", passed: true }] });
    expect(view.find((t) => t.id === CAPITAL)).toMatchObject({ status: "not_started" });
    expect(navigate(map, progress)?.topic.id).toBe(CAPITAL);
  });

  it("teaches the cost of equity in the risk Topic, and the cost of debt and the weights in the new one, at most four new words each", () => {
    expect(risk.terms.map((t) => t.term)).toEqual(["risk-free rate", "equity risk premium", "beta", "diversification"]);
    expect(capital.terms.map((t) => t.term)).toEqual(["cost of debt", "tax saving on interest", "cost of capital", "basis point"]);
  });

  it("names the WACC once, in the cost-of-capital Topic, tied to the cost of capital it explains", () => {
    const said = words(CAPITAL).filter((t) => /\bWACC\b/.test(t));
    expect(said).toHaveLength(1);
    expect(said[0].match(/\bWACC\b/g)).toHaveLength(1);
    expect(said[0]).toMatch(/Analysts call this the WACC/);
    expect(said[0]).toMatch(/cost of capital/);
    expect(said[0]).toMatch(/weighted average cost of capital/);
    expect(words(RISK).filter((t) => /\bWACC\b/.test(t))).toEqual([]);
  });

  it("asks for no own story in either Topic: the risk Topic's conversation judges Damodaran's choice", () => {
    for (const t of [risk, capital]) {
      for (const c of t.checks.filter((c) => c.kind === "conversation")) expect(c.prompt, `${t.id} ${c.id}`).not.toMatch(/how you would|your own|your story/i);
    }
    expect(words(RISK).concat(words(CAPITAL)).filter((t) => /your story/i.test(t))).toEqual([]);
  });
});
