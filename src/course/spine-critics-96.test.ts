import { describe, expect, it } from "vitest";
import { E2E_SCRIPTS, type E2eScriptName } from "@/dev/e2e-tutor";
import { loadCourseMap } from "./map";

// Spine critics round 1 on #96 (Spine Topics 10 to 16 for beginners): the beginner persona's and the historian's
// confirmed findings, held on the real Course Map and the scripted Tutor's first turns (e2e/spine-10-16.spec.ts).

const map = loadCourseMap();
const topic = (id: string) => map.topic(id)!;
const turn = (name: E2eScriptName) =>
  (E2E_SCRIPTS[name].replies as readonly { content: readonly unknown[] }[])
    .flatMap((r) => r.content)
    .map((c) => (c && typeof c === "object" && "text" in c ? String(c.text) : ""))
    .join(" ");

describe("Spine critics round 1 on #96", () => {
  it("Topic 11's story says Damodaran valued Uber at about $6 billion, not that its revenue was $6 billion", () => {
    const story = topic("spine-11-story-to-numbers").cases.find((c) => c.id === "s11-uber-2014-inputs")!.story;
    for (const text of [story, turn("numbers-story")]) {
      expect(text).not.toMatch(/as revenue, about \$6 billion/);
      expect(text).not.toMatch(/That came to about \$6 billion/);
      expect(text).toMatch(/valued (?:that Uber|it) at about \$6 billion/);
    }
  });

  it("Topic 11's Widget opens on Damodaran's June story and says why the fast story is not Gurley's $53.4 billion", () => {
    const inputs = topic("spine-11-story-to-numbers").explore!.workbench!.inputs as { start?: { revenue?: number }; mode: { stories: { label: string; says?: string }[] } };
    expect(inputs.start?.revenue).toBe(3.58);
    const fast = inputs.mode.stories[1];
    expect(fast.says).toMatch(/\$100bn/);
    expect(fast.says).toMatch(/not Gurley's/i);
    expect(turn("numbers-explore")).toMatch(/\$53\.4 billion/);
  });

  it("Topic 10 rounds its rupees and glosses its words for a beginner", () => {
    const t = topic("spine-10-survival");
    const story = t.cases[0].story;
    for (const text of [story, turn("survive-story")]) {
      expect(text).not.toMatch(/456\.32|4,067\.65/);
      expect(text).toMatch(/about ₹456 crore/);
      expect(text).toMatch(/about ₹4,070 crore/);
    }
    for (const text of [t.concept, turn("survive-concept")]) {
      expect(text).not.toMatch(/discounted cash flow/i);
      expect(text).toMatch(/going concern \(a business that keeps running\)/);
      // Plain words, no "thin interest cover" (review 4, K09/K16): interest cover is a Go deeper word.
      expect(text).not.toMatch(/interest cover/i);
      expect(text).toMatch(/operating income only a little above its interest bill/);
    }
  });

  it("Topics 10 and 12's scripted openers keep the Case's facts (review 4, K10)", () => {
    // The ₹7,200 crore is the debt at the end of March 2019, before the Mindtree money pared it.
    expect(turn("survive-story")).toMatch(/end of March 2019 the group had borrowed about ₹7,200 crore/);
    // IWG's $4.45 billion is the market price of its shares, not what it is worth.
    for (const text of [turn("multiple-story"), topic("spine-12-price-or-value").cases[0].story]) {
      expect(text).toMatch(/stock market/);
      expect(text).not.toMatch(/(?:is|are) worth \$4\.45 billion/);
    }
  });

  it("Topic 10's Go deeper hands over no outcome after 29 July 2019", () => {
    const deeper = topic("spine-10-survival").goDeeper ?? "";
    expect(deeper).not.toMatch(/54%|17%|2020/);
    expect(deeper).toMatch(/pledged shares/i);
    // The fact stays in the reveal.
    expect(topic("spine-10-survival").cases[0].reveal).toMatch(/54% to 17%/);
  });

  it("Topic 15's Amazon reveal uses the sourced 31 cents ($864 million on $2,762 million)", () => {
    const reveal = topic("spine-15-value-yourself").cases.find((c) => c.id === "amazon-yourself-2000")!.reveal;
    expect(reveal).not.toMatch(/24 cents|like-for-like/);
    expect(reveal).toMatch(/\$864 million/);
    expect(reveal).toMatch(/31 cents/);
  });
});
