import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppHeader, PHONE_NOTE, ReadingPage, SignedInFrame, Tag } from "./ui";

describe("ReadingPage", () => {
  it("puts the header in the same wide box on every reading page and narrows only the content", () => {
    const pages = (["course", "progress", "sessions", "notes", undefined] as const).map((current) =>
      renderToStaticMarkup(
        <ReadingPage current={current} theme="light">
          <p>content</p>
        </ReadingPage>,
      ),
    );
    for (const html of pages) {
      expect(html).toMatch(/<main[^>]*max-w-6xl/);
      expect(html.indexOf("<header")).toBeLessThan(html.indexOf('data-testid="reading-column"'));
      expect(html).toContain("Study Workspace");
    }
    expect(new Set(pages.map((h) => h.match(/<main[^>]*>/)![0])).size).toBe(1);
  });
});

describe("AppHeader", () => {
  it("shows the five links with their addresses and marks the current page", () => {
    const html = renderToStaticMarkup(<AppHeader current="progress" theme="light" />);
    expect(html).toContain("Study Workspace");
    expect(html).toMatch(/href="\/course"[^>]*>Course Map</);
    expect(html).toMatch(/<a aria-current="page"[^>]*href="\/progress"[^>]*>Progress</);
    expect(html).toMatch(/href="\/sessions"[^>]*>Past Sessions</);
    expect(html).toMatch(/href="\/notes"[^>]*>Notes</);
    expect(html).toContain("Dark mode");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/href="\/"[^>]*>Study Workspace</);
  });

  it("marks no link on the workspace and offers Light mode in dark mode", () => {
    const html = renderToStaticMarkup(<AppHeader current="workspace" theme="dark" />);
    expect(html).not.toContain("aria-current");
    expect(html).not.toMatch(/href="\/"/);
    expect(html).toContain("Light mode");
  });
});

describe("Tag", () => {
  it("reads YOUR ASSUMPTION and SOURCED", () => {
    expect(renderToStaticMarkup(<Tag kind="you" />).toUpperCase()).toContain("YOUR ASSUMPTION");
    expect(renderToStaticMarkup(<Tag kind="src" />).toUpperCase()).toContain("SOURCED");
  });
});

describe("SignedInFrame", () => {
  it("renders the phone note and the page", () => {
    const html = renderToStaticMarkup(<SignedInFrame><p>The page</p></SignedInFrame>);
    expect(html).toContain(PHONE_NOTE);
    expect(html).toContain("The page");
  });
});
