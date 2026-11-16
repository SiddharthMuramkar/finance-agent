import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { inrCr } from "../finance/signal/formatters";
import { JACKPOT } from "../finance/signal/jackpot";
import { DEMO_ORDER, JACKPOT_EXAMPLE, EXAMPLE_FILTERS, EXAMPLE_SLUGS, EXAMPLES, exampleBySlug, examplePath, neighbours } from "./examples";

// The five public examples (Signal spec §7.1, Appendix A): one list for the proxy, the case pages and Home.

const outline = parse(readFileSync(join(process.cwd(), "course", "outline.yaml"), "utf8")) as { topics: { id: string; title: string }[] };

describe("the public examples", () => {
  it("are the spec's five slugs, in its order", () => {
    expect(EXAMPLE_SLUGS).toEqual(["kerala-bumper-2024", "amazon-2000", "wework-2019", "rbi-repo-cut-2025", "compounding-1000"]);
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
    expect(neighbours("kerala-bumper-2024").previous.slug).toBe("compounding-1000");
    expect(neighbours("compounding-1000").next.slug).toBe("kerala-bumper-2024");
    expect(neighbours("wework-2019")).toMatchObject({ previous: { slug: "amazon-2000" }, next: { slug: "rbi-repo-cut-2025" } });
  });

  it("put every example in Home's demo once", () => {
    expect([...DEMO_ORDER].sort()).toEqual([...EXAMPLE_SLUGS].sort());
    expect(exampleBySlug("nope")).toBeUndefined();
  });

  // #75: a reader can follow every Source an Example names. Notes on how a figure was worked out name no Source.
  it("link every named Source to a public https page", () => {
    for (const example of EXAMPLES) {
      for (const source of example.sources) {
        if ("note" in source) continue;
        expect(source.label.trim(), example.slug).not.toBe("");
        expect(source.url, `${example.slug}: ${source.label}`).toMatch(/^https:\/\/[^\s]+$/);
      }
    }
    const named = (slug: string) => exampleBySlug(slug)!.sources.filter((s) => "url" in s).map((s) => ("url" in s ? s.label : ""));
    expect(named("amazon-2000")).toHaveLength(2);
    expect(named("wework-2019")).toEqual(["WeWork S-1, 14 Aug 2019", "CNBC, 30 Sep 2019", "CNBC, 7 Nov 2023"]);
  });

  it("describe the Amazon model one way only: the tested valuation engine", () => {
    const amazon = JSON.stringify(exampleBySlug("amazon-2000"));
    expect(amazon).not.toMatch(/prototype/i);
    expect(amazon).toContain("tested valuation engine");
    expect(amazon).toContain("$35.04");
  });

  it("draw each example with its own widget", () => {
    expect(EXAMPLES.map((e) => e.widget)).toEqual(["jackpot", "levers", "wework", "rates", "compound"]);
  });
});

// #116: the everyday Examples are real, dated Indian Moments in rupees, each with checked Case Data, linked Sources and an
// As-of date; Home's jackpot follows the jackpot Example.
describe("the Indian Moments (#116)", () => {
  const jackpot = exampleBySlug(JACKPOT_EXAMPLE)!;
  const rates = exampleBySlug("rbi-repo-cut-2025")!;

  it("dates both Moments and links a Source for each", () => {
    expect(jackpot.asOf).toBe("2024-10-09");
    expect(rates.asOf).toBe("2025-06-06");
    for (const example of [jackpot, rates]) {
      const linked = example.sources.filter((s) => "url" in s);
      expect(linked.length, example.slug).toBeGreaterThan(0);
    }
    expect(rates.sources[0]).toMatchObject({ url: expect.stringMatching(/^https:\/\/www\.rbi\.org\.in\//) });
  });

  it("tells the jackpot in rupees, with the numbers the jackpot widget's Case Data hold", () => {
    expect(jackpot.widget).toBe("jackpot");
    expect(JACKPOT.asOf).toBe(jackpot.asOf);
    const prize = inrCr(JACKPOT.advertisedTotal);
    expect(prize).toBe("₹25 crore");
    for (const text of [jackpot.question, jackpot.chip, jackpot.demoAsk, jackpot.story]) expect(text).toContain(prize);
    expect(jackpot.facts[0].value).toBe(prize);
    expect(jackpot.ending).toContain(inrCr(11.2886));
    expect(DEMO_ORDER[0]).toBe(JACKPOT_EXAMPLE);
    expect(JSON.stringify(jackpot)).not.toMatch(/\$/);
  });

  it("tells the rates move as the RBI's 6% to 5.5%", () => {
    expect(rates.stamp).toBe("Jun 2025");
    expect(rates.facts.map((f) => f.value)).toEqual(["6%", "5.5%", "6 Jun 2025"]);
  });
});

// #74 (F31): one money style, and no label that repeats itself ("Everyday · Everyday money").
describe("the examples' words", () => {
  it("write dollars in one style: '$3 billion', '$905 million', never '$3bn' or '$905M'", () => {
    const text = JSON.stringify(EXAMPLES, (key, value) => (key === "sources" ? undefined : value));
    expect(text).not.toMatch(/\$[\d.,]+\s?(bn|B|M|m)\b/);
  });

  it("give each a stamp that does not repeat its category", () => {
    for (const example of EXAMPLES) expect(example.category.toLowerCase().startsWith(example.stamp.toLowerCase()), example.slug).toBe(false);
  });
});
