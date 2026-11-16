import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";
import { parseOutline, type Outline } from "@/course/outline";
import { EXAMPLES, EXAMPLE_SLUGS } from "@/site/examples";
import { PUBLIC_PAGES } from "@/site/routes";
import type { Viewer } from "@/site/viewer";

// Every page of the public site (decision #7, Signal spec 7.2 to 7.6), drawn on the server for each viewer state. The
// database throws if anything touches it: a public page reads the viewer (mocked here) and the course files only.

const who = vi.hoisted(() => ({ viewer: { state: "visitor" } as Viewer }));
vi.mock("@/site/viewer", () => ({ siteViewer: async () => who.viewer }));
// The course the pages read: the real one, or a changed outline (the counts test below swaps it in).
const course = vi.hoisted(() => ({ outline: undefined as Outline | undefined }));
vi.mock("@/site/stats", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/site/stats")>();
  return { ...real, courseStats: () => (course.outline ? real.courseFacts(course.outline, real.writtenTopicIds()) : real.courseStats()) };
});
vi.mock("@/db/client", () => ({
  getDb: () => {
    throw new Error("a public page read the database");
  },
}));

const { default: HomePage, metadata: homeMeta } = await import("./page");
const { default: HowItWorksPage, metadata: howMeta } = await import("./how-it-works/page");
const { default: ExamplesPage, metadata: examplesMeta } = await import("./examples/page");
const casePage = await import("./examples/[slug]/page");
const { default: AboutPage, metadata: aboutMeta } = await import("./about/page");
const { default: PrivacyPage, metadata: privacyMeta } = await import("./privacy/page");
const { default: TermsPage, metadata: termsMeta } = await import("./terms/page");
const { SiteFooter } = await import("./site-chrome");

const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ");
const h1 = (html: string) => words(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "").trim();
/** Home's hero, up to the next section: the demo's widget is a section of its own, so the hero's own close is not the first. */
const heroOf = (html: string) => /data-site-section="hero"[\s\S]*?(?=data-site-section=")/.exec(html)![0];
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

const member: Viewer = { state: "member", button: { kind: "resume", topic: "Why is money later worth less?" }, name: "Asha" };

beforeEach(() => {
  who.viewer = { state: "visitor" };
  course.outline = undefined;
});

describe("the public pages", () => {
  it("each have one focusable page h1", async () => {
    const pages = [await HomePage(), await HowItWorksPage(), await ExamplesPage(), await casePage.default(params("amazon-2000")), await AboutPage()];
    const titles = pages.map((page) => renderToStaticMarkup(page)).map((html) => {
      expect(html.match(/<h1/g), "one h1").toHaveLength(1);
      expect(html).toMatch(/<h1 class="page-h1[^"]*" tabindex="-1"/);
      return h1(html);
    });
    expect(titles).toEqual(["What is it really worth?", "How a Topic works", "Real events. Move the numbers.", "Is $84 a fair price for Amazon?", "About Value It"]);
  });

  it("are titled for the template %s · Value It", async () => {
    expect([howMeta.title, examplesMeta.title, aboutMeta.title]).toEqual(["How it works", "Examples", "About"]);
    expect((await casePage.generateMetadata(params("wework-2019"))).title).toBe("WeWork boasted of $3 billion of run-rate revenue. Is that what it earned?");
  });

  // Issue #69: every page's metadata comes from the one helper, so each names its own canonical link and share title.
  it("each link their own canonical address and share title", async () => {
    const wework = await casePage.generateMetadata(params("wework-2019"));
    const metas = [homeMeta, howMeta, examplesMeta, wework, aboutMeta];
    expect(metas.map((m) => m.alternates?.canonical)).toEqual(["/", "/how-it-works", "/examples", "/examples/wework-2019", "/about"]);
    expect(metas.map((m) => (m.openGraph as { title?: string }).title)).toEqual([
      "Value It: Learn what things are worth.",
      "How it works · Value It",
      "Examples · Value It",
      "WeWork boasted of $3 billion of run-rate revenue. Is that what it earned? · Value It",
      "About · Value It",
    ]);
    expect(homeMeta.title).toBeUndefined(); // Home keeps the site's own title
  });
});

describe("Home", () => {
  it("shows the jackpot conversation complete, the five questions and the course count", async () => {
    const html = renderToStaticMarkup(await HomePage());
    const text = words(html);
    expect(text).toContain("Is ₹25 crore over 30 years worth ₹25 crore?");
    expect(text).toContain("The AI Tutor picked this Example. Checked numbers draw it.");
    expect(html).toMatch(/data-widget="jackpot" data-case="kerala-bumper-2024"/);
    expect(html).toMatch(/data-widget="levers-story" data-case="amazon-2000"/); // the levers story stage (7.2.3)
    for (const slug of ["kerala-bumper-2024", "amazon-2000", "wework-2019", "rbi-repo-cut-2025", "compounding-1000"]) expect(html).toContain(`href="/examples/${slug}"`);
    expect(text).toContain("18 Topics, in order, teach valuation.");
    expect(text).toContain("It is the only lever that reaches the $84 price by itself, at 17.5%.");
  });

  // Spec #68, ticket #73: the first screen speaks to a beginner, with headline numbers they have seen.
  it("opens on a hero for beginners: What is it really worth?, three headline numbers, the Tutor and no sums", async () => {
    const html = renderToStaticMarkup(await HomePage());
    const hero = words(heroOf(html));
    expect(hero).toContain("Finance for beginners");
    for (const number of ["₹25 crore jackpot", "$3 billion “run rate”", "Amazon at $84 a share"]) expect(hero).toContain(number);
    expect(hero).toContain("An AI Tutor explains every money word");
    expect(hero).toContain("No sums");
  });

  it("reads the hero h1 to a screen reader as words with spaces", async () => {
    const html = renderToStaticMarkup(await HomePage());
    // Tags dropped with nothing in their place, as an accessible name joins inline text.
    const spoken = (/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    expect(spoken).toBe("What is it really worth?");
  });

  it("offers a visitor Try the jackpot first, then Join the waitlist, with the waitlist note", async () => {
    const html = renderToStaticMarkup(await HomePage());
    // The demo comes before the lede and the buttons in the page's order (F36), so read the links of the copy after it.
    const hero = heroOf(html).split('class="v-hero-copy"')[1];
    const links = [...hero.matchAll(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [words(m[2]).trim(), m[1]]);
    expect(links.slice(0, 2)).toEqual([
      ["Try the jackpot", "/examples/kerala-bumper-2024"],
      ["Join the waitlist", "/join"],
    ]);
    expect(words(html)).toContain("Free. We let people in by hand and email you when you’re in.");
  });

  it("keeps the hero's jackpot figure the jackpot Example's own", async () => {
    const { EXAMPLES } = await import("@/site/examples");
    const { home } = await import("@/site/copy");
    const chip = EXAMPLES.find((e) => e.widget === "jackpot")!.chip; // "A ₹25 crore jackpot"
    expect(home.hero.lede).toContain(chip.replace(/^A /, ""));
  });

  // QA rows 22 and 23 as #33 has them: Clerk owns sign-up, so the closing block has no email form of its own, and every
  // Join opens /join, Clerk's Waitlist.
  it("sends a visitor's Join the waitlist to /join, and the closing block has no email form", async () => {
    const html = renderToStaticMarkup(await HomePage());
    const joins = [...html.matchAll(/<a [^>]*data-join=""[^>]*>/g)].map((m) => /href="([^"]+)"/.exec(m[0])?.[1]);
    expect(joins).toEqual(["/join", "/join"]); // the hero and the closing block
    const closing = /data-site-section="closing"[\s\S]*$/.exec(html)![0];
    expect(closing).not.toMatch(/<input|<form/);
    expect(words(closing)).toContain("1 Request received 2 Reviewed by hand 3 Email: you’re in");
    for (const page of [await AboutPage(), await casePage.default(params("wework-2019"))]) {
      expect([...renderToStaticMarkup(page).matchAll(/<a [^>]*data-join=""[^>]*>/g)].map((m) => /href="([^"]+)"/.exec(m[0])?.[1])).toEqual(["/join"]);
    }
  });

  it("offers a member Continue with their Topic and the Course map, and no Join", async () => {
    who.viewer = member;
    const html = renderToStaticMarkup(await HomePage());
    expect(words(html)).toContain("Continue Why is money later worth less?");
    expect(html).toContain('action="/api/open"');
    expect(html).toContain('href="/course"');
    expect(words(html)).not.toContain("Join the waitlist");
  });
});

describe("a case page", () => {
  it("mounts its own widget and links the cases around it", async () => {
    const html = renderToStaticMarkup(await casePage.default(params("rbi-repo-cut-2025")));
    expect(html).toMatch(/data-widget="rates" data-case="rbi-repo-cut-2025"/);
    expect(html).toContain('href="/examples/wework-2019"');
    expect(html).toContain('href="/examples/compounding-1000"');
    expect(words(html)).toContain("Make your call first. This step shows the rule the Topic leaves you with.");
    expect(words(html)).toContain("Join to take the full Topic");
  });

  it("lets a member open its Topic", async () => {
    who.viewer = member;
    const html = renderToStaticMarkup(await casePage.default(params("amazon-2000")));
    expect(html).toContain('<input type="hidden" name="topic" value="spine-01-worth"/>');
    expect(words(html)).toContain("Open this Topic");
  });

  it("lists exactly the five slugs for prerendering, and 404s any other", async () => {
    expect(casePage.dynamicParams).toBe(false);
    expect(casePage.generateStaticParams().map((p) => p.slug)).toEqual(["kerala-bumper-2024", "amazon-2000", "wework-2019", "rbi-repo-cut-2025", "compounding-1000"]);
    await expect(casePage.default(params("nope"))).rejects.toThrow();
  });
});

describe("About", () => {
  it("says the valuations are Damodaran's published work and that Value It is not affiliated", async () => {
    const text = words(renderToStaticMarkup(await AboutPage()));
    expect(text).toContain("The valuations used as Cases are published work by Aswath Damodaran and others, named and linked where they appear. Value It is not affiliated with them.");
    expect(text).toContain("Topics 113");
    expect(text).toContain("Do you track me?");
  });

  // ADR 0019 (#79): the FAQ names the theme cookie the sun/moon switch sets.
  it("names the theme cookie in the FAQ", async () => {
    const text = words(renderToStaticMarkup(await AboutPage()));
    expect(text).toContain("a cookie called theme remembers Light or Dark");
    });

  // #75: no placeholder founder's note, no "coming soon", and the one Source About names is a link.
  it("has no founder section and nothing 'coming soon'", async () => {
    const html = renderToStaticMarkup(await AboutPage());
    expect(words(html)).not.toMatch(/founder|coming soon/i);
  });

  it("links Damodaran, the one Source it names", async () => {
    const html = renderToStaticMarkup(await AboutPage());
    expect(html).toMatch(/<a [^>]*href="https:\/\/pages\.stern\.nyu\.edu\/~adamodar\/"[^>]*>Aswath Damodaran<\/a>/);
  });

  it("shows no minutes per Topic until they are measured", async () => {
    expect(words(renderToStaticMarkup(await AboutPage()))).not.toMatch(/Each Topic \d/);
  });

  // #72/#75 (F15): the outline's minutes are guesses, so no public page or its description shows a length.
  it("no public page shows minutes, since none are measured", async () => {
    for (const page of [await HomePage(), await HowItWorksPage(), await ExamplesPage(), await AboutPage()]) {
      expect(words(renderToStaticMarkup(page))).not.toMatch(/\bminutes?\b|\d+ min\b/i);
    }
    expect(String(howMeta.description)).not.toMatch(/minute/i);
  });
});

// #74 (F31, L22): Home writes dollars one way, in words ("$3 billion", "$39 billion"), as the Examples do: never "$39bn"
// beside "$3 billion".
describe("Home's money", () => {
  it("writes every dollar amount in one style, in words", async () => {
    const text = words(renderToStaticMarkup(await HomePage()));
    expect(text).toContain("$3 billion");
    expect(text).toContain("Sales in year 10: $39 billion");
    expect(text).toContain("$39 billion Revenue in year 10");
    expect(text).not.toMatch(/\$[\d.,]+\s?(bn|B|M|m|tn)\b/);
  });
});

// #75: Home's "Where you end up" shows a real one-page note: the one the Assignment saves to the Notebook after the
// Spine (F14: the Spine no longer saves a Valuation story, so Home must not show one).
describe("Where you end up", () => {
  it("shows an Own Case note from the Assignment under 'By the end, you value a company yourself.'", async () => {
    const html = renderToStaticMarkup(await HomePage());
    const section = /<section[^>]*data-site-section="end"[\s\S]*?<\/section>/.exec(html)?.[0] ?? "";
    const text = words(section).replaceAll("&#x27;", "'");
    expect(text).toContain("Where you end up");
    expect(text).toContain("By the end, you value a company yourself.");
    expect(text).toContain("you pick a listed company and copy a few figures from its annual report");
    for (const line of ["Kikkoman, Japan. Annual report of 19 Jun 2026.", "My Estimate: growth 10% a year", "The engine's value: ¥1,187 a share, beside a price of ¥1,540 on 19 Jun 2026."]) {
      expect(text).toContain(line);
    }
    expect(text).not.toMatch(/Valuation story|Story you told/);
  });
});

// Issue #77: a privacy page and terms before a Visitor gives their email, a contact address they can copy, and a true
// answer to "Do you track me?" that names every cookie the site sets.
describe("Privacy, Terms and the contact address", () => {
  it("are two public pages with one h1 each, titled and linked for the template", async () => {
    const pages = [await PrivacyPage(), await TermsPage()].map((page) => renderToStaticMarkup(page));
    expect(pages.map((html) => html.match(/<h1/g)?.length)).toEqual([1, 1]);
    expect(pages.map(h1)).toEqual(["Privacy", "Terms"]);
    expect([privacyMeta.title, termsMeta.title]).toEqual(["Privacy", "Terms"]);
    expect([privacyMeta, termsMeta].map((m) => m.alternates?.canonical)).toEqual(["/privacy", "/terms"]);
    for (const html of pages) expect(words(html)).toContain("hello@value-it.xyz");
    // Public signed out, sent no-store like the other site pages, and listed for search engines (the sitemap, #70).
    for (const path of ["/privacy", "/terms"]) expect(PUBLIC_PAGES.find((p) => p.path === path), path).toEqual({ path, site: true, sitemap: true });
  });

  it("the privacy page says what is kept, by whom, and the cookies", async () => {
    const text = words(renderToStaticMarkup(await PrivacyPage()));
    for (const name of ["Clerk", "Neon", "Vercel Web Analytics", "OpenAI", "Voyage AI", "__session", "__client_uat", "split", "sets no cookie"]) {
      expect(text, name).toContain(name);
    }
    // F32: Clerk's suffixed copies are named, and "for that" follows the sign-in sentence it refers to.
    expect(text).toContain("__session_Ab12");
    expect(text).toMatch(/to know whether you’re signed in\. A private copy that signs in with a passcode instead of Clerk uses fa_access for that\./);
  });

  it("the footer links Privacy and Terms and shows the contact address as text, for every viewer", () => {
    for (const viewer of [{ state: "visitor" }, member] as Viewer[]) {
      const html = renderToStaticMarkup(<SiteFooter viewer={viewer} />);
      expect(html).toMatch(/<a [^>]*href="\/privacy"[^>]*>Privacy<\/a>/);
      expect(html).toMatch(/<a [^>]*href="\/terms"[^>]*>Terms<\/a>/);
      expect(html).toMatch(/>hello@value-it\.xyz</);
    }
  });

  it("the FAQ's \"Do you track me?\" names every cookie the site sets, and says Analytics sets none", async () => {
    const { FAQ } = await import("@/site/copy");
    const answer = FAQ.find((f) => f.q === "Do you track me?")!.a;
    // Every cookie name the code defines (src/**: `export const X_COOKIE = "name"`), less the test bed's own, plus
    // Clerk's sign-in cookies on the site and on its own address (clerk.value-it.xyz).
    const defined = siteCookies();
    expect(defined).toEqual(expect.arrayContaining(["split", "fa_access"]));
    for (const name of [...defined, "__session", "__client_uat", "__client"]) expect(answer, name).toMatch(new RegExp(`\\b${name}\\b`));
    expect(answer).toContain("Vercel Web Analytics");
    expect(answer).toContain("It sets no cookie.");
  });
});

/** The cookies the app's code names (`export const X_COOKIE = "name"` anywhere under src), the test bed's excepted. */
function siteCookies(): string[] {
  const names: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
        for (const m of readFileSync(path, "utf8").matchAll(/export const (\w+)_COOKIE = "([^"]+)"/g)) {
          if (!m[1].startsWith("E2E")) names.push(m[2]);
        }
      }
    }
  };
  walk(join(process.cwd(), "src"));
  return names.sort();
}

// #72: every count and Spine title on Home, About, How it works and Examples comes from the course outline.
describe("the course counts", () => {
  it("read the Spine's length from the outline: 18 Topics with #90's statements Topic fourth, #91's cost of capital ninth and #93's annual report Topic last", async () => {
    const home = words(renderToStaticMarkup(await HomePage()));
    expect(home).toContain("18 Topics, in order, teach valuation. 72 more go wider across 9 subjects, and 23 read real arguments.");
    expect(home).toContain("One real event. Four moves.");
    expect(home).toContain("Five Examples, open now");

    const how = words(renderToStaticMarkup(await HowItWorksPage()));
    expect(how).toContain("taught in four moves .");
    expect(how).toContain("18 core Topics 01 What is a business worth? Price against value, and the four levers 02 Why is money later worth less?");
    expect(how).toContain("04 What do the three financial statements show?");
    expect(how).toContain("09 What does all of a company's money cost?");
    expect(how).toContain("17 Judge a published valuation, as of a past date");
    expect(how).toContain("18 Where are a valuation's numbers in an annual report?");
    expect(how).toContain("9 subjects Numbers & time value 6 Financial statements 11 Economics & policy 11 Bonds & credit 7 Currencies & countries 4 Markets & investing 9 Valuation & corporate finance 12 Derivatives 5 Banks, crises & the system 7");
    expect(how).toContain("3 stages that read real arguments Follow , understand what a writer argues 9 Judge , spot where an argument is weak 8 Analyse , reach your own view from the numbers 6");
    expect(howMeta.description).toBe("Every Topic is one real event, taught in four moves.");

    const about = words(renderToStaticMarkup(await AboutPage()));
    expect(about).toContain("Topics 113 Subjects 9 Stages that read real arguments 3 Price Free in early access");
    expect(about).toContain("Eighteen core Topics teach valuation in order. Nine subjects go wider, and three stages read real arguments.");
    expect(about).toContain("Derivatives · 5");
    expect(about).toContain("Judge · 8");

    const examples = words(renderToStaticMarkup(await ExamplesPage()));
    expect(examples).toContain("Five Examples from the course, playable here.");
    expect(examples).toContain("18 Topics, in order, teach valuation. 72 more go wider across 9 subjects, and 23 read real arguments.");
    expect(examplesMeta.description).toBe("Five Examples from the course, playable here.");
  });

  it("change on every page when the Spine changes in the course", async () => {
    // The outline with its last four Spine Topics (from 15 to #93's annual report Topic) dropped, Spine Topic 3 retitled, and one
    // Derivatives Elective moved to Judge.
    const raw = parse(readFileSync(join(process.cwd(), "course", "outline.yaml"), "utf8")) as { topics: Record<string, unknown>[] };
    const topics = raw.topics.filter((t) => !(typeof t.spine === "number" && t.spine >= 15));
    topics.find((t) => t.spine === 3)!.title = "Cash, the first statement";
    const moved = topics.find((t) => t.subject === "Derivatives")!;
    moved.stage = "judge";
    delete moved.subject;
    const { outline, errors } = parseOutline(stringify({ topics }));
    expect(errors).toEqual([]);
    course.outline = outline;

    const home = words(renderToStaticMarkup(await HomePage()));
    expect(home).toContain("14 Topics, in order, teach valuation. 71 more go wider across 9 subjects, and 24 read real arguments.");

    const how = words(renderToStaticMarkup(await HowItWorksPage()));
    expect(how).toContain("14 core Topics 01 What is a business worth?");
    expect(how).toContain("03 Cash, the first statement");
    expect(how).not.toContain("Judge a published valuation");
    expect(how).toContain("Derivatives 4");
    expect(how).toContain("Judge , spot where an argument is weak 9");

    const about = words(renderToStaticMarkup(await AboutPage()));
    expect(about).not.toContain("Each Topic"); // #75: no minutes until measured
    expect(about).toContain("Fourteen core Topics teach valuation in order.");
    expect(about).toContain("Derivatives · 4");
    expect(about).toContain("Judge · 9");

    const examples = words(renderToStaticMarkup(await ExamplesPage()));
    expect(examples).toContain("14 Topics, in order, teach valuation. 71 more go wider across 9 subjects, and 24 read real arguments.");
  });
});

// Spec #68 (ticket #97): Home, About and How it works say what the Course Map labels: Topics not written ahead are taught
// live by the AI Tutor, and stay open.
describe("Topics taught live by the AI Tutor", () => {
  it("are named in the same words on Home, How it works and About", async () => {
    const line = "Topics not written ahead yet are taught live by the AI Tutor. You can open any of them.";
    for (const page of [await HomePage(), await HowItWorksPage(), await AboutPage()]) expect(words(renderToStaticMarkup(page))).toContain(line);
  });
});

// #74: Home's body in plain words. The glossary's words on screen: an Example is never a "case", a Story is a claim to
// judge (never "your story"), and Damodaran is named only in a linked source line (and the About credit).
describe("the plain words", () => {
  const SOURCE_LINE = /<(p|span)[^>]*data-source-line[^>]*>[\s\S]*?<\/\1>/g;
  const publicPages = async () => [
    ["Home", await HomePage()],
    ["How it works", await HowItWorksPage()],
    ["Examples", await ExamplesPage()],
    ...(await Promise.all(EXAMPLE_SLUGS.map(async (slug) => [slug, await casePage.default(params(slug))] as const))),
    ["About", await AboutPage()],
    ["Privacy", await PrivacyPage()],
    ["Terms", await TermsPage()],
  ] as const;

  it("no page says 'your story' or calls an Example a case", async () => {
    for (const [name, page] of await publicPages()) {
      const text = words(renderToStaticMarkup(page));
      expect(text, name).not.toMatch(/your story/i);
      expect(text, name).not.toMatch(/\bcases?\b/); // a course Case keeps its capital
      expect(text, name).not.toMatch(/\bcheap/i); // voice rule 7 (F32)
    }
  });

  it("Home and How it works name Damodaran only in a linked source line", async () => {
    for (const page of [await HomePage(), await HowItWorksPage()]) {
      const html = renderToStaticMarkup(page);
      expect(words(html.replace(SOURCE_LINE, " "))).not.toContain("Damodaran");
      const lines = (html.match(SOURCE_LINE) ?? []).filter((line) => line.includes("Damodaran"));
      expect(lines.length).toBeGreaterThan(0);
      // F30: every line that names him links his work, the widgets' own source lines included.
      for (const line of lines) expect(line).toMatch(/<a [^>]*href="https:\/\/[^"]*"[^>]*>[^<]*Damodaran/);
    }
  });

  // F30: Home's trust column quotes a source line a live widget really shows (the Mega Millions one went with its Example).
  it("Home's trust column quotes the jackpot widget's own source line", async () => {
    const home = words(renderToStaticMarkup(await HomePage()));
    const quoted = /The jackpot’s says “([^”]+)”/.exec(home)?.[1];
    expect(quoted).toBe("Source: The Hindu, 9 Oct 2024.");
    const jackpot = EXAMPLES.find((e) => e.widget === "jackpot")!;
    const lines = renderToStaticMarkup(await casePage.default(params(jackpot.slug))).match(SOURCE_LINE) ?? [];
    expect(lines.some((line) => words(line).replace(/\s+([.,])/g, "$1").includes(quoted!))).toBe(true);
  });

  // #74/#72 (F34): Home keeps to its four product words in the FAQ it picks, and How it works' closing names the first
  // Spine Topic from the course.
  it("Home's FAQ says no 'Assignment' or 'Spine'; About's full FAQ keeps them", async () => {
    const home = words(/<div class="v-faq">[\s\S]*?<\/div>/.exec(renderToStaticMarkup(await HomePage()))![0]);
    expect(home).toContain("Do I need to be good at maths?");
    expect(home).not.toMatch(/Assignment|Spine/);
    expect(words(renderToStaticMarkup(await AboutPage()))).toContain("the Assignment after the Spine");
  });

  it("How it works' closing names the first Spine Topic as the course titles it", async () => {
    const how = words(renderToStaticMarkup(await HowItWorksPage()));
    expect(how).toContain("Start with Topic 1: What is a business worth?");
    expect(how).not.toContain("Start with Topic 1: What is a business worth? Price");
  });

  // #75 (F30): every named Source is a link. A widget's source line that names a Source links it; only a line that names
  // none ("No outside figures") is plain text.
  it("every source line on a public page links the Source it names", async () => {
    let seen = 0;
    for (const [name, page] of await publicPages()) {
      for (const line of renderToStaticMarkup(page).match(SOURCE_LINE) ?? []) {
        seen++;
        if (/No outside figures/.test(line)) continue;
        expect(line, name).toMatch(/<a [^>]*href="https:\/\//);
      }
    }
    expect(seen).toBeGreaterThan(3);
  });

  it("ends the levers story on judging the $84 price, not on a story of your own", async () => {
    const html = renderToStaticMarkup(await HomePage());
    const last = words(/<article[^>]*data-step="5"[\s\S]*?<\/article>/.exec(html)![0]);
    expect(last).toContain("What did the $84 price need?");
    expect(words(/<article[^>]*data-step="5"[\s\S]*?<p class="v-story">([\s\S]*?)<\/p>/.exec(html)![1]).trim()).toMatch(/Would you have believed it in 2000\?$/);
  });

  it("draws the colour language on How it works, not on Home, and says tested code once on Home", async () => {
    const home = renderToStaticMarkup(await HomePage());
    expect(home).not.toContain('data-site-section="colours"');
    expect(words(home).match(/tested code/gi)).toHaveLength(1);
    const how = renderToStaticMarkup(await HowItWorksPage());
    expect(how).toContain('data-site-section="colours"');
    expect(words(how)).toContain("Every colour means one thing.");
  });

  it("gives no Example a stamp that repeats its category", () => {
    for (const example of EXAMPLES) expect(example.stamp.toLowerCase(), example.slug).not.toBe(example.category.toLowerCase());
  });
});
