import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// #512: fr-q-hard-peg (OpenStax 29.4) marks "uses another country's currency"
// wrong as "a merged currency, not a peg". The concept must teach merged
// currency as its own regime, not put a shared currency at the hard-peg end.
type Topic = { concept: string };

const doc = parse(
  readFileSync(join(process.cwd(), "course/topics/fx-regimes-crises.yaml"), "utf8"),
) as Topic;

describe("#512 fx-regimes-crises concept matches fr-q-hard-peg on merged currency", () => {
  const concept = doc.concept.replace(/\s+/g, " ");

  it("teaches the term merged currency", () => {
    expect(concept).toMatch(/merged currency/i);
  });

  it("does not put a shared currency with the hard peg", () => {
    const hardPegSentence = concept.split(/(?<=\.)\s/).find((s) => /hard peg/i.test(s)) ?? "";
    const pegPart = hardPegSentence.split(/merged currency/i)[0];
    expect(pegPart).not.toMatch(/shared currency/i);
    expect(concept).not.toMatch(/hard peg[^.]*or a shared currency/i);
  });
});
