import { describe, expect, it } from "vitest";
import { navigate, type Progress } from "./navigator";
import { primerItem, primerOf, primersAt, primerTryKey } from "./primers";
import { spineMap } from "./spine-fixture";

// Primers (spec 2026-11-12, C3): where code shows one, and the Session item it stores. The Spine fixture's Primer, "What a
// margin keeps", sits at the concept step and links to the Elective "The income statement", which is still Coming.

const map = spineMap();
const topic = map.topic("spine-01-worth")!;
const at = (step: "story" | "concept" | "explore" | "your_turn", status: "in_progress" | "passed" = "in_progress"): Progress => ({
  currentTopicId: null,
  topics: { [topic.id]: { step, passedChecks: [], revealShown: false, status } },
});

describe("where a Primer shows", () => {
  it("shows at the Teaching Step the Topic file names, and nowhere else", () => {
    expect(primersAt(navigate(map, at("concept"))).map((p) => p.id)).toEqual(["worth-primer-margin"]);
    expect(primersAt(navigate(map, at("story")))).toEqual([]);
    expect(primersAt(navigate(map, at("your_turn")))).toEqual([]);
  });

  it("never shows in a passed Topic", () => {
    expect(primersAt({ topic, step: "concept", status: "passed" })).toEqual([]);
  });
});

describe("the Primer's Session item", () => {
  const primer = topic.primers![0];
  const item = primerItem(map, topic, primer, "worth-check", 42)!;

  it("holds at most three lines, its one term as a card and its Elective", () => {
    expect(item.data.primer).toEqual({
      id: "worth-primer-margin",
      title: "What a margin keeps",
      lines: ["A margin is the share of each sale a company keeps.", "A shop that keeps ten cents of every dollar has a margin of a tenth."],
      term: { term: "operating margin", means: "What the company keeps from each sale before tax." },
      elective: { id: "fs-income", title: "The income statement", written: false },
    });
    expect(item.data.primer.lines.length).toBeLessThanOrEqual(3);
  });

  it("carries one Quick try by its key, with its choices and never its answer or fixes", () => {
    expect(item.data.key).toBe(primerTryKey(42, primer));
    expect(item.data.key).toBe("qt:42:p:worth-primer-try");
    expect(item.data).toMatchObject({ checkId: "worth-check", skillId: "levers", kind: "choice", prompt: primer.quickTry.ask });
    expect(item.data.choices.map((c) => c.id).sort()).toEqual(["same", "up"]);
    expect(JSON.stringify(item.data)).not.toMatch(/fix|answer|did not change/);
  });

  it("reads back from stored data, and refuses a row that is no Primer", () => {
    expect(primerOf(item.data as unknown as Record<string, unknown>)).toEqual(item.data);
    expect(primerOf({ key: "qt:1:p:x", prompt: "Q", kind: "choice", choices: [] })).toBeNull();
  });
});
