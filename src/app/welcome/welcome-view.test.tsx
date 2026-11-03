import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { WelcomeView, type WelcomePanel } from "./welcome-view";

/**
 * Seam 2 (spec #119, "Pages › Welcome"): the Welcome's three panels as static markup. Next and Skip
 * are links to the next panel, so where Skip goes is read straight off the markup.
 */
const percent = loadCourseMap().topic("num-percent-bps")!;
const render = (panel: WelcomePanel) => renderToStaticMarkup(<WelcomeView panel={panel} firstTopic={percent} />);
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&rarr;|→/g, "→").replace(/\s+/g, " ");
const hrefOf = (html: string, label: string) => html.match(new RegExp(`<a[^>]*href="([^"]+)"[^>]*>${label}</a>`))?.[1];

describe("the Welcome", () => {
  it("first explains how a Topic works: the seven Teaching Steps as a strip and the two-column layout", () => {
    const html = render("how-a-topic-works");
    const strip = html.match(/<ol[^>]*data-step-strip[^>]*>([\s\S]*?)<\/ol>/)![1];
    expect(text(strip).trim()).toBe("Story Concept Your turn Check Explore Reveal Principle");
    expect(text(html)).toContain("Concept → Your turn → Check repeats for each Check");
    expect(text(html)).toContain("The Tutor talks on the left. Things you can move and try appear on the right.");
  });

  it("has Next and Skip on the first two panels, and Skip always goes to the Your first Topic card", () => {
    const first = render("how-a-topic-works");
    expect(hrefOf(first, "Next")).toBe("/welcome?panel=about-you");
    expect(hrefOf(first, "Skip")).toBe("/welcome?panel=first-topic");
    const second = render("about-you");
    expect(second).toMatch(/<button[^>]*type="submit"[^>]*>Next<\/button>/);
    expect(hrefOf(second, "Skip")).toBe("/welcome?panel=first-topic");
  });

  it("asks the four About you questions, each optional", () => {
    const html = text(render("about-you"));
    for (const question of ["Work", "Where you live", "Any loan", "What you are saving for"]) expect(html).toContain(`${question} (optional)`);
    expect(html).toContain("This is private.");
  });

  it("ends on the Percent Topic card with its You'll learn bullets and a big Start this Topic button", () => {
    const html = render("first-topic");
    expect(text(html)).toContain("Your first Topic");
    expect(text(html)).toContain("Percent, percentage points and basis points");
    expect(text(html)).toContain("Tell a change in percentage points from a change in percent.");
    expect(html).toMatch(/<button[^>]*data-start-topic="num-percent-bps"[^>]*>Start this Topic<\/button>/);
    expect(text(html)).not.toMatch(/\bSkip\b/);
  });

  it("never says Continue or lesson", () => {
    for (const panel of ["how-a-topic-works", "about-you", "first-topic"] as const) expect(text(render(panel))).not.toMatch(/Continue|lesson/i);
  });
});
