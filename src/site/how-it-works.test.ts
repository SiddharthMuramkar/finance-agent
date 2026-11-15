import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { howItWorks, LINGO } from "./copy";
import { exampleBySlug } from "./examples";
import { plain } from "./rich";

// How it works runs on Spine Topic 1's Amazon example (Signal spec 7.3, Appendix D; adapted from the old Home's
// how-topics-work-steps, decision #7). The "price" card is the Topic file's own term, word for word, whenever the file is
// in the course; the reveal's figures are the ones the Amazon example's ending states.

const FILE = process.env.SPINE_01_FILE ?? join(process.cwd(), "course", "topics", "spine-01-worth.yaml");
const amazon = exampleBySlug("amazon-2000")!;

describe("How it works' moves", () => {
  it("teach price and value, in that order (Appendix D)", () => {
    expect(LINGO.map((c) => c.term)).toEqual(["price", "value"]);
  });

  it.runIf(existsSync(FILE))("take the price card word for word from Spine Topic 1", () => {
    const topic = parse(readFileSync(FILE, "utf8")) as { id: string; terms: { term: string; means: string; pro: string; example: string; inStory: string }[] };
    expect(topic.id).toBe("spine-01-worth");
    const term = topic.terms.find((t) => t.term === "price")!;
    expect({ term: term.term, means: term.means, pro: term.pro, example: term.example, inStory: term.inStory }).toEqual(LINGO[0]);
  });

  it("give the call one right choice, and feedback on every choice", () => {
    const { choices } = howItWorks.tryIt;
    expect(choices.filter((c) => c.right).map((c) => c.id)).toEqual(["value"]);
    for (const c of choices) expect(c.fb.length, c.id).toBeGreaterThan(20);
  });

  it("reveal the figures the Amazon ending states", () => {
    const ending = plain(amazon.ending);
    const { figures } = howItWorks.valueIt;
    expect(ending).toContain(`$${figures.his.toFixed(2)} a share`);
    expect(ending).toContain(`$${figures.price} price`);
    expect(ending).toContain(`$${figures.low.toFixed(2)}`);
  });

  it("run the slider from 0 to 150, starting at 50", () => {
    expect(howItWorks.valueIt).toMatchObject({ min: 0, max: 150, start: 50 });
  });
});
