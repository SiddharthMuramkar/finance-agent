import { describe, expect, it } from "vitest";
import { drawTemplate } from "@/teaching";
import { loadCourseMap, readOutlineText, writtenQuestions, type Topic } from "./map";
import { parseOutline } from "./outline";
import { textsIn } from "./topic-texts";

// The Case as-of rule for Growth and compounding (ticket #247, criterion 3). The Learner stands at 31 March
// 1992. Nothing the Topic teaches with (cards, Quick tries and their choices, templates and their draws, fix lines, a
// question's mix-up fixes, Widget presets, Skills, terms and the Running example) may hold a number that only the reveal
// or the outline's outcome knows: the April peak of 4,467, the 12.77% fall, the 56% drop, the 1,980 level, the 126%
// rise, the long-run 33% a year, and so on.
// The Sensex's own figures stay in the story and the conversation Check.

const topic = loadCourseMap().topic("num-compounding")!;
const outcome = parseOutline(readOutlineText()).outline!.topics.find((t) => t.id === "num-compounding")!.cases[0].outcome;
const sensex = topic.cases[0];

/** Every number written in a text, without its sign or grouping commas (Indian or Western): "₹1,33,100" is 133100. */
const numbersIn = (text: string) => [...text.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, "").replace(/\.$/, "")));

const told = new Set(numbersIn(sensex.story));
const later = [...new Set(numbersIn(`${sensex.reveal} ${outcome}`))].filter((n) => !told.has(n));

/** Every number anywhere in a value: what a Widget preset carries beside its words. */
function numbersOf(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.flatMap(numbersOf);
  if (value && typeof value === "object") return Object.values(value).flatMap(numbersOf);
  return [];
}

/**
 * The teaching texts and numbers, each with where it is: the Topic's examples and the teaching that follows its questions
 * and story (topic-texts.ts), then the numbers no text holds: the Running example's, preset values, template draws and
 * Quick-try answers.
 */
function teaching(t: Topic): { where: string; numbers: number[] }[] {
  const out = textsIn(t, ["example", "teaching"]).map(({ where, text }) => ({ where, numbers: numbersIn(text) }));
  if (t.runningExample) out.push({ where: "the Running example's numbers", numbers: t.runningExample.numbers });
  for (const x of t.templates) {
    for (const halfDone of x.halfDone ? [false, true] : [false]) {
      for (let i = 0; i < 200; i++) {
        const item = drawTemplate(x, `leak-${i}`, { halfDone });
        out.push({ where: `template ${x.id} draw ${item.id}: ${item.prompt}`, numbers: [...numbersIn(item.prompt), ...Object.values(item.params).map(Number), Number(item.answer.scaled) / 10 ** item.answer.scale] });
      }
    }
  }
  for (const c of t.checks) {
    if (c.card?.widget) out.push({ where: `Check ${c.id} card preset values`, numbers: numbersOf(c.card.widget) });
    for (const q of c.quickTries) {
      if (!("id" in q)) continue;
      out.push({ where: `Check ${c.id} Quick try ${q.id} answers`, numbers: [q.answer, ...(q.mistakes ?? []).map((m) => m.answer)].filter((v): v is number => typeof v === "number") });
    }
  }
  return out;
}

describe("Growth and compounding keeps to the Case's as-of date", () => {
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
    expect(leaks).toEqual(['Check "cp-quiz-compounding" card line 5: 4467']);
  });

  it("fails a Quick-try choice, a question's mix-up fix and a term's line from the story that name a later figure", () => {
    const broken = structuredClone(topic);
    const tap = broken.checks[0].quickTries.find((q) => "id" in q && q.id === "cp-try-grow-half")!;
    if (!("id" in tap) || !tap.choices) throw new Error("cp-try-grow-half is a choice Quick try");
    tap.choices[1].text = "It peaks at 4,467 in April";
    writtenQuestions(broken)[0].choices.find((c) => c.mistake)!.mistake!.fix = "The Sensex then fell 56%.";
    broken.terms[0].inStory = "The Sensex rose 126% in a year.";
    const leaks = teaching(broken).flatMap(({ where, numbers }) => numbers.filter((n) => later.includes(n)).map((n) => `${where}: ${n}`));
    expect(leaks).toEqual([
      expect.stringMatching(/^question ".*" choice ".*" fix: 56$/),
      `term "${broken.terms[0].term}" in the story: 126`,
      'Check "cp-quiz-compounding" Quick try "cp-try-grow-half" choice "b": 4467',
    ]);
  });
});
