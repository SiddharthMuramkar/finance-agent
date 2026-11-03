import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { copy } from "./copy";
import { LandingView } from "./landing";

const html = renderToStaticMarkup(<LandingView stats={{ topics: "90 of 95", cases: 312, librarySources: 47 }} />);
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Landing page", () => {
  it("shows the two-line headline", () => {
    expect(html).toMatch(/<h1[^>]*>Learn finance from<br\/><span[^>]*>what already happened\.<\/span><\/h1>/);
  });

  it("lists the six Teaching Steps in order", () => {
    const names = ["Story", "Concept", "Your turn", "Check", "Reveal", "Principle"];
    const positions = names.map((n) => html.indexOf(`>${n}</h3>`));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("shows the counts it is given", () => {
    expect(text).toContain("Topics written 90 of 95");
    expect(text).toContain("Historical Cases 312");
    expect(text).toContain("Library sources 47");
  });

  it("marks the copy as a draft", () => {
    expect(text).toContain("Draft");
  });

  it("links Sign in to the login and How it works to its section", () => {
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="#how"');
    expect(html).toContain('id="how"');
  });

  it("shows no Learner or Library text, only its own copy and counts", () => {
    for (const word of ["Session", "Continue", "Ask the Tutor", "Past Sessions", "Progress"]) {
      expect(text).not.toContain(word);
    }
    expect(text).toContain(copy.footer);
  });
});
