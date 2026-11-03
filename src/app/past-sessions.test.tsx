import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OldSession } from "./old-session";
import { PastSessionHeaderView, PastSessionsList } from "./past-sessions";

/** Seam 2 (spec #119, "Pages › Past Sessions"): the list's grouping, both page headers and the "→ next step" divider, from given state. */

const sep5 = new Date("2026-09-05T08:00:00Z");
const oct24 = new Date("2026-10-24T08:00:00Z");

describe("the Past Sessions list", () => {
  const html = renderToStaticMarkup(
    <PastSessionsList
      past={{
        topics: [
          { id: 9, topicId: "bonds", title: "Bond prices", lastActive: oct24 },
          { id: 4, topicId: "present-value", title: "Present value", lastActive: sep5 },
        ],
        older: [
          { id: 2, date: sep5, topics: ["Present value", "Annuities"] },
          { id: 1, date: sep5, topics: [] },
        ],
      }}
    />,
  );

  it("lists one row per Topic Session in the order given (newest first), each opening its Session", () => {
    expect(html.indexOf("Bond prices")).toBeLessThan(html.indexOf("Present value"));
    expect(html).toMatch(/href="\/sessions\/9"/);
    expect(html).toMatch(/href="\/sessions\/4"/);
    expect(html).toContain("24 Oct 2026");
  });

  it("puts every Older session after them, under its own Older sessions heading", () => {
    const heading = html.indexOf("Older sessions");
    expect(heading).toBeGreaterThan(html.lastIndexOf('href="/sessions/4"'));
    expect(html.indexOf('href="/sessions/2"')).toBeGreaterThan(heading);
    expect(html.indexOf('href="/sessions/1"')).toBeGreaterThan(heading);
    expect(html).toContain("Annuities");
    expect(html).toContain("No Topic");
  });

  it("says so when there are no Sessions, with no empty Older group", () => {
    const empty = renderToStaticMarkup(<PastSessionsList past={{ topics: [], older: [] }} />);
    expect(empty).toContain("No Sessions yet.");
    expect(empty).not.toContain("Older sessions");
  });
});

describe("a Topic Session page header", () => {
  const unpassed = renderToStaticMarkup(<PastSessionHeaderView header={{ kind: "topic", topicId: "bonds", title: "Bond prices", lastActive: oct24, passed: false }} />);

  it("starts with a back link, then the Topic and the date of last activity", () => {
    const back = unpassed.search(/<a[^>]*href="\/sessions"/);
    expect(back).toBeGreaterThanOrEqual(0);
    expect(back).toBeLessThan(unpassed.indexOf("Bond prices"));
    expect(unpassed).toContain("24 Oct 2026");
  });

  it("offers Resume this Topic, which opens that Topic in the Study Workspace", () => {
    expect(unpassed).toMatch(/<form[^>]*action="\/api\/open"/);
    expect(unpassed).toMatch(/name="topic" value="bonds"/);
    expect(unpassed).toContain("Resume this Topic");
    expect(unpassed).not.toContain("Passed ✓");
  });

  it("shows Passed ✓ instead once the Topic is passed", () => {
    const passed = renderToStaticMarkup(<PastSessionHeaderView header={{ kind: "topic", topicId: "bonds", title: "Bond prices", lastActive: oct24, passed: true }} />);
    expect(passed).toContain("Passed ✓");
    expect(passed).not.toContain("Resume");
    expect(passed).not.toContain("/api/open");
  });
});

describe("an Older session page header", () => {
  it("shows its date, the Topics it touched and that it is read-only, with no Resume", () => {
    const html = renderToStaticMarkup(<PastSessionHeaderView header={{ kind: "older", date: sep5, topics: ["Present value", "Annuities"] }} />);
    expect(html).toMatch(/<a[^>]*href="\/sessions"/);
    expect(html).toContain("5 Sep 2026");
    expect(html).not.toContain("Sept");
    expect(html).toContain("Present value");
    expect(html).toContain("Annuities");
    expect(html).toContain("Older session · read-only");
    expect(html).not.toContain("Resume");
    expect(html).not.toContain("/api/open");
  });

  it("says No Topic when it touched none", () => {
    expect(renderToStaticMarkup(<PastSessionHeaderView header={{ kind: "older", date: sep5, topics: [] }} />)).toContain("No Topic");
  });
});

describe("an old stored Continue.", () => {
  it("draws as a → next step divider, never as a Learner bubble", () => {
    const html = renderToStaticMarkup(
      <OldSession
        lines={[
          { role: "assistant", text: "That is the story." },
          { role: "user", text: "Continue." },
          { role: "assistant", text: "Now the concept." },
        ]}
      />,
    );
    const at = html.indexOf("→ next step");
    expect(at).toBeGreaterThan(html.indexOf("That is the story."));
    expect(at).toBeLessThan(html.indexOf("Now the concept."));
    expect(html).toContain('role="separator"');
    expect(html).not.toContain("Continue.");
  });
});
