import { describe, expect, it } from "vitest";
import { shareCard } from "./share-card";

// Issue #71: a shared link shows a card in today's look. Home's names the site's question; each Example's names its own.
describe("Share cards", () => {
  it("gives Home the hero's question and the site's promise", () => {
    expect(shareCard("home")).toEqual({
      eyebrow: "Finance for beginners",
      title: "What is it really worth?",
      line: "Learn what things are worth.",
      alt: "Value It: Learn what things are worth.",
    });
  });

  it("gives each Example its own question, with its hook as the line under it", () => {
    expect(shareCard("amazon-2000")).toMatchObject({ eyebrow: "Example", title: "Is $84 a fair price for Amazon?", alt: "Is $84 a fair price for Amazon?" });
    expect(shareCard("kerala-bumper-2024")?.title).toBe("Is ₹25 crore over 30 years worth ₹25 crore?");
    expect(shareCard("amazon-2000")?.line).not.toMatch(/\*\*|\[/);
  });

  it("has no card for an unknown name", () => {
    expect(shareCard("nope")).toBeUndefined();
  });
});
