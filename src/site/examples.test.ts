import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { DEMO_ORDER, EXAMPLE_FILTERS, EXAMPLE_SLUGS, EXAMPLES, exampleBySlug, examplePath, neighbours } from "./examples";

// The five public examples (Signal spec §7.1, Appendix A): one list for the proxy, the case pages and Home.

const outline = parse(readFileSync(join(process.cwd(), "course", "outline.yaml"), "utf8")) as { topics: { id: string; title: string }[] };

describe("the public examples", () => {
  it("are the spec's five slugs, in its order", () => {
    expect(EXAMPLE_SLUGS).toEqual(["mega-millions-2018", "amazon-2000", "wework-2019", "rates-up-1", "compounding-1000"]);
    expect(examplePath("amazon-2000")).toBe("/examples/amazon-2000");
  });

  it("each name a course Topic whose title the site shows word for word", () => {
    for (const example of EXAMPLES) {
      const topic = outline.topics.find((t) => t.id === example.topicId);
      expect(topic?.title, example.slug).toBe(example.topic);
    }
  });

  it("fill every field of the copy deck", () => {
    for (const example of EXAMPLES) {
      for (const [field, value] of Object.entries(example)) {
        if (typeof value === "string") expect(value.trim(), `${example.slug}.${field}`).not.toBe("");
      }
      expect(example.facts, example.slug).toHaveLength(3);
      expect(example.follow.right && example.follow.other, example.slug).toBeTruthy();
    }
  });

  it("count 2, 1 and 2 under the Examples filters", () => {
    const counts = EXAMPLE_FILTERS.map((f) => (f.id === "all" ? EXAMPLES.length : EXAMPLES.filter((e) => e.group === f.id).length));
    expect(counts).toEqual([5, 2, 1, 2]);
  });

  it("wrap around for the previous and next links", () => {
    expect(neighbours("mega-millions-2018").previous.slug).toBe("compounding-1000");
    expect(neighbours("compounding-1000").next.slug).toBe("mega-millions-2018");
    expect(neighbours("wework-2019")).toMatchObject({ previous: { slug: "amazon-2000" }, next: { slug: "rates-up-1" } });
  });

  it("put every example in Home's demo once", () => {
    expect([...DEMO_ORDER].sort()).toEqual([...EXAMPLE_SLUGS].sort());
    expect(exampleBySlug("nope")).toBeUndefined();
  });

  it("draw each example with its own widget", () => {
    expect(EXAMPLES.map((e) => e.widget)).toEqual(["jackpot", "levers", "wework", "rates", "compound"]);
  });
});
