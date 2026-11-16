import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";
import { parseOutline, type Outline } from "@/course/outline";
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

const { default: HomePage } = await import("./page");
const { default: HowItWorksPage, metadata: howMeta } = await import("./how-it-works/page");
const { default: ExamplesPage, metadata: examplesMeta } = await import("./examples/page");
const casePage = await import("./examples/[slug]/page");
const { default: AboutPage, metadata: aboutMeta } = await import("./about/page");

const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ");
const h1 = (html: string) => words(/<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? "").trim();
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
    expect(titles).toEqual(["Learn what things are worth.", "How a Topic works", "Real events. Move the numbers.", "Is $84 a fair price for Amazon?", "About Value It"]);
  });

  it("are titled for the template %s · Value It", async () => {
    expect([howMeta.title, examplesMeta.title, aboutMeta.title]).toEqual(["How it works", "Examples", "About"]);
    expect((await casePage.generateMetadata(params("wework-2019"))).title).toBe("WeWork boasted of $3 billion of run-rate revenue. Is that what it earned?");
  });
});

describe("Home", () => {
  it("shows the jackpot conversation complete, the five questions and the course count", async () => {
    const html = renderToStaticMarkup(await HomePage());
    const text = words(html);
    expect(text).toContain("Is a $1.537B jackpot really worth $1.537B?");
    expect(text).toContain("The Tutor picked this widget. Tested code draws it.");
    expect(html).toMatch(/data-widget="jackpot" data-case="mega-millions-2018"/);
    expect(html).toMatch(/data-widget="levers-story" data-case="amazon-2000"/); // the levers story stage (7.2.3)
    for (const slug of ["mega-millions-2018", "amazon-2000", "wework-2019", "rates-up-1", "compounding-1000"]) expect(html).toContain(`href="/examples/${slug}"`);
    expect(text).toContain("112 Topics wait inside.");
    expect(text).toContain("It is the only lever that reaches the $84 price by itself, at 17.5%.");
  });

  it("offers a visitor Join early access and Play a real case, with the early-access note", async () => {
    const text = words(renderToStaticMarkup(await HomePage()));
    expect(text).toContain("Join early access");
    expect(text).toContain("Play a real case");
    expect(text).toContain("Free during early access. We let people in by hand and email you when you’re in.");
  });

  // QA rows 22 and 23 as #33 has them: Clerk owns sign-up, so the closing block has no email form of its own, and every
  // Join opens /join, Clerk's Waitlist.
  it("sends a visitor's Join early access to /join, and the closing block has no email form", async () => {
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
    expect(words(html)).not.toContain("Join early access");
  });
});

describe("a case page", () => {
  it("mounts its own widget and links the cases around it", async () => {
    const html = renderToStaticMarkup(await casePage.default(params("rates-up-1")));
    expect(html).toMatch(/data-widget="rates" data-case="rates-up-1"/);
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
    expect(casePage.generateStaticParams().map((p) => p.slug)).toEqual(["mega-millions-2018", "amazon-2000", "wework-2019", "rates-up-1", "compounding-1000"]);
    await expect(casePage.default(params("nope"))).rejects.toThrow();
  });
});

describe("About", () => {
  it("says the valuations are Damodaran's published work and that Value It is not affiliated", async () => {
    const text = words(renderToStaticMarkup(await AboutPage()));
    expect(text).toContain("The valuations used as cases are published work by Aswath Damodaran and others, named and linked where they appear. Value It is not affiliated with them.");
    expect(text).toContain("Topics 112");
    expect(text).toContain("Do you track me?");
  });
});

// #72: every count and Spine title on Home, About, How it works and Examples comes from the course outline.
describe("the course counts", () => {
  it("read the Spine's length from the outline: 17 Topics on this branch (#91's split and #93), ending on the annual report Topic", async () => {
    const home = words(renderToStaticMarkup(await HomePage()));
    expect(home).toContain("112 Topics wait inside. 17 teach valuation in order, 72 go wider across 9 subjects, and 23 read real arguments.");
    expect(home).toContain("112 Topics 10 to 15 minutes each No sums to type");
    expect(home).toContain("One real event. Four moves. Ten to fifteen minutes.");
    expect(home).toContain("Five cases, open now");

    const how = words(renderToStaticMarkup(await HowItWorksPage()));
    expect(how).toContain("taught in four moves , in 10–15 minutes.");
    expect(how).toContain("17 core Topics 01 What is a business worth? Price against value, and the four levers 10 min 02 Why is money later worth less? 12 min");
    expect(how).toContain("16 Value one yourself, as of a past date 15 min");
    expect(how).toContain("17 Where are a valuation's numbers in an annual report? 13 min");
    expect(how).toContain("9 subjects Numbers & time value 6 Financial statements 11 Economics & policy 11 Bonds & credit 7 Currencies & countries 4 Markets & investing 9 Valuation & corporate finance 12 Derivatives 5 Banks, crises & the system 7");
    expect(how).toContain("3 stages that read real arguments Follow , understand what a writer argues 9 Judge , spot where an argument is weak 8 Analyse , reach your own view from the numbers 6");
    expect(howMeta.description).toBe("Every Topic is one real event, taught in four moves, in 10 to 15 minutes.");

    const about = words(renderToStaticMarkup(await AboutPage()));
    expect(about).toContain("Topics 112 Subjects 9 Stages that read real arguments 3 Each Topic 10–15 min");
    expect(about).toContain("Seventeen core Topics teach valuation in order. Nine subjects go wider, and three stages read real arguments.");
    expect(about).toContain("Derivatives · 5");
    expect(about).toContain("Judge · 8");

    const examples = words(renderToStaticMarkup(await ExamplesPage()));
    expect(examples).toContain("Five cases from the course, playable here.");
    expect(examples).toContain("112 Topics wait inside. 17 teach valuation in order, 72 go wider across 9 subjects, and 23 read real arguments.");
    expect(examplesMeta.description).toBe("Five cases from the course, playable here.");
  });

  it("change on every page when the Spine changes in the course", async () => {
    // The outline with its last three Spine Topics (from 15 to #93's annual report Topic) dropped, Spine Topic 3 retitled, and one
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
    expect(home).toContain("14 teach valuation in order, 71 go wider across 9 subjects, and 24 read real arguments.");
    expect(home).toContain("10 to 14 minutes each");
    expect(home).toContain("Ten to fourteen minutes.");

    const how = words(renderToStaticMarkup(await HowItWorksPage()));
    expect(how).toContain("14 core Topics 01 What is a business worth?");
    expect(how).toContain("03 Cash, the first statement 12 min");
    expect(how).not.toContain("Value one yourself");
    expect(how).toContain("Derivatives 4");
    expect(how).toContain("Judge , spot where an argument is weak 9");
    expect(how).toContain("in 10–14 minutes.");

    const about = words(renderToStaticMarkup(await AboutPage()));
    expect(about).toContain("Each Topic 10–14 min");
    expect(about).toContain("Fourteen core Topics teach valuation in order.");
    expect(about).toContain("Derivatives · 4");
    expect(about).toContain("Judge · 9");

    const examples = words(renderToStaticMarkup(await ExamplesPage()));
    expect(examples).toContain("14 teach valuation in order, 71 go wider across 9 subjects, and 24 read real arguments.");
  });
});
