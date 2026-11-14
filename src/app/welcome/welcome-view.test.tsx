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
    expect(text(strip).trim()).toBe("Story Concept Explore Your turn Check Reveal Principle");
    // ADR 0013: plain words between two hairlines, each after an accent number (a CSS counter), not a row of tags.
    expect(strip).not.toContain('data-affordance="tag"');
    expect(html).toMatch(/<ol data-step-strip="true"[^>]*class="[^"]*border-y border-\[var\(--rule\)\][^"]*\[counter-reset:step\]/);
    expect(strip).toMatch(/<li class="[^"]*before:content-\[counter\(step,decimal-leading-zero\)_\/_(?:''|&#x27;&#x27;)\]/);
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
    expect(html).toMatch(/<button[^>]*class="btn btn-primary btn-lg w-full"[^>]*data-start-topic/);
    expect(text(html)).not.toMatch(/\bSkip\b/);
  });

  it("says how long a Spine Topic takes, and nothing for a Topic with no length (spec C2, C5: Spine Topic 1 takes ten minutes)", () => {
    const spineOne = { id: "spine-01-worth", title: "What is a business worth? Price against value, and the four levers", youllLearn: undefined, minutes: 10 };
    const html = renderToStaticMarkup(<WelcomeView panel="first-topic" firstTopic={spineOne} />);
    expect(text(html)).toContain("What is a business worth? Price against value, and the four levers About 10 minutes");
    expect(html).toMatch(/<button[^>]*data-start-topic="spine-01-worth"/);
    expect(render("first-topic")).not.toContain("data-first-topic-minutes");
  });

  it("never says Continue or lesson", () => {
    for (const panel of ["how-a-topic-works", "about-you", "first-topic"] as const) expect(text(render(panel))).not.toMatch(/Continue|lesson/i);
  });
});
