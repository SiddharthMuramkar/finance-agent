import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { aboutCopy } from "../_landing/about-copy";

// The About page reads the sign-in state and nothing else private (spec 2026-11-12 G1, E11): the database and every
// Learner read throw if anything touches them; isSignedIn says whatever a test says.
const who = vi.hoisted(() => ({ signedIn: false, asked: 0 }));
vi.mock("@/db/client", () => ({
  getDb: () => {
    throw new Error("The About page read the database");
  },
}));
vi.mock("@/auth/session", () => {
  const fail = () => {
    throw new Error("The About page read a Learner");
  };
  return {
    isSignedIn: async () => {
      who.asked++;
      return who.signedIn;
    },
    currentLearnerId: fail,
    currentLearner: fail,
    signedInLearner: fail,
    currentSignIn: fail,
  };
});
const page = await import("./page");
const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
const header = (html: string) => html.slice(html.indexOf("<header"), html.indexOf("</header>"));

beforeEach(() => {
  who.signedIn = false;
  who.asked = 0;
});

describe("The About page knows who is there, and reads nothing else private [G1, E11]", () => {
  it("is drawn for each request and imports no database, Learner read or request API of its own", () => {
    expect((page as { dynamic?: string }).dynamic).toBe("force-dynamic");
    for (const from of ["@/db", "next/headers"]) expect(source, from).not.toMatch(new RegExp(`from "${from}[/"]`));
    expect(source).toMatch(/import \{ isSignedIn \} from "@\/auth\/session";/);
  });

  it("signed out: its h1, and Sign in and Join early access in the header, asking only whether someone is signed in", async () => {
    const html = renderToStaticMarkup(await page.default());
    expect(who.asked).toBe(1);
    expect(html).toMatch(new RegExp(`<h1[^>]*>${aboutCopy.title}</h1>`));
    expect(header(html)).toContain(">Sign in</a>");
    expect(header(html)).toContain("Join early access");
    expect(header(html)).not.toContain("Sign out");
  });

  it("signed in: Study Workspace and Sign out in the header, never Sign in or Join early access", async () => {
    who.signedIn = true;
    const html = renderToStaticMarkup(await page.default());
    const top = header(html);
    expect(top).toMatch(/<a href="\/study"[^>]*>Study Workspace<\/a>/);
    expect(top).toMatch(/<button type="submit"[^>]*>Sign out<\/button>/);
    expect(top).not.toContain("Sign in");
    expect(top).not.toContain("Join early access");
    // The closing band opens the Study Workspace instead of the sign-in page.
    const band = html.slice(html.indexOf("home-band"));
    expect(band).toContain("Open Study Workspace");
    expect(band).not.toContain("Join early access");
    expect(band).not.toContain('href="/join"');
    expect(band).not.toContain('href="/sign-in"');
  });
});
