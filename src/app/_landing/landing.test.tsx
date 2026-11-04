import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { learnerState, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureTopicStarted } from "@/learner/memory";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { stringify } from "yaml";
import { loadCourseMap, parseCourseMap, type Topic } from "@/course/map";
import type { Progress, TopicProgress } from "@/course/navigator";
import { copy } from "./copy";

const getDbMock = vi.hoisted(() => vi.fn());
const loadMap = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({ getDb: getDbMock }));
vi.mock("@/course/map", async (orig) => {
  const real = await orig<typeof import("@/course/map")>();
  loadMap.mockImplementation(real.loadCourseMap);
  return { ...real, loadCourseMap: loadMap };
});
vi.mock("./stats", () => ({ landingStats: async () => ({ topics: 1, cases: 1, librarySources: 1 }) }));
// The owner is signed in (signing in itself is tested in src/auth/sign-in.test.ts).
vi.mock("@/auth/session", () => ({ currentLearnerId: async () => 1, isSignedIn: async () => true }));
// Home's Widget reads its Case Data through its own day-long cache; its server read is tested in home-widget.test.ts.
vi.mock("./home-widget-data", async (orig) => ({ ...(await orig<typeof import("./home-widget-data")>()), homeWidget: async () => null }));
const { LandingPage, LandingView, homeButton, loadHomeButton } = await import("./landing");
const { homeWidgetCode } = await import("./home-widget-data");
type HomeButton = import("./landing").HomeButton;

const html = renderToStaticMarkup(<LandingView stats={{ topics: 95, cases: 103, librarySources: 8 }} />);
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Home", () => {
  it("shows the two-line headline", () => {
    expect(html).toMatch(/<h1[^>]*>Learn finance from<br\/><span[^>]*>what already happened\.<\/span><\/h1>/);
  });

  it("lists the seven Teaching Steps in order", () => {
    const names = ["Story", "Concept", "Explore", "Your turn", "Check", "Reveal", "Principle"];
    const positions = names.map((n) => html.indexOf(`>${n}</h3>`));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("shows the counts it is given as one stats line", () => {
    expect(text).toContain("95 Topics · 103 historical cases · 8 sources");
  });

  it("shows no Draft badge", () => {
    expect(text).not.toContain("Draft");
  });

  it("offers Start learning in the hero and again after Every number has a source, both to the passcode page", () => {
    const buttons = [...html.matchAll(/<a[^>]*href="\/login"[^>]*>Start learning<\/a>/g)].map((m) => m.index);
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toBeLessThan(html.indexOf('id="how"'));
    expect(buttons[1]).toBeGreaterThan(html.indexOf("Every number has a source"));
  });

  it("words Explore and Your turn as two different steps", () => {
    const line = (name: string) => copy.how.steps.find((s) => s.name === name)!.line;
    expect(line("Explore")).toMatch(/Widget/);
    expect(line("Explore")).not.toMatch(/work the numbers/i);
    expect(line("Your turn")).toMatch(/question/);
    expect(line("Your turn")).not.toMatch(/before/);
  });

  it("says Topic, never lesson, in the Principle line", () => {
    const principle = copy.how.steps.find((s) => s.name === "Principle")!.line;
    expect(principle).toContain("Topic");
    expect(text.toLowerCase()).not.toContain("lesson");
  });

  it("links Sign in to the login and How it works to its section", () => {
    expect(html).toContain('href="/login"');
    expect(html).toContain('href="#how"');
    expect(html).toContain('id="how"');
  });

  it("shows no Learner or Library text, only its own copy and counts", () => {
    for (const word of ["Session", "Continue", "Ask the Tutor", "Past Sessions", "Progress"]) {
      expect(text).not.toContain(word);
    }
    expect(text).toContain(copy.footer);
  });

  it("offers no Sign out when signed out", () => {
    const html = renderToStaticMarkup(<LandingView stats={{ topics: 2, cases: 1, librarySources: 1 }} />);
    expect(html).not.toContain("Sign out");
    expect(html).not.toContain("/api/logout");
  });

  it("shows no screenshot of the workspace", () => {
    expect(html).not.toContain("<img");
    expect(html).not.toContain("landing-assets");
  });
});

// Seam 2: Home's live annuity Widget (spec #119, "Widgets › Home's copy"), the very Widget Present value opens,
// drawn as it is before the Insight, with one Guided Task and a way to sign in.
describe("Home's live annuity Widget, signed out", () => {
  const widget = { code: homeWidgetCode(loadCourseMap())!, cases: [] };
  const out = renderToStaticMarkup(<LandingView stats={{ topics: 95, cases: 103, librarySources: 8 }} widget={widget} />);
  const words = out.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const tasks = [...out.matchAll(/<li[^>]*data-state="[^"]*"[^>]*>(?:(?!<\/li>).)*<\/li>/g)].map((m) => m[0].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());

  it("is Present value's annuity Widget, with its rate slider", () => {
    expect(out).toContain(">What the annuity is worth today</h3>");
    expect(out).toContain('aria-label="Interest rate (discount rate)"');
  });

  it("has exactly one Guided Task: Drag to 0%, and why it matches the advertised jackpot", () => {
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toContain("Drag to 0%. Why does it match the advertised jackpot?");
  });

  it("offers Sign in to learn why → under the Widget, to the passcode page", () => {
    expect(out).toMatch(/<a[^>]*href="\/login"[^>]*>Sign in to learn why →<\/a>/);
    expect(out.indexOf("Sign in to learn why")).toBeGreaterThan(out.indexOf("Drag to 0%"));
  });

  it("is shown as before the Insight: no break-even task, verdict or 30-year Treasury button", () => {
    expect(words).not.toMatch(/Find the rate|worth the same|Treasury|3\.33|more than the cash|less than the cash/);
  });

  it("sits above the stats line", () => {
    expect(out.indexOf("What the annuity is worth today")).toBeLessThan(out.indexOf("95 Topics"));
  });
});

describe("Home, signed in", () => {
  const stats = { topics: 95, cases: 103, librarySources: 8 };
  const inHtml = renderToStaticMarkup(<LandingView stats={stats} button={{ kind: "open" }} widget={{ code: homeWidgetCode(loadCourseMap())!, cases: [] }} />);
  const inText = inHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("is the same page, with the same sections", () => {
    expect(inHtml).toMatch(/<h1[^>]*>Learn finance from<br\/><span[^>]*>what already happened\.<\/span><\/h1>/);
    expect(inHtml).toContain("What the annuity is worth today");
    expect(inText).toContain("95 Topics · 103 historical cases · 8 sources");
    expect(inHtml).toContain('id="how"');
    expect(inText).toContain(copy.sources.title);
    expect(inText).toContain(copy.footer);
  });

  it("offers Open Study Workspace in the hero and Study Workspace in the top bar, both to /study", () => {
    expect(inHtml).toMatch(/<a[^>]*href="\/study"[^>]*>Open Study Workspace<\/a>/);
    expect(inHtml).toMatch(/<a[^>]*href="\/study"[^>]*>Study Workspace<\/a>/);
  });

  it("offers Sign out beside Study Workspace in the top bar, as a form posting to the sign-out route", () => {
    const topBar = inHtml.slice(inHtml.indexOf("<header"), inHtml.indexOf("</header>"));
    expect(topBar).toMatch(/href="\/study"[^>]*>Study Workspace<\/a><form[^>]*action="\/api\/logout"[^>]*method="post"[^>]*><button type="submit"[^>]*>Sign out<\/button><\/form>/);
  });

  it("shows its own button, not Start learning, after Every number has a source", () => {
    expect(inText).not.toContain("Start learning");
    expect(inHtml.slice(inHtml.indexOf(copy.sources.title))).toMatch(/<a[^>]*href="\/study"[^>]*>Open Study Workspace<\/a>/);
  });

  it("never says Sign in or links to the login", () => {
    expect(inText).not.toContain("Sign in");
    expect(inHtml).not.toContain('href="/login"');
  });
});

describe("Home, the signed-in button", () => {
  const stats = { topics: 95, cases: 103, librarySources: 8 };
  const hero = (button: HomeButton) => {
    const h = renderToStaticMarkup(<LandingView stats={stats} button={button} />);
    return h.match(/<a[^>]*href="\/study"[^>]*>(Resume|Start|Open)[^<]*<\/a>|<form[^>]*>(?:(?!<\/form>).)*(Resume|Start)[^<]*<\/button><\/form>/)?.[0] ?? "";
  };

  // Resume and Start choose the Topic (it shows at once), so they post to /api/open, which goes on to /study.
  it("Resume names the Topic and opens it, as a form posting to /api/open", () => {
    expect(hero({ kind: "resume", topic: "Present value" })).toMatch(/^<form[^>]*action="\/api\/open"[^>]*method="post"[^>]*><button type="submit"[^>]*>Resume: Present value<\/button><\/form>$/);
  });
  it("Start names the Topic and opens it, as a form posting to /api/open", () => {
    expect(hero({ kind: "start", topic: "Present value" })).toMatch(/^<form[^>]*action="\/api\/open"[^>]*method="post"[^>]*><button type="submit"[^>]*>Start: Present value<\/button><\/form>$/);
  });
  it("What comes next shows its label and opens that Topic, as a form posting to /api/open", () => {
    const h = renderToStaticMarkup(<LandingView stats={stats} button={{ kind: "next", label: "New in Percent: Check 3 →" }} />);
    expect(h).toMatch(/<form[^>]*action="\/api\/open"[^>]*method="post"[^>]*><button type="submit"[^>]*>New in Percent: Check 3 →<\/button><\/form>/);
    expect(h).not.toContain("Resume");
  });
  it("Open Study Workspace opens /study", () => {
    expect(hero({ kind: "open" })).toContain(">Open Study Workspace</a>");
  });
  it("keeps the words in Home's copy", () => {
    expect(copy.resume).toBe("Resume:");
    expect(copy.start).toBe("Start:");
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
    const real = loadCourseMap();
    const [first, second] = real.topics;
    expect(homeButton(real, progress({ [first.id]: passed(first) }))).toEqual({ kind: "next", label: `Next Topic: ${second.title} →` });
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

  it("shows Start: first Topic on a fresh database and writes nothing", async () => {
    getDbMock.mockReturnValue(db);
    expect(await render()).toContain(`Start: ${title}`);
    expect(await rows()).toBe(0);
  });
  it("shows Resume for a Topic begun before and chosen on the Course Map", async () => {
    getDbMock.mockReturnValue(db);
    await ensureTopicStarted(db, map);
    expect(await render()).toContain(`Resume: ${title}`);
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
  it("shows no Learner words signed out and does not touch the database", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("must not be called");
    });
    const out = renderToStaticMarkup(await LandingPage({}));
    expect(out).toContain("Sign in");
  });
});
