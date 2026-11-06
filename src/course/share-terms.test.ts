import { describe, expect, it } from "vitest";
import { loadCourseMap } from "./map";

/**
 * A term the Topic teaches as a share (operating margin: "operating profit as a share of revenue") must be used as a
 * share in every Case's Reveal (and story) too, never as a money amount ("an operating margin of Rs 649 crore"). PR #491, F1.
 */

const SHARE_DEFINITION = /\b(as a share of|as a percentage of|as a proportion of|per cent of|percentage of)\b/i;
// Always checked across every Topic, whether or not the Topic defines it.
const ALWAYS = ["operating margin"];
// The term, optionally pluralised, then "of" and a currency amount.
const amountAfter = (term: string) =>
  new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\s+of\\s+(?:only\\s+|about\\s+|roughly\\s+)?(?:Rs\\.?|INR|₹|\\$|US\\$|USD)\\s?-?\\d`, "i");

describe("share terms in Case Reveals and stories", () => {
  const map = loadCourseMap();

  it("finds the share-defined terms (operating margin in fs-links)", () => {
    const fsLinks = map.topics.find((t) => t.id === "fs-links");
    expect((fsLinks?.terms ?? []).filter((t) => SHARE_DEFINITION.test(t.means)).map((t) => t.term)).toContain(
      "operating margin",
    );
  });

  for (const topic of map.topics) {
    const shareTerms = new Set([...ALWAYS, ...(topic.terms ?? []).filter((t) => SHARE_DEFINITION.test(t.means)).map((t) => t.term)]);
    it(`${topic.id}: a share term in a Reveal or story is never a money amount`, () => {
      const misuses = topic.cases.flatMap((c) =>
        (["reveal", "story"] as const).flatMap((part) =>
          [...shareTerms].filter((term) => amountAfter(term).test(c[part])).map((term) => `${c.id} ${part}: ${term}`),
        ),
      );
      expect(misuses).toEqual([]);
    });
  }
});
