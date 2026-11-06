import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { checkReply, countWords, type OpenItem, type ReplyCheckContext } from "@/tutor/reply-checks";
import { E2E_SCRIPTS, draftOf, freshScriptReplies, type E2eScriptName } from "./e2e-tutor";

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
    expect(Object.keys(E2E_SCRIPTS).sort()).toEqual(["concept-reply-widget", "plain-reply", "quiz-open", "stage-reply-2", "stage-reply-3", "stage-reply-4", "story-reply"]);
    for (const name of Object.keys(E2E_SCRIPTS) as E2eScriptName[]) {
      expect({ name, problems: checkReply(draftOf(name), context(name)) }).toEqual({ name, problems: [] });
    }
    expect(countWords(draftOf("story-reply").text)).toBeLessThanOrEqual(120);
    expect(draftOf("concept-reply-widget").widgets).toHaveLength(1);
    // E5's stage scripts: each shows one Widget, and no two share a title, so a Session keeps one thumbnail each.
    const stageTitles = (["concept-reply-widget", "stage-reply-2", "stage-reply-3", "stage-reply-4"] as E2eScriptName[]).map((name) => {
      const widgets = draftOf(name).widgets;
      expect(widgets, name).toHaveLength(1);
      return String((widgets[0].params as { title?: unknown }).title);
    });
    expect(new Set(stageTitles).size).toBe(4);
    // Tool calls are recorded once per tool-call id across the whole database, so each played turn needs fresh ids:
    // two plays of one script must not share a tool_use id, or the second play's Widget never draws.
    const idsOf = (replies: ReturnType<typeof freshScriptReplies>) =>
      replies.flatMap((r) => ("content" in r ? r.content.filter((b) => b.type === "tool_use").map((b) => String(b.id)) : []));
    const first = idsOf(freshScriptReplies("stage-reply-2"));
    const second = idsOf(freshScriptReplies("stage-reply-2"));
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(second[0]).not.toBe(first[0]);
    expect(draftOf("plain-reply").widgets).toHaveLength(0);
  });
});
