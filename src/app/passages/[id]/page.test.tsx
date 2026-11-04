import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/course/map", () => ({ loadCourseMap: () => ({}) }));
vi.mock("../../theme-cookie", () => ({ readTheme: async () => ({ mode: "single", theme: "light" }) }));
// The owner is signed in (signing in itself is tested in src/auth/sign-in.test.ts).
vi.mock("@/auth/session", () => ({ currentLearnerId: async () => 1, isSignedIn: async () => true }));
vi.mock("@/library/library", () => ({
  loadPassageView: async () => ({ status: "hidden", asOf: "2008-09-15" }),
}));

const { default: PassagePage } = await import("./page");

describe("Passage view", () => {
  it("leads back to the Study Workspace at /study", async () => {
    const html = renderToStaticMarkup(
      await PassagePage({ params: Promise.resolve({ id: "1" }), searchParams: Promise.resolve({}) }),
    );
    expect(html).toMatch(/<a[^>]*href="\/study"[^>]*>Back to the Study Workspace<\/a>/);
  });
});
