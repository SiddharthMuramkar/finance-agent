import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { widgetProblems, widgetRuleProblems } from "@/widgets/check";
import { buildStoryRecipe, headlineParamsForScene, parseHeadlineRef, SET_STORY, STORY_RECIPE_IDS, storyChecks, type StoryContext } from "./set-story";

// Story recipes (spec 2026-11-05, ticket E3, Tests first 1): the Tutor and Topic files open the nine story parts
// through recipes whose words are checked before they show (emoji, as-of dates, currency, no sum, no digits).

const byId = (id: string) => {
  const recipe = SET_STORY.find((r) => r.id === id);
  if (!recipe) throw new Error(`no story recipe ${id}`);
  return recipe;
};

const storyScene = (over: Record<string, unknown> = {}) => ({
  title: "The day before the decision",
  inputs: {
    cast: [
      { id: "fed", emoji: "bank", name: "The central bank", role: "sets the rate" },
      { id: "saver", emoji: "woman", name: "Asha", role: "owns bonds" },
    ],
    beats: [
      { who: "narrator", says: "It is February, and everyone expects calm." },
      { who: "narrator", says: "Tomorrow, the central bank gives its decision." },
      { who: "saver", says: "If the rate rises, my old bonds lose their shine." },
    ],
    caption: "Everyone waits for tomorrow's decision",
    date: "1994-02-03",
    ...over,
  },
  refs: {},
  facts: {},
});

const timeline = {
  title: "How the story unfolded",
  inputs: {
    beats: [
      { date: "1993-12-01", label: "Calm markets", emoji: "sun" },
      { date: "1994-02-04", label: "The rate goes up", emoji: "bank" },
      { date: "1994-05-09", label: "Prices keep falling", emoji: "chart-decreasing" },
    ],
  },
  refs: {},
  facts: {},
};

describe("story recipes", () => {
  it("are the nine, with their archetypes", () => {
    expect(STORY_RECIPE_IDS).toEqual(["story_scene", "lingo_card", "timeline", "two_paths", "money_jar", "who_pays_whom", "myth_or_fact", "headline", "choice_cards"]);
    expect(Object.fromEntries(SET_STORY.map((r) => [r.id, r.archetype]))).toEqual({
      story_scene: "Story",
      lingo_card: "Lingo",
      timeline: "History",
      two_paths: "Story",
      money_jar: "Grow",
      who_pays_whom: "Chain",
      myth_or_fact: "Check",
      headline: "History",
      choice_cards: "Check",
    });
  });

  it("refuses an emoji name that is not in the registry, naming it", () => {
    const bad = storyScene({
      cast: [
        { id: "fed", emoji: "pizza-slice", name: "The central bank" },
        { id: "saver", emoji: "woman", name: "Asha" },
      ],
    });
    const built = byId("story_scene").build(bad);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error).toContain('emoji "pizza-slice" is not in src/emoji/registry.ts');
  });

  it("refuses a beat that asks for a sum", () => {
    const bad = storyScene({
      beats: [
        { who: "narrator", says: "Work out the EMI?" },
        { who: "narrator", says: "Tomorrow, the central bank gives its decision." },
      ],
    });
    const built = byId("story_scene").build(bad);
    expect(built.ok).toBe(false);
    if (!built.ok) expect(built.error).toMatch(/sum/i);
  });

  it("refuses a beat after the Case's as-of date before the reveal, and accepts it at reveal", () => {
    const atConcept: StoryContext = { asOf: "1994-02-03", step: "concept" };
    const atReveal: StoryContext = { asOf: "1994-02-03", step: "reveal" };
    expect(storyChecks(timeline.inputs, atConcept).join(" ")).toContain("1994-05-09");
    expect(storyChecks(timeline.inputs, atReveal)).toEqual([]);
    expect(buildStoryRecipe(byId("timeline"), timeline, atConcept).ok).toBe(false);
    expect(buildStoryRecipe(byId("timeline"), timeline, atReveal).ok).toBe(true);
    // Without any step, code holds the story to the as-of date too (before the reveal is the safe side).
    expect(storyChecks(timeline.inputs, { asOf: "1994-02-03" }).length).toBeGreaterThan(0);
  });

  it("refuses a dollar amount in a rupee Topic with no dollar Case, and allows it with one", () => {
    const withDollar = storyScene({
      beats: [
        { who: "saver", says: "I paid $5 for that bond, in cash." },
        { who: "narrator", says: "Tomorrow, the central bank gives its decision." },
      ],
    });
    const inr: StoryContext = { exampleCurrency: "INR", caseCurrencies: [] };
    expect(storyChecks(withDollar.inputs, inr).join(" ")).toMatch(/dollar/i);
    expect(buildStoryRecipe(byId("story_scene"), withDollar, inr).ok).toBe(false);
    expect(storyChecks(withDollar.inputs, { exampleCurrency: "INR", caseCurrencies: ["USD"] })).toEqual([]);
    expect(storyChecks(withDollar.inputs, { exampleCurrency: "USD", caseCurrencies: [] })).toEqual([]);
  });

  it("refuses digits in a TwoPaths outcome line and in MoneyJar words", () => {
    const paths = byId("two_paths").build({
      title: "Two savers, two choices",
      inputs: {
        question: "What happens to two people who chose differently?",
        left: { emoji: "woman", name: "Asha", choice: "Kept her bonds", outcome: ["chart-decreasing"], outcomeLine: "They earned 12%" },
        right: { emoji: "man", name: "Ravi", choice: "Waited with cash", outcome: ["money-bag"], outcomeLine: "He bought later at better prices." },
      },
      refs: {},
      facts: {},
    });
    expect(paths.ok).toBe(false);
    if (!paths.ok) expect(paths.error).toMatch(/digit/i);

    const jar = byId("money_jar").build({
      title: "Asha's savings jar",
      inputs: { label: "Asha's savings", start: 3, end: 6, unit: "coin", words: "2 times as full" },
      refs: {},
      facts: {},
    });
    expect(jar.ok).toBe(false);
    if (!jar.ok) expect(jar.error).toMatch(/digit/i);
  });

  it("enforces the word caps, counts and people", () => {
    const longBeat = storyScene({
      beats: [
        { who: "narrator", says: "One two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen." },
        { who: "fed", says: "Short." },
      ],
    });
    expect(byId("story_scene").build(longBeat).ok).toBe(false);

    const ghost = storyScene({
      beats: [
        { who: "ghost", says: "Who am I?" },
        { who: "fed", says: "Short." },
      ],
    });
    const ghostBuilt = byId("story_scene").build(ghost);
    expect(ghostBuilt.ok).toBe(false);
    if (!ghostBuilt.ok) expect(ghostBuilt.error).toContain("ghost");

    expect(
      byId("money_jar").build({ title: "Jar", inputs: { label: "Savings", start: 0, end: 21, unit: "coin", words: "much fuller" }, refs: {}, facts: {} }).ok,
    ).toBe(false);

    const wrongAnswer = byId("choice_cards").build({
      title: "Pick",
      inputs: {
        question: "Why did the old bonds lose value?",
        choices: [
          { id: "a", text: "New bonds paid more" },
          { id: "b", text: "Nobody wanted bonds" },
        ],
        answer: "zzz",
      },
      refs: {},
      facts: {},
    });
    expect(wrongAnswer.ok).toBe(false);
  });

  it("headline takes a scene id from the Tutor, never inline text, and resolves to the written-ahead scene", () => {
    const inline = parseHeadlineRef({
      title: "Rates up",
      inputs: { paper: "Some paper", date: "1994-02-04", headline: "Rates go up", source: "https://example.com/x" },
      refs: {},
      facts: {},
    });
    expect(inline.ok).toBe(false);
    if (!inline.ok) expect(inline.error).toMatch(/scene/);

    const ref = parseHeadlineRef({ title: "Rates up", inputs: { scene: "fed-front-page" }, refs: {}, facts: {} });
    expect(ref).toEqual({ ok: true, scene: "fed-front-page" });

    const scenes = [
      {
        id: "fed-front-page",
        recipe: "headline",
        title: "The morning rates moved",
        inputs: { paper: "The morning paper", date: "1994-02-04", headline: "Central bank tightens pressure", source: "https://example.com/fed" },
      },
    ];
    const resolved = headlineParamsForScene(scenes, { title: "Rates up", inputs: { scene: "fed-front-page" }, refs: {}, facts: {} });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.params.inputs).toMatchObject({ headline: "Central bank tightens pressure" });
      expect(byId("headline").build(resolved.params).ok).toBe(true);
    }
    const missing = headlineParamsForScene(scenes, { inputs: { scene: "nope" } });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error).toContain("fed-front-page");
  });

  it("every example compiles and passes the Widget checks", () => {
    for (const recipe of SET_STORY) {
      expect(recipe.examples.length, recipe.id).toBeGreaterThan(0);
      for (const example of recipe.examples) {
        const built = recipe.build(example);
        if (!built.ok) throw new Error(`${recipe.id}: ${built.error}`);
        expect(widgetProblems(built.code), recipe.id).toEqual([]);
        expect(widgetRuleProblems(built.code), recipe.id).toEqual([]);
      }
    }
  });
});

// Historian (E3 fix round 1, findings H1, H2, H4): the dated examples tell the February 1994 Case of
// num-percent-bps (as-of 1994-02-03; the Fed tightened on 1994-02-04, course/outline.yaml). Nothing the
// Learner can see before the reveal may show that outcome, and a front page may not invent a paper.
describe("the story examples against the February 1994 Case (Historian)", () => {
  const outline = readFileSync(join(process.cwd(), "course/outline.yaml"), "utf8");
  const exampleInputs = (id: string) => (byId(id).examples[0] as { title: string; inputs: Record<string, unknown> });

  it("the story_scene example, stamped with the as-of date, never shows the next day's rate rise", () => {
    const example = exampleInputs("story_scene");
    const beats = example.inputs.beats as { says: string }[];
    const seen = [example.title, ...beats.map((b) => b.says), String(example.inputs.caption ?? "")].join("\n");
    expect(example.inputs.date).toBe("1994-02-03");
    expect(seen).not.toMatch(/panicked|raising the rate|less attractive/i);
    expect(buildStoryRecipe(byId("story_scene"), byId("story_scene").examples[0], { asOf: "1994-02-03", step: "story" }).ok).toBe(true);
  });

  it("the timeline example dates the rate rise to 4 February and locks it behind the as-of date", () => {
    const inputs = exampleInputs("timeline").inputs as { beats: { date: string; label: string }[]; hideAfter?: string };
    const rise = inputs.beats.find((b) => /rate goes up/i.test(b.label));
    expect(rise?.date).toBe("1994-02-04");
    expect(inputs.hideAfter).toBe("1994-02-03");
    for (const beat of inputs.beats) {
      if (inputs.hideAfter && beat.date <= inputs.hideAfter) expect(beat.label, beat.date).not.toMatch(/rate goes up|rates rise/i);
    }
  });

  it("the headline example invents no paper and cites one of the Topic's outline sources", () => {
    const inputs = exampleInputs("headline").inputs as { paper: string; date: string; headline: string; deck?: string; source: string };
    expect(inputs.date).toBe("1994-02-04");
    expect(inputs.paper).not.toBe("The Daily Ledger");
    expect(inputs.deck ?? "").toMatch(/imagined/i);
    expect(outline).toContain(inputs.source);
  });
});
