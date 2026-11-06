import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import type { TeachingStep } from "@/course/navigator";
import { pickCompanion } from "@/tutor/companion";
import { checkReply, countWords, type OpenItem, type ReplyCheckContext, type StepKind } from "@/tutor/reply-checks";
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
    expect(Object.keys(E2E_SCRIPTS).sort()).toEqual(["concept-percent-change", "concept-reply-widget", "concept-two-ways", "plain-reply", "quiz-open", "reveal-reply", "stage-reply-2", "stage-reply-3", "stage-reply-4", "story-hike", "story-reply", "story-trader", "your-turn-reply"]);
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

/**
 * E4a, test 4 (e2e/widget-every-reply.spec.ts): each scripted reply, played at its step, brings the Companion Widget
 * that shows its one idea (Widget fit, spec §8.9: median match ≥ 4/5). Each Session opens with the Topic's opener,
 * which takes the step's scene where code opened no Widget for the step; the replies after it then get the card for
 * the term they are about.
 */
describe("test 4's scripted replies", () => {
  type Play = { script: E2eScriptName; title: string };
  const sessions: { place: { step: StepKind; check: string | null }; openerScene: string | null; plays: Play[] }[] = [
    {
      place: { step: "story", check: null },
      openerScene: "fed-opening",
      plays: [
        { script: "story-trader", title: "Lingo: basis point" },
        { script: "story-hike", title: "Lingo: rate hike" },
      ],
    },
    {
      // Code opened the Concept card for the step, so the opener took no scene.
      place: { step: "concept", check: "pb-quiz-language" },
      openerScene: null,
      plays: [
        { script: "concept-two-ways", title: "One move, two ways to say it" },
        { script: "concept-percent-change", title: "Lingo: percent change" },
      ],
    },
    { place: { step: "your_turn", check: "pb-quiz-language" }, openerScene: null, plays: [{ script: "your-turn-reply", title: "Lingo: percentage point" }] },
    { place: { step: "reveal", check: null }, openerScene: "fed-front-page", plays: [{ script: "reveal-reply", title: "Lingo: quarter point" }] },
  ];

  it("each gets the Widget that shows its idea: its step's scene, or the card for the term it is about", () => {
    for (const { place, openerScene, plays } of sessions) {
      const shown = { scenes: openerScene ? [openerScene] : [], terms: [] as string[] };
      for (const { script, title } of plays) {
        expect(E2E_SCRIPTS[script].step, script).toBe(place.step);
        const picked = pickCompanion({ topic, place: { step: place.step as TeachingStep, check: place.check }, replyText: draftOf(script).text, shownThisSession: shown, blocked: [] });
        expect({ script, title: picked?.params.title }).toEqual({ script, title });
        if (picked?.kind === "scene") shown.scenes.push(picked.key);
        if (picked?.kind === "lingo") shown.terms.push(picked.key);
      }
    }
  });
});
