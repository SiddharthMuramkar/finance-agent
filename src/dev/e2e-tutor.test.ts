import { describe, expect, it } from "vitest";
import { loadCourseMap, writtenQuestions } from "@/course/map";
import type { TeachingStep } from "@/course/navigator";
import { pickCompanion } from "@/tutor/companion";
import { checkReply, countWords, type OpenItem, type ReplyCheckContext, type StepKind } from "@/tutor/reply-checks";
import { E2E_SCRIPTS, SPINE_ONE_SAYS, draftOf, freshScriptReplies, type E2eScriptName } from "./e2e-tutor";

const map = loadCourseMap();
const topic = map.topic("num-percent-bps")!;

/** Every question the Topic defines, as an open quiz would hold them: the widest set of numbers a reply must not quote. */
const openItems: OpenItem[] = writtenQuestions(topic).map((q) => ({
  prompt: q.prompt,
  choices: q.choices.map((c) => c.text),
  answer: q.choices.find((c) => c.id === q.answer)?.text,
}));

/** Spine Topic 1 (spine-01-worth), whose scripts e2e/spine-01.spec.ts plays: dollars throughout, its own ids kept out. */
const spine = map.topic("spine-01-worth")!;
const spineItems: OpenItem[] = [
  ...writtenQuestions(spine).map((q) => ({ prompt: q.prompt, choices: q.choices.map((c) => c.text), answer: q.choices.find((c) => c.id === q.answer)?.text })),
  // Its Quick tries' words too: a reply at a Check step may not hand over any of them either.
  ...spine.checks.flatMap((c) =>
    c.quickTries.flatMap((q) => ("choices" in q && Array.isArray(q.choices) ? [{ prompt: String(q.ask), choices: q.choices.map((x) => x.text), answer: q.choices.find((x) => x.id === q.answer)?.text }] : [])),
  ),
];
const isSpine = (name: E2eScriptName) => /^spine[123]-/.test(name);
/** Spine Topics 2 and 3's first turns (#89, e2e/spine-02-03.spec.ts) are checked against their own Topics. */
const SPINE_OF = { "spine2-": map.topic("spine-02-money-later")!, "spine3-": map.topic("spine-03-cash")! } as const;
/** #93's three-turn play of the annual report Topic (e2e/spine-annual-report.spec.ts). */
const annualReport = map.topic("spine-annual-report")!;
const isReport = (name: E2eScriptName) => name.startsWith("ar-");
const topicOf = (name: E2eScriptName) =>
  isReport(name) ? annualReport : (Object.entries(SPINE_OF).find(([prefix]) => name.startsWith(prefix))?.[1] ?? (isSpine(name) ? spine : topic));

const context = (name: E2eScriptName): ReplyCheckContext => {
  const t = topicOf(name);
  const checkStep = E2E_SCRIPTS[name].step === "check";
  return {
    step: E2E_SCRIPTS[name].step,
    exampleCurrency: isSpine(name) || isReport(name) ? "USD" : "INR",
    caseCurrencies: ["USD"],
    openItems: name === "quiz-open" ? openItems : isSpine(name) && checkStep ? spineItems : [],
    internalWords: [t.id, ...t.checks.map((c) => c.id), ...t.questions.map((q) => q.id)],
  };
};

describe("the scripted Tutor", () => {
  it("every named script passes the reply checks", () => {
    expect(Object.keys(E2E_SCRIPTS).sort()).toEqual([
      "ar-concept",
      "ar-explore",
      "ar-story",
      "concept-percent-change",
      "concept-reply-widget",
      "concept-two-ways",
      "persona-bank-cut",
      "persona-bps-short",
      "persona-one-hundred",
      "persona-one-more",
      "persona-why-tiny",
      "plain-reply",
      "quiz-open",
      "rejected-draft",
      "reveal-reply",
      "reveal-reply-widget",
      "spine1-complete",
      "spine1-concept",
      "spine1-explore",
      "spine1-go-deeper",
      "spine1-insight",
      "spine1-principle",
      "spine1-quiz-open",
      "spine1-reveal",
      "spine1-story",
      "spine1-talk-concept",
      "spine1-talk-pass",
      "spine1-talk-prompt",
      "spine1-talk-your-turn",
      "spine1-your-turn",
      "spine2-concept",
      "spine2-explore",
      "spine2-story",
      "spine3-concept",
      "spine3-explore",
      "spine3-story",
      "stage-reply-2",
      "stage-reply-3",
      "stage-reply-4",
      "story-hike",
      "story-reply",
      "story-trader",
      "your-turn-reply",
    ]);
    // rejected-draft's first draft is the one script the checks must reject (A1): its retry is what passes.
    for (const name of (Object.keys(E2E_SCRIPTS) as E2eScriptName[]).filter((n) => n !== "rejected-draft")) {
      expect({ name, problems: checkReply(draftOf(name), context(name)) }).toEqual({ name, problems: [] });
    }
    expect(checkReply(draftOf("rejected-draft"), context("rejected-draft")).map((p) => p.rule)).toContain("V1");
    // Its retry, which the gate's second run of the turn plays, is the same words as concept-two-ways, which pass.
    const retry = freshScriptReplies("rejected-draft", true)[0] as { content: { type: string; text?: string }[] };
    expect(retry.content[0].text).toBe((E2E_SCRIPTS["concept-two-ways"].replies[0] as { content: { text: string }[] }).content[0].text);
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

/** Spine Topic 1's play (e2e/spine-01.spec.ts): its tool calls do what the real Tutor's do, with what the Learner types. */
describe("Spine Topic 1's scripted Tutor", () => {
  const toolUses = (name: E2eScriptName) =>
    (E2E_SCRIPTS[name].replies as ReturnType<typeof freshScriptReplies>).flatMap((r) => ("content" in r ? r.content.filter((b) => b.type === "tool_use") : [])) as unknown as {
      name: string;
      input: Record<string, unknown>;
    }[];

  it("shows the Topic's explore Workbench, bound to its Case, with the story worth the price", () => {
    const bench = spine.explore?.workbench;
    expect(bench?.recipe).toBe("value_levers");
    const [show] = toolUses("spine1-explore");
    expect(show.name).toBe("show_widget");
    expect(show.input.recipe).toBe(bench!.recipe);
    const params = show.input.params as { title: string; inputs: Record<string, unknown> };
    expect(params.title).toBe(bench!.title);
    expect(params.inputs).toEqual({ case: bench!.case, ...bench!.inputs });
    expect(draftOf("spine1-explore").widgets).toHaveLength(1);
  });

  it("gives Topic 1's Go deeper material in the Topic file's own words when the Learner presses Go deeper (spec #68)", () => {
    const flat = (t: string) => t.replace(/\s+/g, " ").trim();
    const [body] = draftOf("spine1-go-deeper").text.split("\n\n");
    expect(spine.goDeeper).toBeDefined();
    expect(flat(spine.goDeeper!)).toContain(flat(body));
    expect(checkReply(draftOf("spine1-go-deeper"), { ...context("spine1-go-deeper"), replyKind: "go_deeper" })).toEqual([]);
  });

  it("records the Insight in words the Learner typed, and passes the conversation Check by its id", () => {
    const [insight] = toolUses("spine1-insight");
    expect(insight.name).toBe("record_insight_attempt");
    expect(insight.input.outcome).toBe("found");
    expect(SPINE_ONE_SAYS.insight).toContain(String(insight.input.learner_words));
    const [verdict] = toolUses("spine1-talk-pass");
    expect(verdict.name).toBe("record_check_verdict");
    const talk = spine.checks.find((c) => c.kind === "conversation")!;
    expect(verdict.input).toMatchObject({ check_id: talk.id, verdict: "pass" });
    // What the Learner types at each step is within a message's reach, and says the Topic's own figures.
    expect(countWords(SPINE_ONE_SAYS.talk)).toBeLessThanOrEqual(120);
    for (const figure of ["$60bn", "12.5%", "$84"]) expect(SPINE_ONE_SAYS.insight).toContain(figure);
  });
});

/**
 * E4a, test 4 (now e2e/widget-when-it-fits.spec.ts; B6: asked what a word means): each scripted reply, played at its step, brings the Companion Widget
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
        const picked = pickCompanion({ topic, place: { step: place.step as TeachingStep, check: place.check }, replyText: draftOf(script).text, shownThisSession: shown, blocked: [], learnerText: title.startsWith("Lingo:") ? "What does that word mean?" : null });
        expect({ script, title: picked?.params.title }).toEqual({ script, title });
        if (picked?.kind === "scene") shown.scenes.push(picked.key);
        if (picked?.kind === "lingo") shown.terms.push(picked.key);
      }
    }
  });
});

describe("the annual report Topic's scripted Tutor (#93)", () => {
  const flat = (t: string) => t.replace(/\s+/g, " ");
  const [amazon] = annualReport.cases;

  it("opens on Amazon's 10-K with the six numbers to find, in figures from the Topic's own Case", () => {
    expect(E2E_SCRIPTS["ar-story"].step).toBe("story");
    const said = draftOf("ar-story").text;
    for (const figure of ["$35.08", "$84", "$349 million", "$26 million"]) {
      expect(said).toContain(figure);
      expect(flat(amazon.story)).toContain(figure);
    }
    expect(said).toMatch(/sales, operating profit, tax, debt, cash and shares/);
  });

  it("names the two pages at Concept, and shows the Value bridge on the Topic's Amazon Case at Explore", () => {
    expect(draftOf("ar-concept").text).toMatch(/income statement/);
    expect(draftOf("ar-concept").text).toMatch(/balance sheet/);
    const shown = draftOf("ar-explore").widgets;
    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({ id: "value_bridge", params: { inputs: { case: "spine-ar-amazon-2000" } } });
    expect(annualReport.explore?.workbench).toMatchObject({ recipe: "value_bridge", case: "spine-ar-amazon-2000" });
  });

  it("says at Concept that Japan, Korea and Europe keep the same two pages, each under the name of a Case's report (#94)", () => {
    const said = draftOf("ar-concept").text;
    const stories = annualReport.cases.map((c) => flat(c.story)).join(" ");
    for (const [market, report] of [["Japan", "yuho"], ["Korea", "business report"], ["Europe", "IFRS"]]) {
      expect(said).toContain(market);
      expect(said).toContain(report);
      expect(stories).toContain(report);
    }
  });
});
