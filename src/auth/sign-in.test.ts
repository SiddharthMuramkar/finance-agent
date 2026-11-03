import { prerender } from "react-dom/static";
import type { ReactElement } from "react";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CourseMap } from "@/course/map";
import { learners, OWNER_LEARNER_ID } from "@/db/schema";
import type { Db } from "@/db/types";
import { saveFinishedStep } from "@/learner/memory";
import { saveProfile } from "@/learner/profile";
import { testDb } from "@/test/pglite";
import { presentValueOnly } from "@/test/present-value-map";
import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import type { TutorClient } from "@/tutor/turn";
import { runTutorTurn } from "@/tutor/turn";
import { addLine } from "@/learner/notes";

/**
 * Each person signs in with their own passcode and lands in their own Learner (spec #119, "Learners
 * and sign-in"). Every test signs in through the real login route and then reads the real pages,
 * routes and Tutor turn with the cookie it set. Only the database (in-memory Postgres with the real
 * migrations), the Course Map, the browser's cookie jar and the Tutor's model are swapped in.
 */

const as = vi.hoisted(() => ({
  db: undefined as unknown as Db,
  map: undefined as CourseMap | undefined,
  cookie: undefined as string | undefined,
  client: undefined as TutorClient | undefined,
}));

vi.mock("@/db/client", () => ({ getDb: () => as.db }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "fa_access" && as.cookie !== undefined ? { name, value: as.cookie } : undefined) }),
}));
vi.mock("@/course/map", async (original) => {
  const real = await original<typeof import("@/course/map")>();
  return { ...real, loadCourseMap: () => as.map ?? real.loadCourseMap() };
});
vi.mock("@/tutor/anthropic", () => ({ anthropicTutorClient: () => as.client }));
// Pages render outside a mounted app router here; the real redirect stays, so a signed-out request still goes to the login.
vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: () => {}, push: () => {}, replace: () => {} }),
  usePathname: () => "/",
}));

const { POST: login } = await import("@/app/api/login/route");
const session = await import("@/auth/session");
const { default: NotesPage } = await import("@/app/notes/page");
const { default: SessionsPage } = await import("@/app/sessions/page");
const { default: ProgressPage } = await import("@/app/progress/page");
const { default: ProfilePage } = await import("@/app/profile/page");
const { default: StudyPage } = await import("@/app/study/page");
const profileRoute = await import("@/app/api/profile/route");
const quizRoute = await import("@/app/api/quiz/route");
const reviewRoute = await import("@/app/api/review/route");
const turnRoute = await import("@/app/api/turn/route");

const OWNER_PASSCODE = "correct horse battery";
const TEST_PASSCODE = "staple gun";

/** Signs in through the login route and keeps the cookie it set, as the browser would. */
async function signIn(passcode: string) {
  const form = new FormData();
  form.set("passcode", passcode);
  const response = await login(new Request("https://app.example/api/login", { method: "POST", body: form, headers: { "x-forwarded-for": "203.0.113.7" } }));
  const set = response.headers.get("set-cookie") ?? "";
  const value = /fa_access=([^;]*)/.exec(set)?.[1];
  expect(value, "signed in").toBeTruthy();
  as.cookie = decodeURIComponent(value!);
  return response;
}

/** A page's markup, its async parts (such as the header) included. */
async function html(page: Promise<ReactElement>) {
  const { prelude } = await prerender(await page);
  return new Response(prelude).text();
}
const json = async (response: Response | Promise<Response>) => (await response).json();

/** The redirect to the login a page or route throws when the request is signed out. */
const toLogin = { digest: expect.stringMatching(/^NEXT_REDIRECT;[a-z]+;\/login;/) };

async function drain(events: AsyncIterable<unknown>) {
  for await (const _ of events) void _;
}

const text = (t: string): ScriptedReply => ({ content: [{ type: "text", text: t }] });

/** The owner's Learner Memory and Sessions, as the migration handed them to the owner. */
async function ownersRows() {
  const map = as.map!;
  const { client } = scriptedClient([text("The owner's reply about the annuity.")]);
  await drain(runTutorTurn({ db: as.db, client, map, learnerId: OWNER_LEARNER_ID }, "The owner's question"));
  await saveFinishedStep(as.db, map, "story", new Date(), OWNER_LEARNER_ID);
  await addLine(as.db, map, "present-value", "The owner's own note line", new Date(), OWNER_LEARNER_ID);
  await saveProfile(as.db, { work: "a teacher in Mumbai", location: null, loan: null, savingFor: null }, new Date(), OWNER_LEARNER_ID);
}

beforeEach(async () => {
  as.db = await testDb();
  as.map = presentValueOnly();
  as.cookie = undefined;
  vi.stubEnv("SESSION_SECRET", "test-secret");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Signing in with a passcode", () => {
  it("a listed name's passcode signs in as that name's Learner, made on its first sign-in, and the sign-in says which Learner it opened", async () => {
    vi.stubEnv("PASSCODES", `owner:${OWNER_PASSCODE}, test:${TEST_PASSCODE}`);
    const log = vi.spyOn(console, "info").mockImplementation(() => {});

    await signIn(TEST_PASSCODE);
    const test = await session.currentLearnerId();
    expect(test).not.toBe(OWNER_LEARNER_ID);
    expect(log).toHaveBeenLastCalledWith(expect.stringMatching(new RegExp(`Learner ${test} \\(test\\)`)));

    await signIn(TEST_PASSCODE);
    expect(await session.currentLearnerId()).toBe(test);

    await signIn(OWNER_PASSCODE);
    expect(await session.currentLearnerId()).toBe(OWNER_LEARNER_ID);
    expect(log).toHaveBeenLastCalledWith(expect.stringMatching(new RegExp(`Learner ${OWNER_LEARNER_ID} \\(owner\\)`)));
  });

  it("with no passcode list, the old single passcode signs in as the owner", async () => {
    vi.stubEnv("PASSCODE", OWNER_PASSCODE);
    vi.spyOn(console, "info").mockImplementation(() => {});
    await signIn(OWNER_PASSCODE);
    expect(await session.isSignedIn()).toBe(true);
    expect(await session.currentLearnerId()).toBe(OWNER_LEARNER_ID);
  });

  it("once the list is set, the old single passcode no longer signs in", async () => {
    vi.stubEnv("PASSCODE", "the old one");
    vi.stubEnv("PASSCODES", `owner:${OWNER_PASSCODE}`);
    const form = new FormData();
    form.set("passcode", "the old one");
    const response = await login(new Request("https://app.example/api/login", { method: "POST", body: form }));
    expect(new URL(response.headers.get("location")!).search).toBe("?wrong=1");
  });
});

describe("Cookies that no longer sign in", () => {
  beforeEach(() => {
    vi.stubEnv("PASSCODES", `owner:${OWNER_PASSCODE}, test:${TEST_PASSCODE}`);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("an old cookie without a Learner is treated as signed out", async () => {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("test-secret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("finance-agent-access")));
    as.cookie = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
    expect(await session.isSignedIn()).toBe(false);
    await expect(session.currentLearnerId()).rejects.toMatchObject(toLogin);
  });

  it("a cookie for an archived Learner is treated as signed out", async () => {
    await signIn(TEST_PASSCODE);
    const test = await session.currentLearnerId();
    await as.db.update(learners).set({ archivedAt: new Date() }).where(eq(learners.id, test));
    expect(await session.isSignedIn()).toBe(false);
    await expect(session.currentLearnerId()).rejects.toMatchObject(toLogin);
    await expect(NotesPage()).rejects.toMatchObject(toLogin);
  });

  it("a cookie for a name taken off the list is treated as signed out", async () => {
    await signIn(TEST_PASSCODE);
    vi.stubEnv("PASSCODES", `owner:${OWNER_PASSCODE}`);
    expect(await session.isSignedIn()).toBe(false);
    await expect(session.currentLearnerId()).rejects.toMatchObject(toLogin);
  });

  it("a cookie signed with another secret is treated as signed out", async () => {
    await signIn(TEST_PASSCODE);
    vi.stubEnv("SESSION_SECRET", "rotated");
    expect(await session.isSignedIn()).toBe(false);
  });
});

describe("The owner and a second Learner", () => {
  beforeEach(() => {
    vi.stubEnv("PASSCODES", `owner:${OWNER_PASSCODE}, test:${TEST_PASSCODE}`);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  it("the owner's passcode reaches the owner's Topic progress, Topic Notes and Sessions", async () => {
    await ownersRows();
    await signIn(OWNER_PASSCODE);

    expect(await html(NotesPage())).toContain("The owner&#x27;s own note line");
    expect(await html(SessionsPage())).not.toContain("No Sessions yet.");
    expect(await html(ProgressPage())).toMatch(/In progress/i);
    expect(await html(StudyPage({ searchParams: Promise.resolve({}) }))).toContain("The owner&#x27;s reply about the annuity.");
    expect(await json(profileRoute.GET())).toMatchObject({ work: "a teacher in Mumbai" });
  });

  it("a second Learner sees none of the owner's data on any page, route or Tutor turn", async () => {
    await ownersRows();
    await signIn(TEST_PASSCODE);

    expect(await html(NotesPage())).not.toContain("The owner&#x27;s own note line");
    expect(await html(SessionsPage())).toContain("No Sessions yet.");
    expect(await html(ProgressPage())).not.toMatch(/In progress/i);
    expect(await html(ProfilePage())).not.toContain("Mumbai");
    const study = await html(StudyPage({ searchParams: Promise.resolve({}) }));
    expect(study).not.toContain("The owner&#x27;s reply");
    expect(study).not.toContain("The owner&#x27;s question");
    expect(await json(profileRoute.GET())).toMatchObject({ work: null });
    expect(await json(quizRoute.GET())).toEqual({ quiz: null });
    expect(await json(reviewRoute.GET())).toMatchObject({ question: null, dueCount: 0, done: 0 });

    // The second Learner's Tutor turn: nothing of the owner's in the model request, and the reply is the second Learner's alone.
    const { client, requests } = scriptedClient([text("Welcome. Let's start with a story.")]);
    as.client = client;
    const response = await turnRoute.POST(new Request("https://app.example/api/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: "Hello" }) }));
    expect(response.status).toBe(200);
    await response.text();
    const sent = JSON.stringify(requests);
    expect(sent).not.toContain("Mumbai");
    expect(sent).not.toContain("The owner's question");
    expect(sent).not.toContain("The owner's reply");

    // The owner's Workspace still shows only the owner's conversation.
    await signIn(OWNER_PASSCODE);
    const owners = await html(StudyPage({ searchParams: Promise.resolve({}) }));
    expect(owners).toContain("The owner&#x27;s reply about the annuity.");
    expect(owners).not.toContain("Welcome. Let&#x27;s start with a story.");
  });
});
