import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// #507: the Check fr-quiz-regimes comes before the reveal. The Case is
// Thailand's baht on 1 July 1997, still pegged to a basket; the move to a
// managed float on 2 July is the outcome. A pre-reveal question that defines
// "managed float" must not describe the baht, or it tells the ending.
type Choice = { id: string; text: string };
type Question = { id: string; prompt: string; choices: Choice[] };
type Check = { id: string; kind: string; questions?: string[] };
type Topic = { questions: Question[]; checks: Check[] };

const doc = parse(
  readFileSync(join(process.cwd(), "course/topics/fx-regimes-crises.yaml"), "utf8"),
) as Topic;

describe("#507 fx-regimes-crises pre-reveal Check keeps the Case's outcome hidden", () => {
  const check = doc.checks.find((c) => c.id === "fr-quiz-regimes");

  it("fr-q-managed-float is still drawn by the Check fr-quiz-regimes", () => {
    expect(check?.questions).toContain("fr-q-managed-float");
  });

  it("fr-q-managed-float names no baht in its prompt or choices", () => {
    const q = doc.questions.find((x) => x.id === "fr-q-managed-float");
    if (!q) throw new Error("no question fr-q-managed-float");
    expect(q.prompt).not.toMatch(/baht/i);
    for (const c of q.choices) expect(c.text, `choice ${c.id}`).not.toMatch(/baht/i);
  });

  it("no Check question links the baht to a float before the reveal", () => {
    for (const id of check?.questions ?? []) {
      const q = doc.questions.find((x) => x.id === id);
      if (!q) throw new Error(`no question ${id}`);
      for (const text of [q.prompt, ...q.choices.map((c) => c.text)]) {
        expect(text, `${id}: ${text}`).not.toMatch(/baht[^.]*\bfloat|float[^.]*\bbaht/i);
      }
    }
  });
});
