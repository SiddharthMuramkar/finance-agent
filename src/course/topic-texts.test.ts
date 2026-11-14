import { describe, expect, it } from "vitest";
import { convertedTopic } from "./lesson-fixture";
import { loadCourseMap } from "./map";
import { textsIn, topicTexts, type TextSource } from "./topic-texts";

// One walker of a Topic's texts for every course check that reads them (formula-check.ts, lesson-lint.ts L5, the
// formula markers in map.ts, compounding-leak.test.ts). Every text field below starts "T-", so a field the walker
// misses, or reads twice, shows.

const scene = { cast: [{ id: "asha", emoji: "woman", name: "T-scene-name" }], beats: [{ who: "asha", says: "T-scene-says-1" }, { who: "asha", says: "T-scene-says-2" }] };

const every: TextSource = {
  cases: [{ id: "case-a", title: "A Case", data: [], asOf: "2020-01-01", story: "T-case-story", reveal: "T-case-reveal" }],
  concept: "T-concept",
  goDeeper: "T-go-deeper",
  principle: "T-principle",
  insight: { question: "T-insight-question", written: "T-insight-written", foundWhen: "T-insight-found-when", hints: ["T-insight-hint-1", "T-insight-hint-2"] },
  connections: [{ text: "T-connection-1" }, { text: "T-connection-2" }],
  questions: [
    {
      id: "q-a",
      prompt: "T-question-prompt",
      choices: [
        { id: "right", text: "T-question-choice-right" },
        { id: "wrong", text: "T-question-choice-wrong", mistake: { tag: "slip", fix: "T-question-fix" } },
      ],
      answer: "right",
      explanation: "T-question-explanation",
      source: "A source.",
    },
    {
      id: "q-computed",
      kind: "predict",
      prompt: "T-computed-prompt",
      computed: {
        case: "case-a",
        changes: [{ id: "low-margin", label: "T-computed-change", levers: { marginTarget: 4 } }],
        bands: [
          { id: "half", label: "T-computed-band-half", min: 0.3 },
          { id: "none", label: "T-computed-band-none", max: 0.3 },
        ],
      },
      explanation: "T-computed-explanation",
    },
  ],
  runningExample: { text: "T-running-example", numbers: [1], scene: { cast: [{ id: "dev", emoji: "man", name: "T-running-scene-name" }], beats: [{ who: "dev", says: "T-running-scene-says-1" }, { who: "dev", says: "T-running-scene-says-2" }] } },
  terms: [{ term: "basis point", means: "T-term-means", pro: "T-term-pro", example: "T-term-example", emoji: "ruler", inStory: "T-term-in-story" }],
  skills: [{ id: "skill-a", rule: "T-skill-rule", analogy: "T-skill-analogy" }],
  templates: [
    {
      id: "tpl",
      skill: "skill-a",
      ask: "T-template-ask {a}",
      params: { a: { min: 1, max: 2, step: 1 } },
      answer: "bp_from_move",
      unit: "bp",
      decimals: 0,
      sign: "magnitude",
      label: "T-template-label {value}",
      mistakes: [{ tag: "stopped_at_points", fix: "T-template-fix", label: "T-template-mistake-label {value}" }],
      halfDone: { shows: "T-template-half-done", asks: "bp_from_points" },
    },
  ],
  checks: [
    {
      id: "check-quiz",
      kind: "quiz",
      required: false,
      questions: ["q-a"],
      templates: ["tpl"],
      passRule: { correct: 1 },
      card: {
        title: "T-card-title",
        lines: ["T-card-line-1", "T-card-line-2"],
        writeDown: "T-card-write-down",
        skills: ["skill-a"],
        widget: { recipe: "rate_move", title: "T-preset-title", inputs: { old: 4, new: 5, mode: "T-preset-mode" } },
      },
      quickTries: [
        {
          id: "try-a",
          skill: "skill-a",
          ask: "T-try-ask",
          kind: "choice",
          answer: "a",
          label: "T-try-label",
          halfDone: "T-try-half-done",
          choices: [
            { id: "a", text: "T-try-choice-a" },
            { id: "b", text: "T-try-choice-b", mistake: { tag: "slip", fix: "T-try-choice-fix" } },
          ],
          mistakes: [{ answer: 2, fix: "T-try-fix" }],
        },
        { template: "tpl", halfDone: true },
        // A computed Quick try as the Course Map loads it (spec D2): its choices and fixes filled in by code from the Case.
        {
          id: "try-computed",
          skill: "skill-a",
          ask: "T-computed-try-ask",
          kind: "choice",
          answer: "up",
          choices: [
            { id: "up", text: "T-computed-try-change-up" },
            { id: "down", text: "T-computed-try-change-down", mistake: { tag: "smaller-move", fix: "T-computed-try-fix" } },
          ],
          computed: {
            kind: "which_lever",
            case: "c",
            changes: [
              { id: "up", label: "T-computed-try-change-up", levers: { marginTarget: 12 } },
              { id: "down", label: "T-computed-try-change-down", levers: { marginTarget: 11 } },
            ],
          },
        },
      ],
    },
    { id: "check-talk", kind: "conversation", required: false, prompt: "T-check-prompt", passCriteria: "T-check-pass-criteria", skills: ["skill-a"], quickTries: [] },
  ],
  scenes: [{ id: "scene-a", step: "story", recipe: "story_scene", title: "T-scene-title", inputs: scene }],
  primers: [
    {
      id: "primer-a",
      title: "T-primer-title",
      lines: ["T-primer-line-1"],
      term: "basis point",
      quickTry: { id: "primer-try", skill: "skill-a", ask: "T-primer-try-ask", kind: "truth", answer: true, mistakes: [{ answer: false, fix: "T-primer-try-fix" }] },
      widget: { recipe: "rate_move", title: "T-primer-preset-title", inputs: { mode: "T-primer-preset-mode" } },
      elective: "num-percent-bps",
      at: "concept",
    },
  ],
};

/** Every "T-" string anywhere in a value: the fixture's text fields. */
function textFields(value: unknown): string[] {
  if (typeof value === "string") return value.startsWith("T-") ? [value] : [];
  if (Array.isArray(value)) return value.flatMap(textFields);
  if (value && typeof value === "object") return Object.values(value).flatMap(textFields);
  return [];
}

describe("a Topic's texts", () => {
  it("gives each text of a Topic with every field exactly once, in its group, with where it is", () => {
    expect(topicTexts(every).map(({ group, where, text }) => [group, where, text])).toEqual([
      ["case", 'Case "case-a" story', "T-case-story"],
      ["case", 'Case "case-a" reveal', "T-case-reveal"],
      ["earlier", "concept", "T-concept"],
      ["earlier", "Go deeper", "T-go-deeper"],
      ["earlier", "principle", "T-principle"],
      ["earlier", "insight question", "T-insight-question"],
      ["earlier", "insight written", "T-insight-written"],
      ["earlier", "insight foundWhen", "T-insight-found-when"],
      ["earlier", "insight hint 1", "T-insight-hint-1"],
      ["earlier", "insight hint 2", "T-insight-hint-2"],
      ["earlier", "Connection 1", "T-connection-1"],
      ["earlier", "Connection 2", "T-connection-2"],
      ["question", 'question "q-a" prompt', "T-question-prompt"],
      ["question", 'question "q-a" choice "right"', "T-question-choice-right"],
      ["question", 'question "q-a" choice "wrong"', "T-question-choice-wrong"],
      ["teaching", 'question "q-a" choice "wrong" fix', "T-question-fix"],
      ["question", 'question "q-a" explanation', "T-question-explanation"],
      ["question", 'question "q-computed" prompt', "T-computed-prompt"],
      ["question", 'question "q-computed" change "low-margin"', "T-computed-change"],
      ["question", 'question "q-computed" band "half"', "T-computed-band-half"],
      ["question", 'question "q-computed" band "none"', "T-computed-band-none"],
      ["question", 'question "q-computed" explanation', "T-computed-explanation"],
      ["earlier", 'Check "check-talk" prompt', "T-check-prompt"],
      ["earlier", 'Check "check-talk" pass criteria', "T-check-pass-criteria"],
      ["example", "the Running example", "T-running-example"],
      ["example", 'term "basis point"', "basis point: T-term-means"],
      ["example", 'term "basis point" pro', "T-term-pro"],
      ["example", 'term "basis point" example', "T-term-example"],
      ["teaching", 'term "basis point" in the story', "T-term-in-story"],
      ["example", 'Skill "skill-a" rule', "T-skill-rule"],
      ["example", 'Skill "skill-a" analogy', "T-skill-analogy"],
      ["example", 'template "tpl" ask', "T-template-ask {a}"],
      ["example", 'template "tpl" label', "T-template-label {value}"],
      ["example", 'template "tpl" half-done step', "T-template-half-done"],
      ["example", 'template "tpl" fix for stopped_at_points', "T-template-fix"],
      ["example", 'template "tpl" label for stopped_at_points', "T-template-mistake-label {value}"],
      ["example", 'Check "check-quiz" card title', "T-card-title"],
      ["example", 'Check "check-quiz" card line 1', "T-card-line-1"],
      ["example", 'Check "check-quiz" card line 2', "T-card-line-2"],
      ["example", 'Check "check-quiz" card write-down', "T-card-write-down"],
      ["example", 'Check "check-quiz" card preset title', "T-preset-title"],
      ["example", 'Check "check-quiz" card preset mode', "T-preset-mode"],
      ["example", 'Check "check-quiz" Quick try "try-a" ask', "T-try-ask"],
      ["example", 'Check "check-quiz" Quick try "try-a" label', "T-try-label"],
      ["example", 'Check "check-quiz" Quick try "try-a" half-done step', "T-try-half-done"],
      ["example", 'Check "check-quiz" Quick try "try-a" choice "a"', "T-try-choice-a"],
      ["example", 'Check "check-quiz" Quick try "try-a" choice "b"', "T-try-choice-b"],
      ["example", 'Check "check-quiz" Quick try "try-a" choice "b" fix', "T-try-choice-fix"],
      ["example", 'Check "check-quiz" Quick try "try-a" fix 1', "T-try-fix"],
      ["question", 'Check "check-quiz" Quick try "try-computed" ask', "T-computed-try-ask"],
      ["question", 'Check "check-quiz" Quick try "try-computed" change "up"', "T-computed-try-change-up"],
      ["question", 'Check "check-quiz" Quick try "try-computed" change "down"', "T-computed-try-change-down"],
      ["teaching", 'Check "check-quiz" Quick try "try-computed" choice "down" fix', "T-computed-try-fix"],
      ["example", 'Primer "primer-a" title', "T-primer-title"],
      ["example", 'Primer "primer-a" line 1', "T-primer-line-1"],
      ["example", 'Primer "primer-a" Quick try "primer-try" ask', "T-primer-try-ask"],
      ["example", 'Primer "primer-a" Quick try "primer-try" fix 1', "T-primer-try-fix"],
      ["example", 'Primer "primer-a" preset title', "T-primer-preset-title"],
      ["example", 'Primer "primer-a" preset mode', "T-primer-preset-mode"],
      ["scene", 'Scene "scene-a" title', "T-scene-title"],
      ["scene", 'Scene "scene-a" cast.0.id', "asha"],
      ["scene", 'Scene "scene-a" cast.0.emoji', "woman"],
      ["scene", 'Scene "scene-a" cast.0.name', "T-scene-name"],
      ["scene", 'Scene "scene-a" beats.0.who', "asha"],
      ["scene", 'Scene "scene-a" beats.0.says', "T-scene-says-1"],
      ["scene", 'Scene "scene-a" beats.1.who', "asha"],
      ["scene", 'Scene "scene-a" beats.1.says', "T-scene-says-2"],
      ["scene", "the Running example's scene cast.0.id", "dev"],
      ["scene", "the Running example's scene cast.0.emoji", "man"],
      ["scene", "the Running example's scene cast.0.name", "T-running-scene-name"],
      ["scene", "the Running example's scene beats.0.who", "dev"],
      ["scene", "the Running example's scene beats.0.says", "T-running-scene-says-1"],
      ["scene", "the Running example's scene beats.1.who", "dev"],
      ["scene", "the Running example's scene beats.1.says", "T-running-scene-says-2"],
    ]);
  });

  it("reads every text field of the fixture, each in exactly one text", () => {
    const texts = topicTexts(every).map((t) => t.text);
    for (const field of textFields(every)) expect(texts.filter((t) => t.includes(field)), field).toHaveLength(1);
  });

  it("takes only the groups asked for, in the same order", () => {
    expect(textsIn(every, ["case", "teaching"]).map((t) => t.where)).toEqual([
      'Case "case-a" story',
      'Case "case-a" reveal',
      'question "q-a" choice "wrong" fix',
      'term "basis point" in the story',
      'Check "check-quiz" Quick try "try-computed" choice "down" fix',
    ]);
  });

  it("gives no two texts of a real Topic the same label", () => {
    for (const t of [convertedTopic(), ...loadCourseMap().topics]) {
      const where = topicTexts(t).map((x) => x.where);
      expect(where.filter((w, i) => where.indexOf(w) !== i), t.id).toEqual([]);
    }
  });
});
