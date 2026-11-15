import { readFileSync } from "node:fs";
import { Window } from "happy-dom";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { learnerState, OWNER_LEARNER_ID, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureTopicStarted } from "@/learner/memory";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { stringify } from "yaml";
import { loadCourseMap, parseCourseMap, type Topic } from "@/course/map";
import { navigate, type Progress, type TopicProgress } from "@/course/navigator";
import { copy } from "./copy";
import { HOME_TOPIC_ID, homeTopicWritten } from "./home-topic";
import { loadShowcases } from "./showcase-widgets";

const getDbMock = vi.hoisted(() => vi.fn());
const loadMap = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({ getDb: getDbMock }));
vi.mock("@/course/map", async (orig) => {
  const real = await orig<typeof import("@/course/map")>();
  loadMap.mockImplementation(real.loadCourseMap);
  return { ...real, loadCourseMap: loadMap };
});
vi.mock("./stats", () => ({ landingStats: async () => ({ topics: 1, subjects: 1, cases: 1 }) }));
// The owner is signed in (signing in itself is tested in src/auth/sign-in.test.ts).
vi.mock("@/auth/session", () => ({ currentLearnerId: async () => 1, isSignedIn: async () => true }));
// Home's Explorable reads its Case Data through its own day-long cache; its server read is tested in
// home-widget-data.test.ts. Here it is the real annuity from the Topic file with no Case Data, so no database is read.
vi.mock("./home-widget-data", async (orig) => {
  const real = await orig<typeof import("./home-widget-data")>();
  const { loadCourseMap: realMap } = await vi.importActual<typeof import("@/course/map")>("@/course/map");
  return { ...real, homeWidget: async () => ({ annuity: real.homeAnnuity(realMap())!, cases: [] }) };
});
const { LandingPage, LandingView, homeButton, loadHomeButton } = await import("./landing");
const { homeAnnuity } = await import("./home-widget-data");
type HomeButton = import("./landing").HomeButton;

const stats = { topics: 95, subjects: 9, cases: 103 };
const widget = { annuity: homeAnnuity(loadCourseMap())!, cases: [] };
// The Explorable's question, as the Topic file's $1.537B annuity makes it.
const TITLE = copy.widget.question("$1.537B");
const words = (h: string) => h.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const plain = (h: string) => words(h).replaceAll("&#x27;", "'").replaceAll("&quot;", '"').replaceAll("&amp;", "&");
const showcases = loadShowcases();
const html = renderToStaticMarkup(<LandingView stats={stats} widget={widget} showcases={showcases} />);
const text = words(html);
// This file runs in Node (it also reads a PGlite database), so markup is parsed with happy-dom's own DOMParser.
const parser = new new Window().DOMParser();
const doc = (h: string) => parser.parseFromString(h, "text/html") as unknown as Document;
// The words Home never shows: Learner and Library words, and "lesson" (the glossary says Topic).
const BANNED = ["lesson", "Session", "Continue", "Ask the Tutor", "Past Sessions", "Progress"];
/** Home's six sections in order (spec 2026-11-12 E1), each found by the mark it carries. */
const SECTIONS = ['data-band="home-hero"', 'id="value-a-company"', 'id="how-it-works"', 'id="examples"', 'id="what-you-get"', 'data-home-section="closing"'];
const section = (h: string, i: number) => h.slice(h.indexOf(SECTIONS[i]), i + 1 < SECTIONS.length ? h.indexOf(SECTIONS[i + 1]) : h.indexOf("<footer"));

describe("Home [E1]", () => {
  it("has one headline: Learn what things are worth.", () => {
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(html).toMatch(/<h1[^>]*>Learn what things are worth\.<\/h1>/);
  });

  it("says what Value It is in one line under the h1, before the Widget", () => {
    expect(html.indexOf(copy.subtext)).toBeGreaterThan(html.indexOf("<h1"));
    expect(html.indexOf(copy.subtext)).toBeLessThan(html.indexOf(TITLE));
  });

  it("comes in the spec's order: hero, Now value a company, How every Topic works, the Showcases, What you get, the closing Band", () => {
    const positions = SECTIONS.map((mark) => html.indexOf(mark));
    expect(positions.every((p) => p >= 0), `${positions}`).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html.indexOf(copy.footer)).toBeGreaterThan(positions.at(-1)!);
    for (const [i, title] of [
      [1, "Now value a company."],
      [2, "How every Topic works"],
      [3, "More moments from real Topics"],
      [4, "What you get, and who it is for"],
    ] as const) {
      expect(plain(section(html, i)), title).toContain(title);
    }
  });

  it("puts the hero, How every Topic works and the closing on Bands, and the rest on the page", () => {
    const d = doc(html);
    const bands = [...d.querySelectorAll(".band, .home-band")].filter((el) => !el.parentElement?.closest(".band, .home-band"));
    expect(bands.map((b) => b.getAttribute("data-band") ?? b.getAttribute("data-home-section"))).toEqual(["home-hero", "home-how-it-works", "closing"]);
    // The Explorable sits on a white card on the hero's Band.
    expect(d.querySelector('[data-band="home-hero"] [data-testid="home-widget"]')?.classList.contains("band-card")).toBe(true);
  });

  it('no longer has "Why this and not a video" or "Free during early access" as sections; their lines live on as captions and notes', () => {
    expect(text).not.toContain("Why this and not a video");
    expect(html).not.toMatch(/<h2[^>]*>Free during early access/);
    expect(text).toContain(copy.valueCompany.caption);
    expect(plain(section(html, 5))).toContain(copy.closingNote);
  });

  it("Now value a company sets the scene in three sentences, beside Value levers on Amazon at $35, with Sign in under it signed out (E4)", () => {
    const two = section(html, 1);
    expect(plain(two)).toContain("February 2000. Amazon sells books online, loses money, and its shares cost $84. Set four levers and see what your story is worth.");
    const d = doc(two);
    expect(d.querySelector('[data-testid="home-value-levers"] [data-testid="value-levers"]')).not.toBeNull();
    expect(d.querySelector('[data-testid="value-levers-headline"]')?.textContent).toBe("Your story is worth $35 a share");
    expect(d.querySelectorAll('input[type="range"]').length).toBeGreaterThanOrEqual(4);
    const link = d.querySelector('a[href="/login"]');
    expect(link?.textContent).toBe("Sign in to see what happened next →");
    expect(two).not.toContain("Open this Topic");
  });

  // E5: a four-step control; each step keeps its one line of caption, in its own panel (one open at a time).
  it("How every Topic works names the four moves in order, each with its caption", () => {
    const three = plain(section(html, 2));
    const names = copy.moves.map((m) => three.indexOf(m.name));
    const lines = copy.moves.map((m) => three.indexOf(m.line));
    expect([...names, ...lines].every((p) => p >= 0), `${names} ${lines}`).toBe(true);
    expect([...names].sort((a, b) => a - b)).toEqual(names);
    expect([...lines].sort((a, b) => a - b)).toEqual(lines);
    expect(three).toContain("Put your own number on it, then see what really happened.");
  });

  it("What you get gives three items, each with a picture, and two short lists", () => {
    const five = section(html, 4);
    const d = doc(five);
    expect([...d.querySelectorAll("li h3")].map((h) => h.textContent)).toEqual(["A Tutor that answers back", "Widgets you move", "Checks that bring back what you missed"]);
    expect(d.querySelectorAll("li svg")).toHaveLength(3);
    expect(plain(five)).toContain(copy.forWho.line);
    expect([...d.querySelectorAll("ul.list-disc li")].map((li) => li.textContent)).toEqual([...copy.notWhat.lines]);
  });

  it("ends on the closing Band, the faint second line and the footer", () => {
    expect(html).toMatch(/<section data-home-section="closing" class="home-band[^"]*">/);
    expect(html).toMatch(/<span>Money makes sense<\/span><span class="home-faint">one bar at a time\.<\/span>/);
    expect(text).toContain(copy.footer);
  });

  it("shows the lockup as plain text, not a link", () => {
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toMatch(/<span class="home-lockup"[^>]*><span aria-hidden="true" class="bars[^"]*"/);
    expect(header).not.toMatch(/<a[^>]*>(?:(?!<\/a>).)*Value It/);
  });

  it("says Topic, never lesson, and shows no Learner or Library words", () => {
    for (const word of BANNED) expect(text, word).not.toContain(word);
    expect(text.toLowerCase()).not.toContain("lesson");
  });

  it("shows no Draft badge and no screenshot of the workspace", () => {
    expect(text).not.toContain("Draft");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("landing-assets");
  });

  it("shows a quiet placeholder on the card when the Widget can't be read", () => {
    const h = renderToStaticMarkup(<LandingView stats={stats} widget={null} />);
    const frame = h.match(/<div[^>]*data-testid="home-widget"[^>]*>([^<]*)<\/div>/);
    expect(frame?.[1]).toBe(copy.widgetPlaceholder);
    expect(h.indexOf(copy.frameLabel)).toBeGreaterThanOrEqual(0);
    expect(h.indexOf(copy.frameLabel)).toBeLessThan(h.indexOf('data-testid="home-widget"'));
    expect(h).not.toContain("Sign in to learn why");
  });

  // E8: the general Widget renderer (LiveWidget, WidgetWithSave, OpenUI) is not in Home's first view. The hero, section 2
  // and section 3 never import it; section 4 loads it with next/dynamic, so nothing of it is drawn on the server.
  it("never draws or imports the general Widget renderer outside section 4's lazy load", () => {
    expect(html).not.toContain('data-testid="showcase-widget"');
    expect(html.match(/data-testid="showcase-widget-space"/g)).toHaveLength(3);
    const source = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
    for (const file of ["./landing.tsx", "./home-widget.tsx", "./home-explorable.tsx", "./home-value-levers.tsx", "./how-topics-work.tsx", "./how-topics-work-steps.ts", "./chrome.tsx"]) {
      expect(source(file), file).not.toMatch(/from "(?:\.\/live-widget|\.\.\/widget-panel|\.\.\/widget-view|@\/widgets\/(?:genui|library|openui)[^"]*|@openuidev[^"]*)"/);
    }
    const tabs = source("./showcase-tabs.tsx");
    expect(tabs).not.toMatch(/^import [^;]*from "\.\/live-widget"/m);
    expect(tabs).toMatch(/dynamic\(\(\) => import\("\.\/live-widget"\)[^;]*\{ ssr: false/);
    expect(tabs).toContain('rootMargin: NEAR_MARGIN');
    expect(tabs).toContain('NEAR_MARGIN = "100% 0px"');
  });
});

// ADR 0015: Enjoy's editorial look. An eyebrow, not a pill; ghost header links; hairline rows; Inter Tight, not Manrope;
// and royal-blue Bands that are always light, with a white button and no pad.
describe("Home's look", () => {
  const css = readFileSync(new URL("../globals.css", import.meta.url), "utf8");
  const home = css.slice(css.indexOf("/* Home (src/app/_landing/landing.tsx)"));
  const light = css.slice(css.indexOf(":root {\n  color-scheme"), css.indexOf("\n}\n", css.indexOf(":root {\n  color-scheme")));
  const token = (block: string, name: string) => block.match(new RegExp(`\\n\\s*--${name}:\\s*([^;]+);`))?.[1].trim();

  it("puts a plain eyebrow over the headline, not a pill", () => {
    expect(html).toContain(`<p class="home-eyebrow">${copy.eyebrow}</p>`);
    expect(html.slice(0, html.indexOf("<h1"))).not.toContain('data-affordance="tag"');
  });

  it("draws the header links as ghost nav links, signed out and signed in", () => {
    const header = (h: string) => h.slice(h.indexOf("<header"), h.indexOf("</header>"));
    const about = /<a href="\/about" data-affordance="nav" class="home-nav[^"]*">About<\/a>/;
    expect(header(html)).toMatch(about);
    expect(header(html)).toMatch(/<a href="\/login" data-affordance="nav" class="home-nav[^"]*">Sign in<\/a>/);
    const inHtml = renderToStaticMarkup(<LandingView stats={stats} button={{ kind: "open" }} widget={widget} showcases={showcases} />);
    expect(header(inHtml)).toMatch(about);
    expect(header(inHtml)).toMatch(/<a href="\/study" data-affordance="nav" class="home-nav[^"]*">Study Workspace<\/a>/);
    for (const h of [header(html), header(inHtml)]) {
      expect(h).toMatch(/<a [^>]*href="\/#how-it-works"[^>]*>How it works<\/a>/);
      expect(h.indexOf('href="/#how-it-works"')).toBeGreaterThanOrEqual(0);
      expect(h.indexOf('href="/#how-it-works"')).toBeLessThan(h.indexOf('href="/about"'));
    }
    expect(header(html).indexOf('href="/#how-it-works"')).toBeLessThan(header(html).indexOf('href="/#examples"'));
    expect(header(html).indexOf('href="/#examples"')).toBeLessThan(header(html).indexOf('href="/about"'));
    expect(header(html).indexOf('href="/about"')).toBeLessThan(header(html).indexOf('href="/login"'));
    expect(header(inHtml).indexOf('href="/about"')).toBeLessThan(header(inHtml).indexOf('href="/study"'));
    expect(header(html)).not.toContain("aria-current");
  });

  it("links the About page from the footer, beside the footer line", () => {
    const footer = html.slice(html.indexOf("<footer"), html.indexOf("</footer>"));
    expect(footer).toContain(copy.footer);
    expect(footer).toMatch(/<a [^>]*href="\/#how-it-works"[^>]*>How it works<\/a>/);
    expect(footer).toMatch(/<a href="\/about" data-affordance="link" class="link[^"]*">About<\/a>/);
    expect(footer.indexOf("How it works")).toBeLessThan(footer.indexOf("Examples"));
    expect(footer.indexOf("Examples")).toBeLessThan(footer.indexOf(">About<"));
  });

  it("sets What you get after a hairline, with no box around it", () => {
    const five = section(html, 4);
    expect(five).toContain('<hr class="home-rule"/>');
    expect(five).not.toMatch(/<section[^>]*rounded-xl border/);
  });

  it("gives a Band's button no white pad: the button itself is white on the Band", () => {
    expect(html).not.toContain("bg-white p-2");
    expect(home).toMatch(/\.home-band \.btn \{[^}]*background-color: var\(--on-band\);[^}]*color: var\(--on-band-button-ink\);/);
    expect(home).toMatch(/\.band \.btn:not\(\.band-card \*\),\n\.home-band \.btn \{/);
    expect(token(light, "on-band")).toBe("#ffffff");
    expect(token(light, "on-band-button-ink")).toBe("#0b0d12");
    expect(home).toMatch(/\.home-band \{[^}]*color-scheme: light;/);
  });

  // Spec F1: a Band is painted from the Band tokens; --band is --royal, the same blue as Light's --accent-fill.
  it("paints the Bands in --band, which is --royal, the same blue as Light's --accent-fill (C14)", () => {
    expect(home).toMatch(/\.band,\n\.home-band \{ background: var\(--band\); color: var\(--on-band\);/);
    expect(token(light, "band")).toBe("var(--royal)");
    expect(token(light, "royal")).toBeTruthy();
    expect(token(light, "royal")!.toLowerCase()).toBe(token(light, "accent-fill")!.toLowerCase());
  });

  it("sets display type in Inter Tight at 600, never Manrope or 700+", () => {
    expect(css).not.toMatch(/Manrope/i);
    expect(home).toContain("font-family: var(--font-display");
    expect(home).not.toMatch(/font-weight: (?:[7-9]00|bold)/);
    expect(readFileSync(new URL("./landing.tsx", import.meta.url), "utf8")).not.toMatch(/\bfont-(?:bold|extrabold|black)\b/);
  });

  // E9: the match line arrives with a short fade, and nothing moves under reduced motion.
  it("lets the match line arrive, and stills it under reduced motion", () => {
    expect(home).toMatch(/\.home-arrive \{ animation: home-arrive /);
    expect(home).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n {2}\.home-arrive \{ animation: none; \}/);
  });
});

// E6: three Showcases as tabs, one on screen, each a question, the Tutor's reply and the live Widget, built from Topic files.
describe("Home's Showcases, as tabs [E6]", () => {
  const four = section(html, 3);
  const d = doc(four);

  it("sits between How every Topic works and What you get", () => {
    expect(html.indexOf('id="examples"')).toBeGreaterThan(html.indexOf(copy.movesTitle));
    expect(html.indexOf('id="examples"')).toBeLessThan(html.indexOf(copy.get.title));
  });

  it("offers three tabs, Everyday money, The news and A real company, with the first selected", () => {
    const tabs = [...d.querySelectorAll('[role="tablist"] [role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(["Everyday money", "The news", "A real company"]);
    expect(tabs.map((t) => t.getAttribute("aria-selected"))).toEqual(["true", "false", "false"]);
    expect(tabs.map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
  });

  it("shows one Showcase at a time: the other two panels are hidden", () => {
    const panels = [...d.querySelectorAll('[role="tabpanel"]')];
    expect(panels).toHaveLength(3);
    expect(panels.map((p) => p.hasAttribute("hidden"))).toEqual([false, true, true]);
    panels.forEach((panel, i) => expect(panel.getAttribute("aria-labelledby")).toBe(d.querySelectorAll('[role="tab"]')[i].id));
  });

  it("gives each Showcase You ask and its question, then Tutor and its reply", () => {
    expect(showcases).toHaveLength(3);
    const panels = [...d.querySelectorAll('[role="tabpanel"]')];
    showcases.forEach((showcase, i) => {
      const row = panels[i].textContent!;
      const at = (needle: string) => row.indexOf(needle);
      const order = [at(showcase.words.label), at(copy.showcases.you), at(showcase.words.question), at(copy.showcases.tutor), at(showcase.words.reply)];
      expect(order.every((p) => p >= 0), `${showcase.id}: ${order}`).toBe(true);
      expect([...order].sort((a, b) => a - b), showcase.id).toEqual(order);
    });
    expect(copy.showcases.you).toBe("You ask");
    expect(copy.showcases.tutor).toBe("Tutor");
  });

  it("names the count of real past events in its intro", () => {
    expect(plain(four)).toContain("Every Topic is a real past event: 103 in all.");
  });

  it("keeps Join early access at three: the header, the hero and the closing Band", () => {
    expect(text.match(/Join early access/g)).toHaveLength(3);
  });

  it("links Examples to /#examples in the header and footer, between How it works and About", () => {
    for (const tag of ["header", "footer"]) {
      const part = html.slice(html.indexOf(`<${tag}`), html.indexOf(`</${tag}>`));
      expect(part, tag).toMatch(/<a [^>]*href="\/#examples"[^>]*>Examples<\/a>/);
      const [how, examples, about] = ['href="/#how-it-works"', 'href="/#examples"', 'href="/about"'].map((n) => part.indexOf(n));
      expect(how, tag).toBeGreaterThanOrEqual(0);
      expect(how, tag).toBeLessThan(examples);
      expect(examples, tag).toBeLessThan(about);
    }
  });
});

describe("Home, signed out", () => {
  it("offers Join early access in the header, hero and closing Band, every one to the sign-in page and marked for analytics", () => {
    const joins = [...doc(html).querySelectorAll("a[data-join]")];
    expect(joins.map((a) => [a.getAttribute("href"), a.textContent, a.closest("[data-home-section]")?.getAttribute("data-home-section")])).toEqual([
      ["/login", "Join early access", "header"],
      ["/login", "Join early access", "hero"],
      ["/login", "Join early access", "closing"],
    ]);
  });

  it("puts the bars before each main button's label, the note under the hero's, and the offer under the closing Band's", () => {
    expect([...html.matchAll(/<span aria-hidden="true" class="bars bars-on-brand"[^>]*>(?:<span[^>]*><\/span>){4}<\/span><span class="min-w-0 truncate">Join early access<\/span><\/a>/g)]).toHaveLength(2);
    const notes = [...doc(html).querySelectorAll("[data-join-note]")].map((n) => [n.closest("[data-home-section]")?.getAttribute("data-home-section"), n.textContent]);
    expect(notes).toEqual([
      ["hero", `Free during early access. ${copy.phoneNote}`],
      ["closing", `${copy.closingNote} ${copy.phoneNote}`],
    ]);
  });

  // E7: below 768 px, signed out, the note under the button adds that studying needs a laptop or tablet today.
  it("adds the phone note only below 768 px (md:hidden)", () => {
    for (const note of doc(html).querySelectorAll("[data-phone-note]")) {
      expect(note.textContent!.trim()).toBe("Studying needs a laptop or tablet today.");
      expect(note.className).toBe("md:hidden");
    }
  });

  // ADR 0014: anyone may join, with Google or an email link, and the owner lets each person in.
  it("says how to join, Google or an email link, and that people are let in one at a time", () => {
    const closing = plain(section(html, 5));
    expect(closing).toContain("Join with Google or an email link.");
    expect(closing).toContain("we let people in one at a time");
    expect(text).not.toMatch(/invite list|Google account/);
  });

  it("links Sign in in the header to the sign-in page, and offers no Sign out", () => {
    const header = html.slice(html.indexOf("<header"), html.indexOf("</header>"));
    expect(header).toMatch(/<a[^>]*href="\/login"[^>]*>Sign in<\/a>/);
    expect(html).not.toContain("Sign out");
    expect(html).not.toContain("/api/logout");
  });
});

// Home's Explorable (the owner's design E; spec 2026-11-12 E3): Present value's annuity from the Topic file, drawn by code on
// the hero's white card, with a way to sign in. Its behaviour is tested in home-widget.test.tsx.
describe("Home's Explorable, signed out", () => {
  const hero = section(html, 0);

  it("asks its question, with Present value's rate slider, on the labelled card", () => {
    expect(html).toContain(`>${TITLE}</h2>`);
    expect(html).toContain('aria-label="Interest rate (discount rate)"');
    expect(html.match(/data-testid="home-widget"/g)).toHaveLength(1);
    expect(html.indexOf(copy.frameLabel)).toBeLessThan(html.indexOf('data-testid="home-widget"'));
    expect(html.indexOf(TITLE)).toBeGreaterThan(html.indexOf('data-testid="home-widget"'));
    // No window chrome: the first heading inside the card is the Widget's own question (B1).
    const card = hero.slice(hero.indexOf('data-testid="home-widget"'));
    expect(card.match(/<h[1-6][^>]*>([^<]*)</)?.[1]).toBe(TITLE);
  });

  it("opens at 0% with its opening line, the guess and the chips for 0%, 5% and 10%", () => {
    const card = plain(hero);
    expect(card).toContain("Raise the rate and watch the far-off payments shrink.");
    expect(hero).toMatch(/<input type="range" min="0" max="10" step="any"[^>]*value="0"/);
    const chips = [...doc(hero).querySelectorAll('[data-testid="home-widget"] button[data-affordance="chip"]')].map((b) => b.textContent);
    expect(chips).toEqual(["0%", "5%", "10%"]);
  });

  it("has no Guided Task list: its question and its rate say what to try", () => {
    expect(hero.match(/<li[^>]*data-state=/g)).toBeNull();
  });

  it("offers Sign in to learn why → in the card, after its state line, to the sign-in page", () => {
    expect(html).toMatch(/<a href="\/login" data-affordance="link" class="link[^"]*">Sign in to learn why →<\/a>/);
    expect(html.indexOf("Sign in to learn why")).toBeGreaterThan(html.indexOf(copy.widget.start));
  });

  // The match line (E3) appears only once the visitor finds the rate; the first paint never names it.
  it("never names the match rate before the visitor finds it, nor a break-even task or the 30-year Treasury", () => {
    expect(text).not.toMatch(/You found it|Find the rate|break-even|Treasury|3\.[34]%/);
  });
});

describe("Home, signed in", () => {
  const inHtml = renderToStaticMarkup(<LandingView stats={stats} button={{ kind: "open" }} widget={widget} showcases={showcases} />);
  const inText = words(inHtml);

  it("is the same page, with the same sections", () => {
    expect(inHtml).toMatch(/<h1[^>]*>Learn what things are worth\.<\/h1>/);
    expect(inHtml).toContain(TITLE);
    const positions = SECTIONS.map((mark) => inHtml.indexOf(mark));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(inText).toContain(copy.footer);
  });

  it("offers Open Study Workspace as every main button and Study Workspace in the header, all to /study", () => {
    expect(inHtml.match(/<a[^>]*href="\/study"[^>]*>(?:(?!<\/a>).)*Open Study Workspace<\/span><\/a>/g)).toHaveLength(2);
    expect(inHtml.slice(inHtml.indexOf("<header"), inHtml.indexOf("</header>"))).toMatch(/<a[^>]*href="\/study"[^>]*>Study Workspace<\/a>/);
  });

  // E7: on a screen narrower than 768 px the main button is "Send this to my laptop" instead (md:hidden), and the wide
  // one hides there (max-md:hidden).
  it("offers Send this to my laptop in place of each main button below 768 px", () => {
    const d = doc(inHtml);
    const send = [...d.querySelectorAll("button[data-send-to-laptop]")];
    expect(send.map((b) => b.closest("[data-home-section]")?.getAttribute("data-home-section"))).toEqual(["hero", "closing"]);
    for (const b of send) {
      expect(b.textContent).toContain("Send this to my laptop");
      expect(b.className.split(" ")).toContain("md:hidden");
    }
    for (const a of d.querySelectorAll('main a[href="/study"]')) expect(a.className.split(" "), a.textContent!).toContain("max-md:hidden");
  });

  it("offers Sign out beside Study Workspace in the header, as a form posting to the sign-out route", () => {
    const header = inHtml.slice(inHtml.indexOf("<header"), inHtml.indexOf("</header>"));
    expect(header).toMatch(/href="\/study"[^>]*>Study Workspace<\/a><form[^>]*action="\/api\/logout"[^>]*method="post"[^>]*><button type="submit"[^>]*>Sign out<\/button><\/form>/);
  });

  it("never says Join early access or Sign in, nor links to the login", () => {
    expect(inText).not.toContain("Join early access");
    expect(inText).not.toContain("Sign in");
    expect(inHtml).not.toContain('href="/login"');
    expect(inHtml).not.toContain("data-join=");
  });

  it("says Topic, never lesson, and shows no Learner or Library words", () => {
    for (const word of BANNED) expect(inText, word).not.toContain(word);
  });
});

// E7: signed in, the main button reads in full: "Resume" (or "Start") on the first line and the Topic's whole title on a
// second line that wraps, never cut off.
describe("Home, the signed-in button [E7]", () => {
  const LONG = "Percent, percentage points and basis points";
  const heroOf = (button: HomeButton) => {
    const d = doc(renderToStaticMarkup(<LandingView stats={stats} button={button} />));
    return d.querySelector('[data-home-section="hero"]')!;
  };

  it("Resume is on its own line over the whole Topic title, which wraps and is never truncated, posting to /api/open", () => {
    const hero = heroOf({ kind: "resume", topic: LONG });
    const form = hero.querySelector('form[action="/api/open"][method="post"]')!;
    const label = form.querySelector("[data-main-button-label]")!;
    expect([...label.children].map((c) => c.textContent)).toEqual(["Resume", LONG]);
    expect(form.querySelector("[data-main-button-topic]")!.className).toContain("[overflow-wrap:anywhere]");
    expect(form.innerHTML).not.toContain("truncate");
    expect(form.querySelector("button")!.className).toContain("h-auto");
  });

  it("Start reads the same way", () => {
    const label = heroOf({ kind: "start", topic: "Present value" }).querySelector("[data-main-button-label]")!;
    expect([...label.children].map((c) => c.textContent)).toEqual(["Start", "Present value"]);
  });

  it("What comes next shows its label in full and opens that Topic, as a form posting to /api/open", () => {
    const form = heroOf({ kind: "next", label: "New in Percent: Check 3 →" }).querySelector('form[action="/api/open"]')!;
    expect(form.textContent).toBe("New in Percent: Check 3 →");
    expect(form.innerHTML).not.toContain("truncate");
  });

  it("Open Study Workspace opens /study", () => {
    expect(heroOf({ kind: "open" }).querySelector('a[href="/study"]')?.textContent).toBe("Open Study Workspace");
  });
});

describe("Home, the button rule: What comes next, in the Course Navigator's order", () => {
  const map = presentValueOnly({ withoutQuiz: true });
  const pv = map.topic("present-value")!;
  const passed = (topic: Topic): TopicProgress => ({ step: "principle", passedChecks: topic.checks.map((c) => c.id), revealShown: true, status: "passed", insight: "found" });
  const progress = (topics: Progress["topics"], currentTopicId: string | null = null): Progress => ({ currentTopicId, topics });

  it("is Open once every Topic is passed and nothing is due", () => expect(homeButton(map, progress({ [pv.id]: passed(pv) }))).toEqual({ kind: "open" }));
  it("is Start for a Learner who has started nothing", () => expect(homeButton(map, progress({}))).toEqual({ kind: "start", topic: pv.title }));
  it("is Resume for the chosen Topic in progress", () =>
    expect(homeButton(map, progress({ [pv.id]: { step: "concept", passedChecks: [], revealShown: false, status: "in_progress" } }, pv.id))).toEqual({ kind: "resume", topic: pv.title }));
  it("is Start for a chosen Topic not yet started", () => {
    const real = loadCourseMap();
    const [first, second] = real.topics;
    expect(homeButton(real, progress({ [first.id]: passed(first) }, second.id))).toEqual({ kind: "start", topic: second.title });
  });
  it("is New in <Topic>: Check N → for a passed Topic with a Check due", () => {
    const text = stringify({ ...pv, connections: undefined, prerequisites: [], checks: [...pv.checks, { id: "pv-new", kind: "conversation", prompt: "Which?", passCriteria: "Compares.", required: true }] });
    const edited = parseCourseMap([{ name: "present-value.yaml", text }]).map!;
    expect(homeButton(edited, progress({ [pv.id]: passed(pv) }))).toEqual({ kind: "next", label: `New in ${pv.title}: Check ${pv.checks.length + 1} →` });
  });
  it("is New in <Topic>: Explore → for a passed Topic whose Explore is now required", () => {
    const text = stringify({ ...pv, connections: undefined, prerequisites: [], explore: { ...pv.explore, requiredWhenPassed: true } });
    const edited = parseCourseMap([{ name: "present-value.yaml", text }]).map!;
    expect(homeButton(edited, progress({ [pv.id]: { ...passed(pv), insight: undefined } }))).toEqual({ kind: "next", label: `New in ${pv.title}: Explore →` });
  });
  it("is Next Topic: <title> → after a Topic is passed", () => {
    // Spine Topic 1 is the first Topic (C1); Home's button names whatever the Course Navigator puts next, which is the
    // next written Spine Topic as they are written, and the first Follow Topic once none is left.
    const real = loadCourseMap();
    const first = real.topic("spine-01-worth")!;
    const done = progress({ [first.id]: passed(first) });
    const next = navigate(real, done)!.topic;
    expect(next.id).not.toBe(first.id);
    expect(homeButton(real, done)).toEqual({ kind: "next", label: `Next Topic: ${next.title} →` });
  });
});

describe("Home's page, signed in", () => {
  let db: Db;
  const map = presentValueOnly();
  const title = map.topic("present-value")!.title;
  beforeEach(async () => {
    db = await testDb();
    loadMap.mockReturnValue(map);
  });
  const render = async () => renderToStaticMarkup(await LandingPage({ button: await loadHomeButton() }));
  const rows = async () => (await db.select().from(topicProgress)).length + (await db.select().from(learnerState)).length;

  it("shows Start and the first Topic on a fresh database and writes nothing", async () => {
    getDbMock.mockReturnValue(db);
    expect(words(await render())).toContain(` Start ${title} `);
    expect(await rows()).toBe(0);
  });
  it("shows Resume for a Topic begun before and chosen on the Course Map", async () => {
    getDbMock.mockReturnValue(db);
    await ensureTopicStarted(db, map, new Date(), OWNER_LEARNER_ID);
    expect(words(await render())).toContain(` Resume ${title} `);
  });
  it("logs the error and shows Open Study Workspace when progress can't be loaded", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("db down");
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await render()).toContain("Open Study Workspace");
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
  it("signed out, reads no Learner data and shows Sign in with the Explorable and its sign-in link", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("must not be called");
    });
    const out = renderToStaticMarkup(await LandingPage({}));
    expect(out).toContain("Sign in");
    expect(out).toContain(`>${TITLE}</h2>`);
    expect(out).toMatch(/<a[^>]*href="\/login"[^>]*>Sign in to learn why →<\/a>/);
  });

  // E4: signed in, section 2 says "Open this Topic →" and opens Spine Topic 1. An outline Topic with no file is only
  // coming, and /api/open cannot open it, so the form shows only once that Topic is written.
  const openTopicForm = (h: string) => doc(section(h, 1)).querySelector('form[action="/api/open"]');
  it("offers Open this Topic in section 2 when Spine Topic 1 has a Topic file, posting its id", async () => {
    getDbMock.mockReturnValue(db);
    loadMap.mockReturnValue({ ...map, topic: (id: string) => (id === HOME_TOPIC_ID ? map.topic("present-value") : map.topic(id)) });
    const form = openTopicForm(await render());
    expect(form?.querySelector<HTMLInputElement>('input[name="topic"]')?.value).toBe("spine-01-worth");
    expect(form?.textContent).toBe("Open this Topic →");
  });
  it("offers no Open this Topic while Spine Topic 1 has no Topic file, nor when the Course Map can't be read", async () => {
    getDbMock.mockReturnValue(db);
    expect(map.topic(HOME_TOPIC_ID)).toBeUndefined();
    const out = await render();
    expect(openTopicForm(out)).toBeNull();
    expect(words(section(out, 1))).not.toContain("Open this Topic");
    expect(words(section(out, 1))).not.toContain("Sign in to see what happened next");
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    loadMap.mockImplementationOnce(() => {
      throw new Error("bad outline");
    });
    expect(openTopicForm(renderToStaticMarkup(await LandingPage({ button: { kind: "open" } })))).toBeNull();
    expect(log).toHaveBeenCalledWith("Home could not read the Course Map for section 2's Topic", expect.any(Error));
    log.mockRestore();
  });
});

describe("homeTopicWritten (E4)", () => {
  it("is true only when the Course Map holds spine-01-worth as a written Topic, not as a coming one", () => {
    const written = presentValueOnly();
    expect(homeTopicWritten({ topic: (id) => (id === "spine-01-worth" ? written.topic("present-value") : undefined) })).toBe(true);
    expect(homeTopicWritten(written)).toBe(false);
  });
});
