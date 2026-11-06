import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// PR #492 pre-merge review (math-police + historian): wrong-choice mix-up
// fixes must name the real slip, read plainly and claim only what the
// question's cited source backs.
type Choice = { id: string; text: string; mistake?: { tag: string; fix: string } };
type Question = { id: string; choices: Choice[]; answer: string };

function choice(topic: string, question: string, id: string): Choice {
  const text = readFileSync(join(process.cwd(), `course/topics/${topic}.yaml`), "utf8");
  const doc = parse(text) as { questions: Question[] };
  const q = doc.questions.find((x) => x.id === question);
  if (!q) throw new Error(`no question ${question} in ${topic}`);
  const c = q.choices.find((x) => x.id === id);
  if (!c) throw new Error(`no choice ${id} in ${question}`);
  return c;
}

const words = (s: string) => s.trim().split(/\s+/).length;

describe("PR #492 pre-merge content fixes", () => {
  it("CG-MP1: ef-q-technical choice c is not a second right answer (no index fund)", () => {
    const c = choice("mkt-efficiency", "ef-q-technical", "c");
    expect(c.text).not.toMatch(/index fund/i);
    expect(c.mistake?.tag).not.toBe("index_as_edge");
    expect(c.mistake?.fix).toMatch(/semi-strong/i);
    expect(words(c.mistake?.fix ?? "")).toBeLessThanOrEqual(20);
  });

  it("CG-MP2: ef-q-technical choice b fix reads plainly", () => {
    const fix = choice("mkt-efficiency", "ef-q-technical", "b").mistake?.fix ?? "";
    expect(fix).not.toMatch(/strong-form failure|private tips/i);
    expect(fix).toMatch(/past prices only/i);
  });

  it("CG-L-BS: ox-q-assumption choice c fix does not read as assuming risk-neutral investors", () => {
    const fix = choice("der-option-pricing", "ox-q-assumption", "c").mistake?.fix ?? "";
    expect(fix).not.toMatch(/assumes no taste for risk/i);
    expect(fix).toMatch(/needs no view on risk/i);
  });

  it("CG-L-GDP: gdp-q-recession choice c fix makes no absolute 'never' claim", () => {
    const fix = choice("eco-gdp-cycles", "gdp-q-recession", "c").mistake?.fix ?? "";
    expect(fix).not.toMatch(/never/i);
    expect(fix).toMatch(/real output/i);
  });

  it("CG-L-HMR: hmr-q-before-oct-1979 choice b fix does not date the gold link", () => {
    const fix = choice("hist-macro-regimes", "hmr-q-before-oct-1979", "b").mistake?.fix ?? "";
    expect(fix).not.toMatch(/earlier/i);
    expect(fix).toMatch(/money growth/i);
  });
});
