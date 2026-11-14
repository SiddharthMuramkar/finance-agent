import { describe, expect, it } from "vitest";
import { connectionsCheckErrors } from "./connections-check";
import { goalCheckErrors } from "./goal-check";
import { lessonLintErrors } from "./lesson-lint";
import { spineCheckErrors } from "./spine-check";
import { spineData, spineMap, spineTopic, SPINE_TOPIC_DATA } from "./spine-fixture";

// Lesson lint L13 and L14 (spec 2026-11-12, D2 and D4): a Spine Topic's Check tests judgement, and a computed question
// has one clear right answer, checked through the valuation engine. The Spine fixture is Spine Topic 1 on Amazon.

const lint = (data: object = SPINE_TOPIC_DATA) => lessonLintErrors(spineMap(data).topics, { notYet: [], l10NotYet: [] });
const rule = (errors: string[], name: string) => errors.filter((e) => e.startsWith(`${name}:`));

describe("the Spine fixture", () => {
  it("passes the lesson lint, the Spine check, the goal and why check and the Connections check", () => {
    const topics = spineMap().topics;
    expect(lint()).toEqual([]);
    expect(spineCheckErrors(topics)).toEqual([]);
    expect(goalCheckErrors(topics)).toEqual([]);
    expect(connectionsCheckErrors(topics)).toEqual([]);
  });
});

describe("L13: a Spine Check tests judgement (D4)", () => {
  it("fails a Check that draws from fewer than six questions", () => {
    const five = spineData((d) => void (d.checks[0].questions = d.checks[0].questions!.slice(0, 5)));
    expect(rule(lint(five), "L13")).toEqual(['L13: Spine Check "worth-check" draws from 5 of the Topic\'s questions; it needs at least 6 (Topic "spine-01-worth")']);
  });

  it("fails a Check with fewer than four judgement questions", () => {
    // Three of the six lose their kind: they ask what something is, not a judgement.
    const plain = spineData((d) => {
      for (const q of d.questions) if (q.id === "worth-q-direction" || q.id === "worth-q-hold" || q.id === "worth-q-pricevalue") delete (q as { kind?: string }).kind;
    });
    expect(rule(lint(plain), "L13")).toEqual(['L13: Spine Check "worth-check" has 3 judgement questions (a kind from D1); it needs at least 4 (Topic "spine-01-worth")']);
  });

  it("fails a Check with no computed question", () => {
    const written = spineData((d) => {
      d.questions = d.questions.filter((q) => !("computed" in q));
      const extra = d.questions.map((q) => ({ ...q, id: `${q.id}-2` }));
      d.questions.push(...extra);
      d.checks[0].questions = d.questions.map((q) => q.id);
      d.checks[0].quickTries = d.checks[0].quickTries!.filter((q) => !("computed" in q));
      d.checks[0].quickTries!.push({ ...(d.checks[0].quickTries![1] as object), id: "worth-try-pv-4" } as never);
    });
    expect(rule(lint(written), "L13")).toEqual(['L13: Spine Check "worth-check" has no computed question (which_lever, price_assumes or predict); it needs at least 1 (Topic "spine-01-worth")']);
  });

  it("fails a Spine Check question that asks what a term is called", () => {
    for (const ask of ["What is the result called?", "Which word means what buyers pay?", "What is the term for what buyers pay?", "What is the name for what buyers pay?"]) {
      const named = spineData((d) => void (d.questions.find((q) => q.id === "worth-q-pricevalue")!.prompt = ask));
      expect(rule(lint(named), "L13")).toHaveLength(1);
      expect(rule(lint(named), "L13")[0]).toMatch(/question "worth-q-pricevalue" asks what a term is called/);
    }
  });

  it("leaves a Topic off the Spine alone", () => {
    const elective = spineMap().topics.map((t) => ({ ...t, stage: "foundation" as const, checks: t.checks.map((c) => (c.kind === "quiz" ? { ...c, questions: c.questions.slice(0, 2) } : c)) }));
    expect(rule(lessonLintErrors(elective, { notYet: [], l10NotYet: [] }), "L13")).toEqual([]);
  });
});

describe("L14: a computed question is never a coin toss (D2)", () => {
  it("rejects a which-lever question in which another choice is within 5% of the right one", () => {
    // B3: revenue to $49bn gives $46.28 against margin's $48.51, 4.6% apart.
    const tie = spineData((d) => {
      const q = d.questions.find((x) => x.id === "worth-q-lever") as { computed: { changes: { id: string; levers: object }[] } };
      q.computed.changes.find((c) => c.id === "revenue")!.levers = { revenueYear10: 49000 };
    });
    expect(rule(lint(tie), "L14")).toEqual(['L14: question "worth-q-lever": "revenue" ($46.28) comes within 5% of the right choice "margin" ($48.51), so the question is a coin toss (Topic "spine-01-worth")']);
  });

  it("rejects a what-the-price-assumes question with no story within 5% of the price", () => {
    const far = spineData((d) => {
      const q = d.questions.find((x) => x.id === "worth-q-price") as { computed: { changes: unknown[] } };
      q.computed.changes = q.computed.changes.slice(1);
    });
    expect(rule(lint(far), "L14")).toEqual(['L14: question "worth-q-price": no story it shows comes within 5% of the $84 price (Topic "spine-01-worth")']);
  });

  it("checks a computed Quick try the same way, and leaves the try unshown", () => {
    const tie = spineData((d) => {
      const t = d.checks[0].quickTries!.find((q) => "computed" in q) as { computed: { changes: { id: string; label: string; levers: object }[] } };
      t.computed.changes.push({ id: "revenue", label: "Revenue in year 10 $39bn to $49bn", levers: { revenueYear10: 49000 } });
    });
    expect(rule(lint(tie), "L14")).toEqual(['L14: Check "worth-check" Quick try "worth-try-lever-computed": "revenue" ($46.28) comes within 5% of the right choice "margin" ($48.51), so the question is a coin toss (Topic "spine-01-worth")']);
  });

  it("rejects a predict question whose change lands in no band", () => {
    const gap = spineData((d) => {
      const q = d.questions.find((x) => x.id === "worth-q-predict") as { computed: { bands: unknown[] } };
      q.computed.bands = q.computed.bands.slice(0, 2);
    });
    expect(rule(lint(gap), "L14")).toEqual(['L14: question "worth-q-predict": change "thin" ($0, from $35.04) lands in 0 bands; it must land in exactly one (Topic "spine-01-worth")']);
  });

  it("leaves L10 as it was: a computed question that asks for a sum still fails it", () => {
    const sum = spineData((d) => void (d.questions.find((q) => q.id === "worth-q-lever")!.prompt = "Calculate which change lifts the value most."));
    expect(rule(lint(sum), "L10")).toHaveLength(1);
  });
});

describe("a computed Quick try in the lesson lint", () => {
  it("counts as a choice try with a fix on every wrong choice (L12) and a Skill its Check tests (L8)", () => {
    const t = spineTopic();
    const tryItem = t.checks[0].quickTries.find((q) => "id" in q && q.id === "worth-try-lever-computed");
    expect(tryItem && "choices" in tryItem && tryItem.choices?.filter((c) => c.mistake).length).toBe(2);
    expect(rule(lint(), "L12")).toEqual([]);
  });
});
