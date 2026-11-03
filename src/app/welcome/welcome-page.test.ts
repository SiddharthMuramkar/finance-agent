import { prerender } from "react-dom/static";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { learners, sessions } from "@/db/schema";
import type { Db } from "@/db/types";
import { loadProfile } from "@/learner/profile";
import { testDb } from "@/test/pglite";
import { scriptedClient } from "@/test/scripted-client";
import { runTutorTurn } from "@/tutor/turn";
import { loadCourseMap } from "@/course/map";

/**
 * The Welcome shows while the Learner has no Sessions, Older ones included (spec #119, "Pages › Welcome").
 * The real Welcome and Study Workspace pages and the real routes, with the request's Learner and the
 * database (in-memory Postgres with the real migrations) swapped in.
 */

const as = vi.hoisted(() => ({ db: undefined as unknown as Db, learnerId: 0 }));

vi.mock("@/db/client", () => ({ getDb: () => as.db }));
vi.mock("@/auth/session", () => {
  const learner = async () => ({ id: as.learnerId, name: "test", archivedAt: null, showDeveloperDetails: false, createdAt: new Date() });
  return { currentLearnerId: async () => as.learnerId, isSignedIn: async () => true, currentLearner: learner, signedInLearner: learner };
});
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
// Pages render outside a mounted app router here; the real redirect stays.
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/",
}));

const { default: WelcomePage } = await import("./page");
const { default: StudyPage } = await import("../study/page");
const jump = await import("../api/jump/route");
const profile = await import("../api/profile/route");

const map = loadCourseMap();
const toWelcome = { digest: expect.stringMatching(/^NEXT_REDIRECT;[a-z]+;\/welcome;/) };
const toStudy = { digest: expect.stringMatching(/^NEXT_REDIRECT;[a-z]+;\/study;/) };
const welcome = (panel?: string) => WelcomePage({ searchParams: Promise.resolve(panel ? { panel } : {}) });
const study = () => StudyPage({ searchParams: Promise.resolve({}) });
const json = (body: unknown) => new Request("https://app.example/api", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function html(page: Promise<ReactElement>) {
  const { prelude } = await prerender(await page);
  return new Response(prelude).text();
}

async function newLearner() {
  const [row] = await as.db.insert(learners).values({ name: "test" }).returning();
  as.learnerId = row.id;
  return row.id;
}

describe("the Welcome", () => {
  beforeEach(async () => {
    as.db = await testDb();
  });

  it("is what a new Learner sees: the Study Workspace sends them to it, and it opens on How a Topic works", async () => {
    await newLearner();
    await expect(study()).rejects.toMatchObject(toWelcome);
    const page = await html(welcome());
    expect(page).toContain("How a Topic works");
    expect(page).not.toContain("data-profile-card");
  });

  it("is never shown to a Learner with a Session", async () => {
    const id = await newLearner();
    const { client } = scriptedClient([{ content: [{ type: "text", text: "A reply." }] }]);
    for await (const _ of runTutorTurn({ db: as.db, client, map, learnerId: id }, "A question")) void _;
    await expect(welcome()).rejects.toMatchObject(toStudy);
    await expect(study()).resolves.toBeTruthy();
  });

  it("is never shown to a Learner whose only Sessions are Older ones", async () => {
    const id = await newLearner();
    await as.db.insert(sessions).values({ learnerId: id, instructions: "old", tools: [], model: "m", effort: "medium", fingerprint: "f", older: true });
    await expect(welcome("first-topic")).rejects.toMatchObject(toStudy);
    await expect(study()).resolves.toBeTruthy();
  });

  it("About you: skipping saves nothing, and Next saves the answers to the Learner Profile", async () => {
    const id = await newLearner();
    expect(await html(welcome("about-you"))).toContain('href="/welcome?panel=first-topic"');
    expect(await loadProfile(as.db, id)).toMatchObject({ work: null, location: null });
    const put = new Request("https://app.example/api/profile", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ work: "A nurse", location: "Pune", loan: "", savingFor: "" }) });
    expect((await profile.PUT(put)).status).toBe(200);
    expect(await loadProfile(as.db, id)).toMatchObject({ work: "A nurse", location: "Pune" });
  });

  it("Start this Topic opens Percent in the Study Workspace with no Session yet, so the page starts the Tutor's opener", async () => {
    await newLearner();
    const card = await html(welcome("first-topic"));
    expect(card).toContain("Percent, percentage points and basis points");
    expect(card).toContain('data-start-topic="num-percent-bps"');

    // Start this Topic chooses the Topic, as the Course Map does, and opens the Study Workspace.
    expect((await jump.POST(json({ topicId: "num-percent-bps" }))).status).toBe(200);
    const workspace = await html(study());
    expect(workspace).toContain("Percent, percentage points and basis points");
    expect(workspace).not.toContain("How a Topic works");
    // The first turn has not run yet, and still nothing sends the Learner back to the Welcome.
    await expect(welcome()).rejects.toMatchObject(toStudy);
  });
});
