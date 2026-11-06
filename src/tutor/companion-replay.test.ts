import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import fixtures from "@/behaviour/delight/replay-fixtures.json";
import { pickCompanion } from "./companion";

/**
 * Seam 3, the Companion Widget picker over stored replies (spec 2026-11-05, E4a, §6.2): 50 real Tutor replies that came
 * with no Tutor Widget (src/behaviour/delight/replay-fixtures.json). Code gives each one a Widget, and a reply that names
 * a Topic term, where no unshown scene comes first, gets the Lingo card for the term it names first.
 */

const map = loadCourseMap();
type Fixture = { id: string; topic: string; step: string; text: string };
const replies = (fixtures as { replies: Fixture[] }).replies;

/** The term the reply names first, found by plain substring search (not the picker's own matching). */
function firstTermNamed(text: string, terms: string[]): string | undefined {
  const lower = text.toLowerCase();
  const at = terms.map((t) => ({ t, at: lower.indexOf(t.replace(/\s*\(.*\)$/, "").toLowerCase()) })).filter((x) => x.at >= 0);
  return at.sort((a, b) => a.at - b.at)[0]?.t;
}

const pick = (r: Fixture) =>
  pickCompanion({
    topic: map.topic(r.topic)!,
    place: { step: r.step as never, check: null },
    replyText: r.text,
    shownThisSession: { scenes: [], terms: [] },
    blocked: [],
  });

describe("the Companion Widget picker over the 50 stored replies", () => {
  it("holds 50 replies, each with a known Topic and step", () => {
    expect(replies).toHaveLength(50);
    for (const r of replies) expect(map.topic(r.topic), r.id).toBeDefined();
  });

  it("returns a Widget for 50 of 50", () => {
    expect(replies.filter((r) => pick(r) !== null)).toHaveLength(50);
  });

  it("returns the Lingo card for the first term named in 90 % or more of the replies that name a Topic term and have no unshown scene", () => {
    const naming = replies.filter((r) => {
      const topic = map.topic(r.topic)!;
      const scene = topic.scenes.some((s) => s.step === r.step);
      return !scene && firstTermNamed(r.text, topic.terms.map((t) => t.term)) !== undefined;
    });
    expect(naming.length).toBeGreaterThan(0);
    const right = naming.filter((r) => {
      const picked = pick(r);
      const term = (picked?.params.inputs as { term?: string } | undefined)?.term?.toLowerCase();
      const first = firstTermNamed(r.text, map.topic(r.topic)!.terms.map((t) => t.term))!;
      return picked?.kind === "lingo" && term === first.toLowerCase();
    });
    expect(right.length / naming.length).toBeGreaterThanOrEqual(0.9);
  });

  // Math police (§8.5, ADR 0009): no stored reply hands the Learner a sum. A worked example the Tutor does itself is fine;
  // a choice told apart only by arithmetic ("80 bp or 8 bp"), a new figure to finish ("Next one: 3% to 3.5%"), or a
  // "how much" ask is not.
  it("holds no reply that asks the Learner for a figure", () => {
    const asks = [
      /\d+(\.\d+)?\s*(bp|basis points?|points?)\s+or\s+\d+(\.\d+)?\s*(bp|basis points?|points?)\b/i,
      /\b(next one|your turn)\s*:[^?\n]*\d/i,
      /\bhow (much|many)\b/i,
      /\bwhat is \d+(\.\d+)?\s*% of\b/i,
      /\b(calculate|compute|work out|decimal places)\b/i,
    ];
    const sums = replies.filter((r) => asks.some((a) => a.test(r.text))).map((r) => r.id);
    expect(sums).toEqual([]);
  });
});
