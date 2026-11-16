import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { computedKeyedQuestion } from "@/course/quiz";
import { draftOf } from "@/dev/e2e-tutor";

// Spine critics round 1 on the annual report Topic (#93): what the four lenses confirmed, held so it stays fixed.
const map = loadCourseMap();
const topic = map.topic("spine-annual-report")!;
const amazon = topic.cases.find((c) => c.id === "spine-ar-amazon-2000")!;
const flat = (s: string) => s.replace(/\s+/g, " ");

describe("the annual report Topic after critics round 1", () => {
  it("gives the report's debt and cash wherever the Learner is told to put them in (beginner persona)", () => {
    const said = draftOf("ar-explore").text;
    expect(said).toMatch(/\$2\.1 billion/);
    expect(said).toMatch(/\$1\.1 billion/);
    // An Insight hint holds no figures (the course check), so it points at the report's page, where they are.
    expect(topic.insight!.hints[0]).toMatch(/report's page/);
  });

  it("opens on one number and the question, holding debt, cash and shares until Explore (beginner persona)", () => {
    const said = draftOf("ar-story").text;
    for (const held of ["$349 million", "$26 million", "340.79 million"]) expect(said).not.toContain(held);
    expect(said).toContain("$35.08");
    expect(said).toContain("$84");
  });

  it("asks whether a share moves a lot or a little, never how far (math police)", () => {
    for (const asked of [topic.insight!.question, draftOf("ar-explore").text]) {
      expect(asked).not.toMatch(/how (far|much)/i);
      expect(asked).toMatch(/a lot or a little/);
    }
    expect(topic.insight!.foundWhen).not.toMatch(/couple of dollars/);
  });

  it("says what the 10-K says of tax: no tax line, an immaterial amount provided, losses it may set against profit (historian)", () => {
    const tax = topic.questions.find((q) => q.id === "ar-q-tax")!;
    for (const text of [flat(amazon.reveal), tax.explanation ?? "", tax.prompt]) {
      expect(text).not.toMatch(/paid no (income )?tax/);
      expect(text).not.toMatch(/can set (them )?against/);
    }
    expect(flat(amazon.reveal)).toMatch(/immaterial/);
    expect(flat(amazon.reveal)).toMatch(/\$1\.65 billion/);
  });

  it("puts the report's lines beside the bridge at Explore, its debt and cash tappable (widget fit)", () => {
    const report = topic.explore?.workbench?.inputs.report as { lines: { line: string; amount: number; lever?: string }[] };
    expect(report.lines.find((l) => l.lever === "debt")?.amount).toBe(2_127);
    expect(report.lines.find((l) => l.lever === "cash")?.amount).toBe(1_101);
    const shown = draftOf("ar-explore").widgets[0];
    expect((shown.params as { inputs: Record<string, unknown> }).inputs.report).toEqual(report);
  });

  it("asks which assumption moves the value most, and the engine keys the mature margin (review F03)", () => {
    const q = computedKeyedQuestion(map, "ar-q-lever")!;
    expect(q.prompt).toMatch(/which assumption moves the value most/);
    expect(q.answer).toBe("margin");
    // From $35.04: margin 10% to 8% gives $21.57, the report's debt $29.82, its cash $38.20.
    expect(Object.fromEntries(q.choices.map((c) => [c.id, c.figure]))).toEqual({ margin: "$21.57", debt: "$29.82", cash: "$38.20" });
  });

  it("teaches the report's deeper loss as evidence against the mature margin, not as what the value rested on (review F03)", () => {
    const insight = topic.insight!;
    for (const text of [flat(amazon.reveal), insight.written, insight.foundWhen]) {
      expect(text).not.toMatch(/(loss|deeper) (is|was) the number/);
      expect(text).toMatch(/margin/);
      expect(text).toMatch(/evidence against|harder to believe/);
    }
  });
});
