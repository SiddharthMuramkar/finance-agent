import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { storyContextFor } from "@/course/scenes";
import { falseClaims } from "@/test/true-claims";
import { checkReply, fixReply } from "@/tutor/reply-checks";
import { widgetParts, widgetProblems, widgetRuleProblems } from "@/widgets/check";
import { SHOWCASES } from "./showcases";
import { loadShowcases, showcaseWidget } from "./showcase-widgets";

const map = loadCourseMap();

// The rule of numbersIn and normalNumber (src/tutor/reply-checks.ts:567-574), copied verbatim so reply-checks.ts does not
// change (spec D3 test 3): thousands commas and signs dropped, currency symbols ignored, 4.5 and 4.50 one number.
function numbersIn(text: string): string[] {
  const found = text.match(/(?<![\p{L}\p{N}_.])(?:\d{1,3}(?:,\d{2,3})+|\d+)(?:\.\d+)?|(?<![\p{L}\p{N}_.])\.\d+/gu) ?? [];
  return found.map(normalNumber);
}

function normalNumber(raw: string): string {
  return String(Math.abs(Number(raw.replace(/,/g, ""))));
}

describe("Showcases", () => {
  it("one from each area, each naming a Widget its Topic writes ahead before the reveal", () => {
    expect(SHOWCASES.map((s) => s.area)).toEqual(["everyday", "economy", "company"]);
    for (const showcase of SHOWCASES) {
      const topic = map.topic(showcase.topic);
      expect(topic, showcase.topic).toBeTruthy();
      const named = showcase.widget;
      if (named.kind === "card" || named.kind === "growth") {
        const check = topic!.checks.find((c) => c.id === named.check);
        expect(check?.card?.widget && "recipe" in check.card.widget).toBe(true);
      } else {
        const scene = topic!.scenes.find((s) => s.id === named.scene);
        expect(scene).toBeTruthy();
        expect(scene!.step).not.toBe("reveal");
        expect(scene!.step).not.toBe("principle");
      }
    }
  });

  // Spec 2026-11-12 E6 and H5: on a page that says "You never work out a sum", the first Showcase is a picture of growth
  // (the grow_money recipe's money pile), not a Formula Card with symbols, at the Topic card's own numbers.
  it("the first Showcase's Widget is a picture of growth, not a Formula Card, at the card's own numbers", () => {
    const built = showcaseWidget(map, SHOWCASES[0])!;
    expect(built.code).toContain('MoneyStack("future_value", {amount: 1000, ratePercent: 10, years: $years}, "inr")');
    expect(built.code).not.toMatch(/FormulaCard|FV =/);
    expect(built.title).toBe("What ₹1,000 grows to at 10% a year");
    expect(built.code).toMatch(/Slider\("years", "Years it grows", 1, 30, 1, \$years, "years"\)/);
    expect(built.code).toContain("$years = 3");
  });

  it("each Widget builds, passes the checks and needs no Case Data", () => {
    for (const showcase of SHOWCASES) {
      const built = showcaseWidget(map, showcase);
      expect(built, showcase.id).not.toBeNull();
      expect(widgetProblems(built!.code)).toEqual([]);
      expect(widgetRuleProblems(built!.code)).toEqual([]);
      expect(widgetParts(built!.code).datasets).toEqual([]);
      expect(built!.title.startsWith("Illustration:")).toBe(false);
    }
  });

  it("the copy of numbersIn's rule is the Tutor's own, word for word", () => {
    const source = (path: string) => readFileSync(join(process.cwd(), "src", path), "utf8");
    const fn = (text: string, name: string) => text.match(new RegExp(`\\nfunction ${name}\\(.*?\\n}\\n`, "s"))?.[0];
    for (const name of ["numbersIn", "normalNumber"]) {
      const tutor = fn(source("tutor/reply-checks.ts"), name);
      expect(tutor, name).toBeTruthy();
      expect(fn(source("app/_landing/showcases.test.ts"), name), name).toBe(tutor);
    }
  });

  it("no invented numbers: every number in a question and reply is in the Topic file, by numbersIn's rule", () => {
    for (const showcase of loadShowcases()) {
      const yaml = readFileSync(join(process.cwd(), "course", "topics", `${showcase.topic}.yaml`), "utf8");
      const allowed = new Set(numbersIn(yaml));
      for (const found of numbersIn(`${showcase.words.question} ${showcase.words.reply}`)) expect(allowed.has(found), `${showcase.id}: ${found}`).toBe(true);
    }
  });

  it("each reply follows the Tutor's own rules and Home's, and makes no false claim", () => {
    for (const showcase of loadShowcases()) {
      const topic = map.topic(showcase.topic)!;
      expect(falseClaims(`${showcase.words.question} ${showcase.words.reply}`)).toEqual([]);
      const problems = checkReply(fixReply({ text: showcase.words.reply, widgets: [] }), {
        step: showcase.step as "concept",
        exampleCurrency: topic.exampleCurrency ?? "INR",
        caseCurrencies: [...(storyContextFor(topic).caseCurrencies ?? [])],
        openItems: [],
        internalWords: [topic.id, ...topic.checks.map((c) => c.id), ...topic.scenes.map((s) => s.id)],
      });
      expect(problems).toEqual([]);
    }
  });
});
