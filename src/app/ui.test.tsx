import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_PREF, type ThemePref } from "./theme";
import { AppHeader, PHONE_NOTE, ReadingPage, SignedInFrame, Tag } from "./ui";

const LIGHT: ThemePref = { mode: "single", theme: "light" };

describe("ReadingPage", () => {
  it("reading pages use the full box: one wide main for header and content, no narrow column", () => {
    const pages = (["course", "progress", "sessions", "notes", "settings", undefined] as const).map((current) =>
      renderToStaticMarkup(
        <ReadingPage current={current} theme={LIGHT}>
          <p>content</p>
        </ReadingPage>,
      ),
    );
    for (const html of pages) {
      expect(html).toMatch(/<main[^>]*max-w-\[var\(--page-max\)\]/);
      expect(html).not.toMatch(/<main[^>]*max-w-6xl/);
      expect(html.match(/<div[^>]*data-testid="reading-column"[^>]*>/)![0]).not.toMatch(/max-w-2xl/);
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
    const html = renderToStaticMarkup(<AppHeader current="progress" theme={LIGHT} />);
    expect(html).toMatch(/<h1[^>]*><a[^>]*href="\/"[^>]*>(<svg.*<\/svg>)?Finance Agent<\/a><\/h1>/);
    expect(html.indexOf("Finance Agent")).toBeLessThan(html.indexOf("<nav"));
  });

  it("lists the pages in order, Settings last, then the theme toggle and Sign out", () => {
    const html = renderToStaticMarkup(<AppHeader current="progress" theme={LIGHT} />);
    const at = (pattern: RegExp) => html.search(pattern);
    const order = [
      at(/href="\/study"[^>]*>Study Workspace</),
      at(/href="\/course"[^>]*>Course Map</),
      at(/href="\/progress"[^>]*>Progress</),
      at(/href="\/sessions"[^>]*>Past Sessions</),
      at(/href="\/notes"[^>]*>Notes</),
      at(/href="\/settings"[^>]*>Settings</),
      at(/aria-label="Theme: Light"/),
      at(/Sign out/),
    ];
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("marks exactly the current page on every page, the Study Workspace included", () => {
    for (const [page, href, label] of pages) {
      const html = renderToStaticMarkup(<AppHeader current={page} theme={LIGHT} />);
      expect(html.match(/aria-current="page"/g), page).toHaveLength(1);
      expect(html, page).toMatch(new RegExp(`<a [^>]*aria-current="page"[^>]*href="${href}"[^>]*>${label}<`));
    }
  });

  it("points no link but Finance Agent at Home", () => {
    for (const [page] of pages) {
      const html = renderToStaticMarkup(<AppHeader current={page} theme={LIGHT} />);
      expect(html.match(/href="\/"/g), page).toHaveLength(1);
    }
  });

  it("signs out through a plain form that posts to the sign-out route", () => {
    const html = renderToStaticMarkup(<AppHeader current="course" theme={LIGHT} />);
    expect(html).toMatch(/<form[^>]*action="\/api\/logout"[^>]*method="post"[^>]*><button type="submit"[^>]*>Sign out<\/button><\/form>/);
  });

  it("has a Home brand link drawn as a raised nav pill, with the title Home", () => {
    const html = renderToStaticMarkup(<AppHeader current="workspace" theme={LIGHT} />);
    expect(html).toMatch(/<a title="Home" data-affordance="nav" class="chip[^"]*" href="\/"/);
  });

  it("draws the page links as raised chips, the current one marked, each with a pending dot", () => {
    const html = renderToStaticMarkup(<AppHeader current="notes" theme={LIGHT} />);
    expect(html.match(/data-affordance="nav" class="chip /g)).toHaveLength(7);
    expect(html.match(/data-\[link-pending=true\]/g)).toHaveLength(6);
    expect(html).toMatch(/aria-current="page"[^>]*href="\/notes"/);
    expect(html).not.toContain("underline");
  });

  it("makes the theme control an icon button named for the current theme, which opens a menu", () => {
    const dark = renderToStaticMarkup(<AppHeader current="workspace" theme={{ mode: "single", theme: "dark" }} />);
    expect(dark).toMatch(/<button[^>]*aria-label="Theme: Dark"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
    expect(dark).not.toContain("aria-pressed");
  });

  it("names the theme control just Theme on the server while the Learner follows the computer, whose mode it cannot know", () => {
    expect(renderToStaticMarkup(<AppHeader current="workspace" theme={DEFAULT_PREF} />)).toContain('aria-label="Theme"');
  });

  it("styles Sign out as a small raised secondary button", () => {
    expect(renderToStaticMarkup(<AppHeader current="course" theme={LIGHT} />)).toMatch(/<button type="submit" data-affordance="button" class="btn btn-secondary btn-sm[^"]*">Sign out/);
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
