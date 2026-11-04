import { describe, expect, it } from "vitest";
import { drawTemplate } from "@/teaching";
import { loadCourseMap, readOutlineText, type Topic } from "./map";
import { parseOutline } from "./outline";

// The Case as-of rule for Growth, compounding and logs (ticket #247, criterion 3). The Learner stands at 31 March
// 1992. Nothing the Topic teaches with (cards, Quick tries, templates and their draws, fix lines, Widget presets, Skills,
// terms and the Running example) may hold a number that only the reveal or the outline's outcome knows: the April
// peak of 4,467, the 12.77% fall, the 56% drop, the 1,980 level, the 126% rise, the long-run 33% a year, and so on.
// The Sensex's own figures stay in the story and the conversation Check.

const topic = loadCourseMap().topic("num-compounding")!;
const outcome = parseOutline(readOutlineText()).outline!.topics.find((t) => t.id === "num-compounding")!.cases[0].outcome;
const sensex = topic.cases[0];

/** Every number written in a text, without its sign or grouping commas (Indian or Western): "₹1,33,100" is 133100. */
const numbersIn = (text: string) => [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "").replace(/\.$/, "")));

const told = new Set(numbersIn(sensex.story));
const later = [...new Set(numbersIn(`${sensex.reveal} ${outcome}`))].filter((n) => !told.has(n));

/** Every string and number anywhere in a value: what a Widget preset carries. */
function leaves(value: unknown): (string | number)[] {
  if (typeof value === "string" || typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(leaves);
  if (value && typeof value === "object") return Object.values(value).flatMap(leaves);
  return [];
}

/** The teaching texts and numbers, each with where it is. */
function teaching(t: Topic): { where: string; numbers: number[] }[] {
  const out: { where: string; numbers: number[] }[] = [];
  const text = (where: string, s: string) => out.push({ where, numbers: numbersIn(s) });
  if (t.runningExample) out.push({ where: "running example", numbers: [...numbersIn(t.runningExample.text), ...t.runningExample.numbers] });
  for (const term of t.terms) text(`term ${term.term}`, `${term.term} ${term.means}`);
  for (const s of t.skills) text(`skill ${s.id}`, `${s.rule} ${s.analogy ?? ""}`);
  for (const x of t.templates) {
    text(`template ${x.id}`, [x.ask, x.halfDone?.shows ?? "", ...x.mistakes.map((m) => m.fix)].join(" "));
    for (const halfDone of x.halfDone ? [false, true] : [false]) {
      for (let i = 0; i < 200; i++) {
        const item = drawTemplate(x, `leak-${i}`, { halfDone });
        out.push({ where: `template ${x.id} draw ${item.id}: ${item.prompt}`, numbers: [...numbersIn(item.prompt), ...Object.values(item.params).map(Number), Number(item.answer.scaled) / 10 ** item.answer.scale] });
      }
    }
  }
  for (const c of t.checks) {
    if (c.card) {
      text(`Check ${c.id} card`, [c.card.title, ...c.card.lines, c.card.writeDown].join(" "));
      if (c.card.widget) {
        const values = leaves(c.card.widget);
        out.push({ where: `Check ${c.id} card preset`, numbers: values.flatMap((v) => (typeof v === "number" ? [v] : numbersIn(v))) });
      }
    }
    for (const q of c.quickTries) {
      if (!("id" in q)) continue;
      text(`Check ${c.id} Quick try ${q.id}`, [q.ask, q.halfDone ?? "", ...(q.mistakes ?? []).map((m) => m.fix)].join(" "));
      out.push({ where: `Check ${c.id} Quick try ${q.id} answers`, numbers: [q.answer, ...(q.mistakes ?? []).map((m) => m.answer)].filter((v): v is number => typeof v === "number") });
    }
  }
  return out;
}

describe("Growth, compounding and logs keeps to the Case's as-of date", () => {
  it("knows which numbers only the reveal and the outcome hold", () => {
    for (const n of [4467, 12.77, 56, 1980, 126, 33]) expect(later, String(n)).toContain(n);
    for (const n of [4285, 13, 100, 1000]) expect(later, String(n)).not.toContain(n);
  });

  it("holds none of them in any card, Quick try, template draw, fix line, preset, Skill, term or the Running example", () => {
    const leaks = teaching(topic).flatMap(({ where, numbers }) => numbers.filter((n) => later.includes(n)).map((n) => `${where}: ${n}`));
    expect(leaks).toEqual([]);
  });

  it("fails a card line that names the April peak", () => {
    const broken = structuredClone(topic);
    broken.checks[0].card!.lines.push("The Sensex later peaked at 4,467.");
    const leaks = teaching(broken).flatMap(({ where, numbers }) => numbers.filter((n) => later.includes(n)).map((n) => `${where}: ${n}`));
    expect(leaks).toEqual(["Check cp-quiz-compounding card: 4467"]);
  });
});
