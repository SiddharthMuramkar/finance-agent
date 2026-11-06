// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allById, byId, click, draw, stubReducedMotion, type Page } from "../wave1/test-kit";
import { LingoCardView } from "./lingo-card";
import { MoneyJarView } from "./money-jar";
import { TimelineStripView } from "./timeline-strip";
import { TwoPathsView } from "./two-paths";

// Issue #450 (R-E2a): the story parts must look alive in a still frame, not only while they move. Each part shows a
// character, an object or a story moment at rest, with its accent carrying its meaning (Appendix A), and every toggle
// shows a pressed face (Appendix B.2).

let page: Page | null = null;
const show = (element: Parameters<typeof draw>[0]) => (page = draw(element));
const CSS = readFileSync(join(__dirname, "../../../app/globals.css"), "utf8");

beforeEach(() => stubReducedMotion(false));
afterEach(() => {
  page?.cleanup();
  page = null;
  vi.unstubAllGlobals();
});

const lingo = (inStory?: string) => (
  <LingoCardView term="Yield" pro="a bond's yield is its income" means="The income a bond pays each year." example="Rent on a flat." emoji="house" inStory={inStory} />
);

describe("LingoCard at rest", () => {
  it("shows the example's picture large, as a sticker beside the term", () => {
    show(lingo("In the story, the yield rose."));
    const sticker = byId(page!, "lingo-sticker")!;
    expect(sticker.querySelector("img")!.getAttribute("width")).toBe("64");
    expect(sticker.className).toContain("var(--violet-tag)");
  });

  it("says it like a pro in a speech bubble, so someone is talking", () => {
    show(lingo());
    const bubble = byId(page!, "lingo-pro")!;
    expect(bubble.textContent).toContain("Say it like a pro");
    expect(bubble.textContent).toContain("a bond's yield is its income");
    expect(bubble.querySelector("img")).not.toBeNull();
  });

  it("labels the card Lingo with a static violet tag, not a pressable pill", () => {
    show(lingo());
    const tag = page!.host.querySelector<HTMLElement>('[data-affordance="tag"]')!;
    expect(tag.textContent).toBe("Lingo");
    expect(tag.dataset.tone).toBe("violet");
  });

  it("lets the story side peek out behind the card in sunflower, only when there is one", () => {
    show(lingo("In the story, the yield rose."));
    expect(byId(page!, "lingo-peek")!.className).toContain("var(--sun)");
    page!.cleanup();
    show(lingo());
    expect(byId(page!, "lingo-peek")).toBeNull();
  });

  it("pops the sticker in when it mounts, and keeps it still under reduced motion", () => {
    show(lingo());
    expect(byId(page!, "lingo-sticker")!.className).toContain("story-pop");
    page!.cleanup();
    stubReducedMotion(true);
    show(lingo());
    expect(byId(page!, "lingo-sticker")!.className).not.toContain("story-pop");
  });
});

const beats = [
  { date: "1994-02-03", label: "Rates rise", emoji: "chart-increasing" },
  { date: "1994-05-09", label: "Bonds crash", emoji: "chart-decreasing" },
  { date: "1992-01-01", label: "Calm before", emoji: "sun" },
];

describe("TimelineStrip at rest", () => {
  it("opens on the oldest moment, so the strip starts on a story beat with its marker pressed", () => {
    show(<TimelineStripView beats={beats} hideAfter="1994-02-03" />);
    const markers = allById(page!, "timeline-marker");
    expect(markers.map((m) => m.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"]);
    expect(byId(page!, "timeline-label")!.textContent).toContain("Calm before");
  });

  it("shows the open moment's picture and day in its card", () => {
    show(<TimelineStripView beats={beats} hideAfter="1994-02-03" />);
    const label = byId(page!, "timeline-label")!;
    expect(label.querySelector("img")).not.toBeNull();
    expect(label.textContent).toContain("1 Jan 1992");
  });

  it("draws the line solid sunflower up to the story's date and dashed past it", () => {
    show(<TimelineStripView beats={beats} hideAfter="1994-02-03" />);
    expect(byId(page!, "timeline-line-story")!.className).toContain("bg-[var(--sun)]");
    expect(byId(page!, "timeline-line-after")!.className).toContain("border-dashed");
    page!.cleanup();
    show(<TimelineStripView beats={beats} />);
    expect(byId(page!, "timeline-line-after")).toBeNull();
  });

  it("gives every open marker a sunflower ring and the pressed one a sunflower face in the stylesheet", () => {
    show(<TimelineStripView beats={beats} hideAfter="1994-02-03" />);
    const html = page!.host.innerHTML;
    expect(html).toContain("border-[var(--sun)]");
    expect(html).not.toMatch(/var\(--(mint|coral|violet)/);
    expect(allById(page!, "timeline-marker")[0].className).toContain("timeline-marker");
    expect(CSS).toMatch(/\.timeline-marker\[aria-pressed="true"\]\s*\{[^}]*--face:\s*var\(--sun-tag\)/);
  });

  it("pops its markers in one after another, and not under reduced motion", () => {
    show(<TimelineStripView beats={beats} hideAfter="1994-02-03" />);
    const markers = allById(page!, "timeline-marker");
    expect(markers.every((m) => m.parentElement!.className.includes("story-pop"))).toBe(true);
    page!.cleanup();
    stubReducedMotion(true);
    show(<TimelineStripView beats={beats} hideAfter="1994-02-03" />);
    expect(allById(page!, "timeline-marker").some((m) => m.parentElement!.className.includes("story-pop"))).toBe(false);
  });
});

describe("MoneyJar at rest", () => {
  it("has a neck, so it reads as a jar and not a box", () => {
    show(<MoneyJarView label="Savings" start={3} end={6} unit="coin" words="about twice as full" />);
    expect(byId(page!, "jar-neck")!.className).toContain("var(--mint)");
  });

  it("rings the new objects in mint when the jar fills, so the gain shows in a still", () => {
    show(<MoneyJarView label="Savings" start={3} end={6} unit="coin" words="about twice as full" />);
    const fresh = page!.host.querySelectorAll<HTMLElement>('[data-new="true"]');
    expect(fresh).toHaveLength(3);
    expect(fresh[0].className).toContain("var(--mint)");
  });

  it("keeps the emptied places as dashed coral outlines when it drains, so the loss shows in a still", () => {
    stubReducedMotion(true);
    show(<MoneyJarView label="Savings" start={6} end={3} unit="coin" words="half as full" />);
    expect(allById(page!, "jar-gap")).toHaveLength(3);
    expect(allById(page!, "jar-gap")[0].className).toContain("border-dashed");
    expect(page!.host.querySelectorAll('[data-testid="jar"] img')).toHaveLength(3);
  });
});

describe("TwoPaths reveal", () => {
  const paths = (
    <TwoPathsView
      question="Who kept the house?"
      left={{ emoji: "man", name: "Ravi", choice: "Sold early", outcome: ["house", "house"], outcomeLine: "Ravi kept both houses" }}
      right={{ emoji: "woman", name: "Mira", choice: "Held on", outcome: ["house"], outcomeLine: "Mira lost one house" }}
    />
  );

  it("See what happened shows a pressed face while its outcome is open", () => {
    show(paths);
    const reveal = allById(page!, "path-reveal")[0];
    expect(reveal.className).toContain("story-toggle");
    expect(CSS).toMatch(/\.story-toggle\[aria-expanded="true"\]/);
  });

  it("the character reacts when the outcome shows", () => {
    show(paths);
    click(allById(page!, "path-reveal")[0]);
    const who = allById(page!, "path-character");
    expect(who[0].className).toContain("story-bounce");
    expect(who[1].className).not.toContain("story-bounce");
  });
});
