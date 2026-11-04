import { describe, expect, it } from "vitest";
import { textOf } from "./transcript";

describe("the Learner's bubble", () => {
  it("never shows the Widget notes code adds to the Learner's message, in new or old Sessions", () => {
    const content = [
      { type: "text", text: "Why is it flat?" },
      { type: "text", text: "Widget notes (code): Recent archetypes, latest last: Grow, Compare." },
    ];
    expect(textOf(content)).toBe("Why is it flat?");
  });
});
