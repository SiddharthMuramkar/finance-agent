import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { learnerState, topicProgress } from "@/db/schema";
import type { Db } from "@/db/types";
import { ensureTopicStarted } from "@/learner/memory";
import { presentValueOnly } from "@/test/present-value-map";
import { testDb } from "@/test/pglite";
import { copy } from "./copy";

const getDbMock = vi.hoisted(() => vi.fn());
const loadMap = vi.hoisted(() => vi.fn());
vi.mock("@/db/client", () => ({ getDb: getDbMock }));
vi.mock("@/course/map", async (orig) => {
  const real = await orig<typeof import("@/course/map")>();
  loadMap.mockImplementation(real.loadCourseMap);
  return { ...real, loadCourseMap: loadMap };
});
vi.mock("./stats", () => ({ landingStats: async () => ({ topics: "1 of 1", cases: 1, librarySources: 1 }) }));
const { LandingPage, LandingView, homeButton } = await import("./landing");
type HomeButton = import("./landing").HomeButton;

const html = renderToStaticMarkup(<LandingView stats={{ topics: "90 of 95", cases: 312, librarySources: 47 }} />);
const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("Landing page", () => {
  it("shows the two-line headline", () => {
    expect(html).toMatch(/<h1[^>]*>Learn finance from<br\/><span[^>]*>what already happened\.<\/span><\/h1>/);
  });

  it("lists the six Teaching Steps in order", () => {
    const names = ["Story", "Concept", "Your turn", "Check", "Reveal", "Principle"];
    const positions = names.map((n) => html.indexOf(`>${n}</h3>`));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("shows the counts it is given", () => {
    expect(text).toContain("Topics written 90 of 95");
    expect(text).toContain("Historical Cases 312");
    expect(text).toContain("Library sources 47");
  });

  it("marks the copy as a draft", () => {
    expect(text).toContain("Draft");
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

  it("puts the stats after the screenshot, so they never cover it", () => {
    expect(html.indexOf("</figure>")).toBeGreaterThan(0);
    expect(html.indexOf("</figure>")).toBeLessThan(html.indexOf("<dl"));
  });

  it("keeps a figure such as 90 of 95 on one line", () => {
    expect(html).toMatch(/<dd[^>]*whitespace-nowrap[^>]*>90 of 95<\/dd>/);
  });
});

describe("Landing page, signed in", () => {
  const stats = { topics: "90 of 95", cases: 312, librarySources: 47 };
  const inHtml = renderToStaticMarkup(<LandingView stats={stats} button={{ kind: "open" }} />);
  const inText = inHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  it("is the same page, with the same sections", () => {
    expect(inHtml).toMatch(/<h1[^>]*>Learn finance from<br\/><span[^>]*>what already happened\.<\/span><\/h1>/);
    expect(inHtml).toContain("</figure>");
    expect(inText).toContain("Topics written 90 of 95");
    expect(inHtml).toContain('id="how"');
    expect(inText).toContain(copy.sources.title);
    expect(inText).toContain(copy.footer);
  });

  it("offers Open Study Workspace in the hero and Study Workspace in the top bar, both to /study", () => {
    expect(inHtml).toMatch(/<a[^>]*href="\/study"[^>]*>Open Study Workspace<\/a>/);
    expect(inHtml).toMatch(/<a[^>]*href="\/study"[^>]*>Study Workspace<\/a>/);
  });

  it("never says Sign in or links to the login", () => {
    expect(inText).not.toContain("Sign in");
    expect(inHtml).not.toContain('href="/login"');
  });
});

describe("Landing page, the signed-in button", () => {
  const stats = { topics: "90 of 95", cases: 312, librarySources: 47 };
  const hero = (button: HomeButton) => {
    const h = renderToStaticMarkup(<LandingView stats={stats} button={button} />);
    return h.match(/<a[^>]*href="\/study"[^>]*>(Resume|Start|Open)[^<]*<\/a>/)?.[0] ?? "";
  };

  it("Resume names the Topic and opens /study", () => {
    expect(hero({ kind: "resume", topic: "Present value" })).toContain(">Resume: Present value</a>");
  });
  it("Start names the Topic and opens /study", () => {
    expect(hero({ kind: "start", topic: "Present value" })).toContain(">Start: Present value</a>");
  });
  it("Open Study Workspace opens /study", () => {
    expect(hero({ kind: "open" })).toContain(">Open Study Workspace</a>");
  });
  it("keeps the words in Home's copy", () => {
    expect(copy.resume).toBe("Resume:");
    expect(copy.start).toBe("Start:");
  });
});

describe("Landing page, the button rule", () => {
  const map = presentValueOnly();
  const title = map.topic("present-value")!.title;
  const place = (status: "not_started" | "in_progress" | "passed", dueChecks: unknown[] = []) =>
    ({ topic: map.topic("present-value")!, status, dueChecks }) as never;

  it("is Open when there is no place", () => expect(homeButton(null)).toEqual({ kind: "open" }));
  it("is Start for a Topic never started", () => expect(homeButton(place("not_started"))).toEqual({ kind: "start", topic: title }));
  it("is Resume for a Topic in progress", () => expect(homeButton(place("in_progress"))).toEqual({ kind: "resume", topic: title }));
  it("is Resume for a passed Topic with a Check due", () => expect(homeButton(place("passed", [{}]))).toEqual({ kind: "resume", topic: title }));
});

describe("Home's page, signed in", () => {
  let db: Db;
  const map = presentValueOnly();
  const title = map.topic("present-value")!.title;
  beforeEach(async () => {
    db = await testDb();
    loadMap.mockReturnValue(map);
  });
  const render = async () => renderToStaticMarkup(await LandingPage({ signedIn: true }));
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
    const out = renderToStaticMarkup(await LandingPage({ signedIn: false }));
    expect(out).toContain("Sign in");
  });
});
