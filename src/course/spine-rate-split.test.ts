import { describe, expect, it } from "vitest";
import { draftOf } from "@/dev/e2e-tutor";
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
    for (const q of [
      "rate-q-lever",
      "rate-q-price",
      "rate-q-predict",
      "rate-q-direction",
      "rate-q-fed",
      "rate-q-hold",
      "rate-q-pricevalue",
    ]) {
      expect(
        risk.questions.some((x) => x.id === q),
        `${q} stays in the risk Topic`,
      ).toBe(true);
    }
  });

  it("gives the new Topic ids of its own, so no Review or pass points across", () => {
    const old = new Set([
      ...risk.checks.map((c) => c.id),
      ...risk.questions.map((q) => q.id),
    ]);
    for (const id of [
      ...capital.checks.map((c) => c.id),
      ...capital.questions.map((q) => q.id),
    ])
      expect(old.has(id), id).toBe(false);
  });

  it("keeps a Learner's pass of the risk Topic, and starts the new Topic unpassed", () => {
    const passedThrough = map.topics.filter(
      (t) => t.stage === "spine" && t.spine! <= risk.spine!,
    );
    const progress: Progress = {
      currentTopicId: null,
      topics: Object.fromEntries(
        passedThrough.map((t) => [
          t.id,
          {
            step: "principle",
            passedChecks:
              t.id === RISK
                ? ["rate-check", "rate-talk"]
                : t.checks.map((c) => c.id),
            revealShown: true,
            status: "passed" as const,
          },
        ]),
      ),
    };
    const view = courseOverview(map, progress);
    expect(view.find((t) => t.id === RISK)).toMatchObject({
      status: "passed",
      checks: [
        { id: "rate-check", passed: true },
        { id: "rate-talk", passed: true },
      ],
    });
    expect(view.find((t) => t.id === CAPITAL)).toMatchObject({
      status: "not_started",
    });
    expect(navigate(map, progress)?.topic.id).toBe(CAPITAL);
  });

  it("teaches the cost of equity in the risk Topic, and the cost of debt and the weights in the new one, at most four new words each", () => {
    expect(risk.terms.map((t) => t.term)).toEqual([
      "risk-free rate",
      "equity risk premium",
      "beta",
      "diversification",
    ]);
    expect(capital.terms.map((t) => t.term)).toEqual([
      "cost of debt",
      "tax saving on interest",
      "cost of capital",
      "basis point",
    ]);
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

  it("ends each Topic's Principle on a daily-life line (spec #68)", () => {
    expect(risk.dailyLife).toMatch(/savings account/);
    expect(capital.dailyLife).toMatch(/mortgage/);
  });

  it("asks for no own story in either Topic: the risk Topic's conversation judges Damodaran's choice", () => {
    for (const t of [risk, capital]) {
      for (const c of t.checks.filter((c) => c.kind === "conversation"))
        expect(c.prompt, `${t.id} ${c.id}`).not.toMatch(
          /how you would|your own|your story/i,
        );
    }
    expect(
      words(RISK)
        .concat(words(CAPITAL))
        .filter((t) => /your story/i.test(t)),
    ).toEqual([]);
  });

  // Spine critics round 1 on #91.
  it("asks each Insight as a direction, not a size (Math police)", () => {
    for (const t of [risk, capital])
      expect(t.insight?.question, t.id).not.toMatch(/how far|how much/i);
    for (const name of ["rate-explore", "coc-explore"] as const)
      expect(draftOf(name).text, name).not.toMatch(/how far|how much/i);
  });

  it("keeps each Story turn to two figures at most, and says which beta he chose and why (beginner)", () => {
    for (const name of ["rate-story", "coc-story"] as const) {
      const figures =
        draftOf(name)
          .text.match(/\$?\d+(\.\d+)?%?/g)
          ?.filter((f) => !/^(19|20)\d\d$/.test(f)) ?? [];
      expect(
        figures.length,
        `${name}: ${figures.join(", ")}`,
      ).toBeLessThanOrEqual(2);
    }
    expect(draftOf("rate-concept").text).toMatch(
      /trusts the steadier average of internet retailers/,
    );
    expect(draftOf("coc-explore").text).toMatch(/as risky as an average share/);
  });

  it("keeps the risk Concept to the layers in words and beta, leaving the betas' figures to the Explore chips (beginner, round 1 on #91)", () => {
    const text = draftOf("rate-concept").text;
    expect(text).toMatch(/that number is called beta/);
    expect(text.match(/\d/g) ?? []).toEqual([]);
  });

  it("asks the risk Explore whether any beta reaches the price, not to work out a size (beginner, round 1 on #91)", () => {
    for (const q of [risk.insight?.question ?? "", draftOf("rate-explore").text])
      expect(q).toMatch(/Can any beta bring the value near/);
  });

  it("tells no figure its sources do not hold: no 6.60% past premium (Historian)", () => {
    expect(words(RISK).join(" ")).not.toContain("6.60");
  });
});
