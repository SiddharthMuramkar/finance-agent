import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { checkReply, countWords, type OpenItem, type ReplyCheckContext } from "@/tutor/reply-checks";
import { E2E_SCRIPTS, draftOf, type E2eScriptName } from "./e2e-tutor";

const map = loadCourseMap();
const topic = map.topic("num-percent-bps")!;

/** Every question the Topic defines, as an open quiz would hold them: the widest set of numbers a reply must not quote. */
const openItems: OpenItem[] = topic.questions.map((q) => ({
  prompt: q.prompt,
  choices: q.choices.map((c) => c.text),
  answer: q.choices.find((c) => c.id === q.answer)?.text,
}));

const context = (name: E2eScriptName): ReplyCheckContext => ({
  step: E2E_SCRIPTS[name].step,
  exampleCurrency: "INR",
  caseCurrencies: ["USD"],
  openItems: name === "quiz-open" ? openItems : [],
  internalWords: [topic.id, ...topic.checks.map((c) => c.id), ...topic.questions.map((q) => q.id)],
});

describe("the scripted Tutor", () => {
  it("every named script passes the reply checks", () => {
    expect(Object.keys(E2E_SCRIPTS).sort()).toEqual(["concept-reply-widget", "plain-reply", "quiz-open", "story-reply"]);
    for (const name of Object.keys(E2E_SCRIPTS) as E2eScriptName[]) {
      expect({ name, problems: checkReply(draftOf(name), context(name)) }).toEqual({ name, problems: [] });
    }
    expect(countWords(draftOf("story-reply").text)).toBeLessThanOrEqual(120);
    expect(draftOf("concept-reply-widget").widgets).toHaveLength(1);
    expect(draftOf("plain-reply").widgets).toHaveLength(0);
  });
});
