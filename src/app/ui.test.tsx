import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_PREF, type ThemePref } from "./theme";
import { AppHeader, Card, PHONE_NOTE, ReadingPage, SignedInFrame, Tag } from "./ui";

const LIGHT: ThemePref = { mode: "single", theme: "light" };

describe("ReadingPage", () => {
  it("reading pages use the full box: one wide main for header and content, no narrow column", () => {
    const pages = (["course", "notebook", "settings", undefined] as const).map((current) =>
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
      expect(html).toContain(">Study<");
    }
    expect(new Set(pages.map((h) => h.match(/<main[^>]*>/)![0])).size).toBe(1);
  });
});

describe("AppHeader density (A2)", () => {
  it("header is h-[var(--header-h)] and has no bottom margin", () => {
    const header = renderToStaticMarkup(<AppHeader current="course" theme={LIGHT} />).match(/<header[^>]*>/)![0];
    expect(header).toContain("h-[var(--header-h)]");
    expect(header).not.toMatch(/\bmb-\d/);
    const page = renderToStaticMarkup(
      <ReadingPage current="course" theme={LIGHT}>
        <p>content</p>
      </ReadingPage>,
    );
    expect(page.match(/<header[^>]*>/)![0]).not.toMatch(/\bmb-\d/);
  });

  it("Card has p-3", () => {
    const html = renderToStaticMarkup(<Card>x</Card>);
    expect(html).toMatch(/<section[^>]*\bp-3\b/);
    expect(html).not.toMatch(/\bp-4\b/);
  });
});

describe("AppHeader", () => {
  const account = { name: "Asha" };
  const header = (current?: "workspace" | "course" | "notebook" | "settings") =>
    renderToStaticMarkup(<AppHeader current={current} theme={LIGHT} account={account} />);
  const navPages = [
    ["workspace", "/study", "Study"],
    ["course", "/course", "Course Map"],
    ["notebook", "/notebook", "Notebook"],
  ] as const;
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("header: brand, three pages, three icons", () => {
    const html = header("workspace");
    const nav = html.match(/<nav [^>]*aria-label="Pages"[^>]*>([\s\S]*?)<\/nav>/)![1];
    const links = [...nav.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([^<]+)/g)].map((m) => [m[2], m[1]]);
    expect(links).toEqual([
      ["Study", "/study"],
      ["Course Map", "/course"],
      ["Notebook", "/notebook"],
    ]);
    expect(html).toMatch(/<a title="Home"[^>]*href="\//);
    expect(html.match(/aria-label="Settings"/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*aria-label="Settings"[^>]*href="\/settings"/);
    expect(html.match(/aria-label="Account menu"/g)).toHaveLength(1);
    const visible = text(html);
    for (const word of ["Sign out", "Past Sessions", "Notes", "Progress", "Settings"]) expect(visible, word).not.toContain(word);
  });

  it("puts Finance Agent at the left as the heading, leading to Home", () => {
    const html = header("course");
    expect(html).toMatch(/<h1[^>]*><a[^>]*href="\/"[^>]*>(<svg.*<\/svg>)?Finance Agent<\/a><\/h1>/);
    expect(html.indexOf("Finance Agent")).toBeLessThan(html.indexOf("<nav"));
  });

  it("orders the header: brand, the three pages, theme, Settings gear, account", () => {
    const html = header("course");
    const at = (pattern: RegExp) => html.search(pattern);
    const order = [
      at(/href="\/study"[^>]*>Study</),
      at(/href="\/course"[^>]*>Course Map</),
      at(/href="\/notebook"[^>]*>Notebook</),
      at(/aria-label="Theme: Light"/),
      at(/aria-label="Settings"/),
      at(/aria-label="Account menu"/),
    ];
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("marks exactly the current page: a nav pill, or the gear on Settings", () => {
    for (const [page, href, label] of navPages) {
      const html = header(page);
      expect(html.match(/aria-current="page"/g), page).toHaveLength(1);
      expect(html, page).toMatch(new RegExp(`<a [^>]*aria-current="page"[^>]*href="${href}"[^>]*>${label}<`));
    }
    const settings = header("settings");
    expect(settings.match(/aria-current="page"/g)).toHaveLength(1);
    expect(settings).toMatch(/<a[^>]*aria-current="page"[^>]*aria-label="Settings"|<a[^>]*aria-label="Settings"[^>]*aria-current="page"/);
    expect(settings).toMatch(/href="\/settings"/);
  });

  it("points no link but Finance Agent at Home", () => {
    for (const [page] of navPages) {
      expect(header(page).match(/href="\/"/g), page).toHaveLength(1);
    }
    expect(header("settings").match(/href="\/"/g)).toHaveLength(1);
  });

  it("has a Home brand link drawn as a raised nav pill, with the title Home", () => {
    expect(header("workspace")).toMatch(/<a title="Home" data-affordance="nav" class="chip[^"]*" href="\/"/);
  });

  it("draws the page links as raised chips, the current one marked, each with a pending dot", () => {
    const html = header("notebook");
    expect(html.match(/data-affordance="nav" class="chip /g)).toHaveLength(4);
    expect(html.match(/data-\[link-pending=true\]/g)).toHaveLength(3);
    expect(html).toMatch(/aria-current="page"[^>]*href="\/notebook"/);
    expect(html).not.toContain("underline");
  });

  it("makes the theme control an icon button named for the current theme, which opens a menu", () => {
    const dark = renderToStaticMarkup(<AppHeader current="workspace" theme={{ mode: "single", theme: "dark" }} account={account} />);
    expect(dark).toMatch(/<button[^>]*aria-label="Theme: Dark"[^>]*aria-haspopup="menu"[^>]*aria-expanded="false"/);
    expect(dark).not.toContain("aria-pressed");
  });

  it("names the theme control just Theme on the server while the Learner follows the computer, whose mode it cannot know", () => {
    expect(renderToStaticMarkup(<AppHeader current="workspace" theme={DEFAULT_PREF} account={account} />)).toContain('aria-label="Theme"');
  });

  it("draws no account menu when no Learner is named (the loading skeleton and the 404 page)", () => {
    expect(renderToStaticMarkup(<AppHeader current="course" theme={LIGHT} />)).not.toContain('aria-label="Account menu"');
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
