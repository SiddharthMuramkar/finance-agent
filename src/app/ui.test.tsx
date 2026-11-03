import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppHeader, PHONE_NOTE, ReadingPage, SignedInFrame, Tag } from "./ui";

describe("ReadingPage", () => {
  it("puts the header in the same wide box on every reading page and narrows only the content", () => {
    const pages = (["course", "progress", "sessions", "notes", "settings", undefined] as const).map((current) =>
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
  const pages = [
    ["workspace", "/study", "Study Workspace"],
    ["course", "/course", "Course Map"],
    ["progress", "/progress", "Progress"],
    ["sessions", "/sessions", "Past Sessions"],
    ["notes", "/notes", "Notes"],
    ["settings", "/settings", "Settings"],
  ] as const;

  it("puts Finance Agent at the left as the heading, leading to Home", () => {
    const html = renderToStaticMarkup(<AppHeader current="progress" theme="light" />);
    expect(html).toMatch(/<h1[^>]*><a[^>]*href="\/"[^>]*>Finance Agent<\/a><\/h1>/);
    expect(html.indexOf("Finance Agent")).toBeLessThan(html.indexOf("<nav"));
  });

  it("lists the pages in order, Settings last, then the theme toggle and Sign out", () => {
    const html = renderToStaticMarkup(<AppHeader current="progress" theme="light" />);
    const at = (pattern: RegExp) => html.search(pattern);
    const order = [
      at(/href="\/study"[^>]*>Study Workspace</),
      at(/href="\/course"[^>]*>Course Map</),
      at(/href="\/progress"[^>]*>Progress</),
      at(/href="\/sessions"[^>]*>Past Sessions</),
      at(/href="\/notes"[^>]*>Notes</),
      at(/href="\/settings"[^>]*>Settings</),
      at(/Dark mode/),
      at(/Sign out/),
    ];
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("marks exactly the current page on every page, the Study Workspace included", () => {
    for (const [page, href, label] of pages) {
      const html = renderToStaticMarkup(<AppHeader current={page} theme="light" />);
      expect(html.match(/aria-current="page"/g), page).toHaveLength(1);
      expect(html, page).toMatch(new RegExp(`<a aria-current="page"[^>]*href="${href}"[^>]*>${label}<`));
    }
  });

  it("points no link but Finance Agent at Home", () => {
    for (const [page] of pages) {
      const html = renderToStaticMarkup(<AppHeader current={page} theme="light" />);
      expect(html.match(/href="\/"/g), page).toHaveLength(1);
    }
  });

  it("signs out through a plain form that posts to the sign-out route", () => {
    const html = renderToStaticMarkup(<AppHeader current="course" theme="light" />);
    expect(html).toMatch(/<form[^>]*action="\/api\/logout"[^>]*method="post"[^>]*><button type="submit"[^>]*>Sign out<\/button><\/form>/);
  });

  it("offers Light mode in dark mode", () => {
    expect(renderToStaticMarkup(<AppHeader current="workspace" theme="dark" />)).toContain("Light mode");
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
