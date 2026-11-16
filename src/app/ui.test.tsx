import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RisingBars } from "./rising-bars";
import { AppHeader, Card, PHONE_NOTE, ReadingPage, SignedInFrame, Tag } from "./ui";

describe("ReadingPage", () => {
  it("reading pages use the full box: one wide main for header and content, no narrow column", () => {
    const pages = (["course", "notebook", "settings", undefined] as const).map((current) =>
      renderToStaticMarkup(
        <ReadingPage current={current}>
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
  it("header is h-[var(--header-h)] on the paper over a --rule hairline, and has no bottom margin", () => {
    const header = renderToStaticMarkup(<AppHeader current="course" />).match(/<header[^>]*>/)![0];
    expect(header).toContain("h-[var(--header-h)]");
    expect(header).toMatch(/\bborder-b border-\[var\(--rule\)\] bg-\[var\(--paper\)\]/);
    expect(header).not.toMatch(/\bmb-\d/);
    const page = renderToStaticMarkup(
      <ReadingPage current="course">
        <p>content</p>
      </ReadingPage>,
    );
    expect(page.match(/<header[^>]*>/)![0]).not.toMatch(/\bmb-\d/);
  });

  // ADR 0018: hairlines, not boxes. A box is a page's one framed panel; a rule is Enjoy's ink line above, no box.
  it("Card is a box (hairline edge, 12px corners, raised, p-5) or a rule (a 1px line above)", () => {
    expect(renderToStaticMarkup(<Card>x</Card>)).toBe('<section class="rounded-xl border border-[var(--rule)] bg-[var(--raised)] p-5">x</section>');
    expect(renderToStaticMarkup(<Card variant="rule">x</Card>)).toBe('<section class="border-t border-[var(--line)] pt-5">x</section>');
    expect(renderToStaticMarkup(<Card variant="rule" className="flex">x</Card>)).toBe('<section class="border-t border-[var(--line)] pt-5 flex">x</section>');
  });
});

describe("AppHeader", () => {
  const account = { name: "Asha" };
  const header = (current?: "workspace" | "course" | "notebook" | "settings") =>
    renderToStaticMarkup(<AppHeader current={current} account={account} />);
  const navPages = [
    ["workspace", "/study", "Study"],
    ["course", "/course", "Course Map"],
    ["notebook", "/notebook", "Notebook"],
  ] as const;
  const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("header: brand, three pages, three icons", () => {
    const html = header("workspace");
    const nav = html.match(/<nav [^>]*aria-label="Pages"[^>]*>([\s\S]*?)<\/nav>/)![1];
    const links = [...nav.matchAll(/<a [^>]*href="([^"]+)"[^>]*><span[^>]*>([^<]+)<\/span>/g)].map((m) => [m[2], m[1]]);
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

  it("puts Value It at the left as the heading, leading to Home", () => {
    const html = header("course");
    expect(html).toMatch(/<h1[^>]*><a[^>]*href="\/"[^>]*>(<span aria-hidden="true" class="bars[^"]*".*?<\/span>)?Value It<\/a><\/h1>/);
    expect(html.indexOf("Value It")).toBeLessThan(html.indexOf("<nav"));
    expect(html.match(/class="bar"/g)).toHaveLength(4);
  });

  it("orders the header: brand, the three pages, theme switch, Settings gear, account", () => {
    const html = header("course");
    const at = (pattern: RegExp) => html.search(pattern);
    const order = [
      at(/href="\/study"[^>]*><span[^>]*>Study</),
      at(/href="\/course"[^>]*><span[^>]*>Course Map</),
      at(/href="\/notebook"[^>]*><span[^>]*>Notebook</),
      at(/data-testid="theme-switch"/),
      at(/aria-label="Settings"/),
      at(/aria-label="Account menu"/),
    ];
    expect(order.every((i) => i > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("marks exactly the current page, aria-current and the bar's slot together: a page link, or the gear on Settings", () => {
    for (const [page, href, label] of navPages) {
      const html = header(page);
      expect(html.match(/aria-current="page"/g), page).toHaveLength(1);
      expect(html, page).toMatch(new RegExp(`<a [^>]*aria-current="page"[^>]*href="${href}"[^>]*><span[^>]*>${label}<`));
      expect(html.match(/data-current="true"/g), page).toHaveLength(1);
      expect(html, page).toMatch(new RegExp(`<li data-current="true"[^>]*><a [^>]*aria-current="page"[^>]*href="${href}"`));
    }
    const settings = header("settings");
    expect(settings.match(/aria-current="page"/g)).toHaveLength(1);
    expect(settings).toMatch(/<a[^>]*aria-current="page"[^>]*aria-label="Settings"|<a[^>]*aria-label="Settings"[^>]*aria-current="page"/);
    expect(settings).toMatch(/href="\/settings"/);
    expect(settings.match(/data-current="true"/g)).toHaveLength(1);
    expect(settings).toMatch(/<span data-current="true"[^>]*><a[^>]*aria-label="Settings"/);
    expect(settings).not.toMatch(/<li data-current/);
    // The current gear is ink on no face, like a current page link: not the tinted face of a pressed icon.
    expect(settings).toMatch(/<a[^>]*aria-label="Settings"[^>]*class="btn btn-icon aria-\[current=page\]:\[--face:transparent\] aria-\[current=page\]:\[--label:var\(--ink\)\]"/);
  });

  it("points no link but Value It at Home", () => {
    for (const [page] of navPages) {
      expect(header(page).match(/href="\/"/g), page).toHaveLength(1);
    }
    expect(header("settings").match(/href="\/"/g)).toHaveLength(1);
  });

  it("has a plain wordmark: a 32px ghost link titled Home, the still 16px bars and the words, no pill", () => {
    const html = header("workspace");
    const brand = html.match(/<a title="Home" data-affordance="nav" class="[^"]*\bh-8\b[^"]*\brounded-lg\b[^"]*" href="\/"/)![0];
    expect(brand).not.toMatch(/\bchip\b|\bbtn\b|shadow|border/);
    expect(brand).toContain("font-[family-name:var(--font-display)]");
    expect(html).toMatch(/<span aria-hidden="true" class="bars +bars-still" style="height:16px/);
  });

  it("draws the page links as flat ghost tabs: 32px, 8px corners, a bar slot each, a pending dot each, no chips", () => {
    const html = header("notebook");
    expect(html.match(/data-affordance="nav" class="relative inline-flex h-8 [^"]*rounded-lg/g)).toHaveLength(3);
    expect(html.match(/data-\[link-pending=true\]/g)).toHaveLength(3);
    // Three page slots and the gear's: each can draw the accent bar on the hairline.
    expect(html.match(/data-\[current=true\]:after:bg-\[var\(--accent\)\]/g)).toHaveLength(4);
    for (const label of ["Study", "Course Map", "Notebook"]) expect(html, label).toContain(`data-label="${label}"`);
    expect(html).toMatch(/aria-current="page"[^>]*href="\/notebook"/);
    const headerHtml = html.match(/<header[\s\S]*<\/header>/)![0];
    expect(headerHtml).not.toMatch(/class="chip|shadow-\[0_|--lip|\[\.dark_&\]/);
    expect(html).not.toContain("underline");
  });

  it("draws the three right-hand controls as 32px ghost icon buttons with tooltips", () => {
    const html = header("course");
    const icons = [...html.matchAll(/<(?:a|button)[^>]*data-affordance="icon"[^>]*>/g)].map((m) => m[0]);
    expect(icons).toHaveLength(3);
    for (const tag of icons) {
      expect(tag).toMatch(/class="btn btn-icon\b/);
      expect(tag).toMatch(/\btitle="[^"]+"/);
    }
  });

  // ADR 0019 (#80): the same sun/moon switch as the site nav, drawn with both icons so CSS shows the right one on the
  // first frame; no `dark:` utilities, the tokens carry the theme. The loading skeleton has it too, so it never jumps.
  it("has the theme switch, in the skeleton too", () => {
    for (const html of [header("workspace"), renderToStaticMarkup(<AppHeader current="workspace" />)]) {
      expect(html.match(/data-testid="theme-switch"/g)).toHaveLength(1);
      expect(html).toMatch(/aria-label="Switch to (?:dark|light) theme"/);
      expect(html).toContain('data-testid="theme-icon-moon"');
      expect(html).toContain('data-testid="theme-icon-sun"');
      expect(html).not.toMatch(/\bdark:/);
    }
  });

  it("draws no account menu when no Learner is named (the loading skeleton and the 404 page)", () => {
    expect(renderToStaticMarkup(<AppHeader current="course" />)).not.toContain('aria-label="Account menu"');
  });
});

describe("Tag", () => {
  it("reads YOUR ASSUMPTION and SOURCED", () => {
    expect(renderToStaticMarkup(<Tag kind="you" />).toUpperCase()).toContain("YOUR ASSUMPTION");
    expect(renderToStaticMarkup(<Tag kind="src" />).toUpperCase()).toContain("SOURCED");
    // Decision #17: the provenance dots follow the Signal colours, you in blue and sourced in ink (the record).
    expect(renderToStaticMarkup(<Tag kind="you" />)).toContain('data-tone="you"');
    expect(renderToStaticMarkup(<Tag kind="src" />)).toContain('data-tone="src"');
  });
});

describe("SignedInFrame", () => {
  it("renders the phone note and the page", () => {
    const html = renderToStaticMarkup(<SignedInFrame><p>The page</p></SignedInFrame>);
    expect(html).toContain(PHONE_NOTE);
    expect(html).toContain("The page");
  });
});

// Owner decision 5: the mark is four solid accent bars with 1-2px corners; no mint, no gradient, no pill ends.
describe("RisingBars", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const rule = (selector: string) => css.match(new RegExp(`\\n${selector.replace(/[.*]/g, "\\$&")} \\{([^}]*)\\}`))![1];

  it("draws each bar as one solid accent fill with 1-2px corners, still growing from the bottom", () => {
    const bar = rule(".bar");
    expect(bar).toMatch(/background: var\(--accent-fill\);/);
    expect(bar).toMatch(/border-radius: [12]px;/);
    expect(bar).toContain("animation: bar-rise");
    expect(bar).not.toMatch(/gradient|mint|999px/);
    expect(rule(".bars-on-brand .bar")).toMatch(/background: currentColor;/);
    expect(rule(".bars-still .bar")).toContain("animation: none");
  });

  it("sizes the bars and gaps in whole pixels, so a small mark stays crisp", () => {
    const html = renderToStaticMarkup(<RisingBars size={16} className="bars-still" />);
    expect(html).toMatch(/^<span aria-hidden="true" class="bars bars-still" style="height:16px;gap:2px">/);
    expect(html.match(/width:3px/g)).toHaveLength(4);
    expect(renderToStaticMarkup(<RisingBars size={18} onBrand />)).toMatch(/class="bars bars-on-brand"/);
  });

  it("draws the browser tab icon the same way: solid white bars with 1px corners on a #1f3fae square, no gradient", () => {
    const icon = readFileSync("src/app/icon.svg", "utf8");
    expect(icon).toContain('fill="#1f3fae"');
    expect(icon).not.toMatch(/gradient|#12B886|url\(/i);
    expect(icon.match(/<rect x="[^"]+" y="[^"]+" width="4" height="[^"]+" rx="1"\/>/g)).toHaveLength(4);
  });
});
