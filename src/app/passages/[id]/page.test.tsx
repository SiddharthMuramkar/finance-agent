import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PASSAGE_CHANGED_NOTE, SOFR_NOTICE } from "@/library/credits";
import type { PassageView } from "@/library/library";

vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/course/map", () => ({ loadCourseMap: () => ({}) }));
// The owner is signed in (signing in itself is tested in src/auth/sign-in.test.ts). The page reads the whole
// Learner since A5: the header's account menu names them.
vi.mock("@/auth/session", () => ({
  currentLearnerId: async () => 1,
  signedInLearner: async () => ({ id: 1, name: "owner" }),
  isSignedIn: async () => true,
  currentSignIn: async () => ({ kind: "learner", learner: { id: 1, name: "owner" }, via: "passcode" }),
}));
const view = vi.hoisted(() => ({ current: undefined as unknown }));
vi.mock("@/library/library", () => ({ loadPassageView: async () => view.current }));

const { default: PassagePage } = await import("./page");

const render = async () => renderToStaticMarkup(await PassagePage({ params: Promise.resolve({ id: "1" }), searchParams: Promise.resolve({}) }));

const shown: PassageView = {
  status: "shown",
  heading: "Secured Overnight Financing Rate Data",
  sourceTitle: "New York Fed explainer pages",
  credit: "Julie Dahlquist and Rainford Knight, Principles of Finance 2e (OpenStax, Houston, Texas, 2026), CC BY-NC-SA 4.0. Access for free at https://openstax.org/books/principles-finance-2e/pages/1-why-it-matters",
  licence: "CC BY-NC-SA 4.0",
  licenceUrl: "https://creativecommons.org/licenses/by-nc-sa/4.0/",
  notices: [SOFR_NOTICE],
  url: "https://openstax.org/books/principles-finance-2e/pages/1-1-what-is-finance",
  publishedOn: null,
  quoteWords: null,
  shortened: false,
  machineRead: false,
  sentences: [{ text: "Finance is the study of money.", cited: true }],
};

describe("Passage view", () => {
  beforeEach(() => {
    view.current = { status: "hidden", asOf: "2008-09-15" };
  });

  it("leads back to the Study Workspace at /study", async () => {
    expect(await render()).toMatch(/<a[^>]*href="\/study"[^>]*>Back to the Study Workspace<\/a>/);
  });

  it("shows the credit line with its address linked, the licence as a link to its page, the owner's notice, and that the passage is an excerpt (#26)", async () => {
    view.current = shown;

    const html = await render();

    expect(html).toMatch(/Access for free at <a[^>]*href="https:\/\/openstax\.org\/books\/principles-finance-2e\/pages\/1-why-it-matters"[^>]*>https:\/\/openstax\.org\/books\/principles-finance-2e\/pages\/1-why-it-matters<\/a>/);
    expect(html).toMatch(/Licence: <a[^>]*href="https:\/\/creativecommons\.org\/licenses\/by-nc-sa\/4\.0\/"[^>]*>CC BY-NC-SA 4\.0<\/a>/);
    expect(html).toContain("is not responsible for publication of the SOFR by Value It");
    expect(html).toContain(PASSAGE_CHANGED_NOTE);
  });

  it("names a passage's own licence without a link when it has no licence page", async () => {
    view.current = { ...shown, licence: "Third-party chart, used by permission", licenceUrl: null, notices: [], publishedOn: "2019-08-14" };

    const html = await render();

    expect(html).toContain("Published 2019-08-14. Licence: Third-party chart, used by permission</p>");
    expect(html).not.toContain("not responsible for publication");
  });
});
