import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Viewer } from "@/site/viewer";

// Every page of the public site (decision #7, Signal spec 7.2 to 7.6), drawn on the server for each viewer state. The
// database throws if anything touches it: a public page reads the viewer (mocked here) and the course files only.

const who = vi.hoisted(() => ({ viewer: { state: "visitor" } as Viewer }));
vi.mock("@/site/viewer", () => ({ siteViewer: async () => who.viewer }));
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
    expect(text).toContain("Is ₹25 crore over 30 years worth ₹25 crore?");
    expect(text).toContain("The Tutor picked this widget. Tested code draws it.");
    expect(html).toMatch(/data-widget="jackpot" data-case="kerala-bumper-2024"/);
    expect(html).toMatch(/data-widget="levers-story" data-case="amazon-2000"/); // the levers story stage (7.2.3)
    for (const slug of ["kerala-bumper-2024", "amazon-2000", "wework-2019", "rbi-repo-cut-2025", "compounding-1000"]) expect(html).toContain(`href="/examples/${slug}"`);
    expect(text).toContain("110 Topics wait inside.");
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
    expect(text).toContain("The valuations used as cases are published work by Aswath Damodaran and others, named and linked where they appear. Value It is not affiliated with them.");
    expect(text).toContain("Topics 110");
    expect(text).toContain("Do you track me?");
  });
});
