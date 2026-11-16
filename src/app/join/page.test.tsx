import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /join (issues #33, #76): Clerk's Waitlist, where a Visitor leaves their email; the Owner lets them in from Clerk, and
// Clerk emails the invitation. On the test bed a stand-in takes the card's place (e2e/sign-in.spec.ts reads the page
// there); anywhere else without Clerk nobody can join, so the page sends the person to /sign-in.

vi.mock("@clerk/nextjs", () => ({ Waitlist: (props: object) => <div data-clerk="waitlist" data-props={JSON.stringify(props)} /> }));
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect, usePathname: () => "/join" }));

const { default: JoinPage } = await import("./page");
const render = async () => renderToStaticMarkup(await JoinPage());
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

beforeEach(() => {
  vi.stubEnv("E2E", "");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
});
afterEach(() => {
  vi.unstubAllEnvs();
  redirect.mockClear();
});

describe("/join", () => {
  it("with Clerk on, draws Clerk's Waitlist under Join the waitlist, saying what happens next", async () => {
    const html = await render();
    expect(html).toMatch(/<h1[^>]*>Join the waitlist<\/h1>/);
    expect(html.match(/<h[1-6]\b/g)).toHaveLength(1);
    expect(html).toContain('data-clerk="waitlist"');
    expect(html).not.toContain("data-clerk-stand-in");
    for (const line of ["It’s free.", "We review each request by hand.", "We email you when you’re in.", "You can study on a laptop or a phone."]) {
      expect(text(html)).toContain(line);
    }
    expect(text(html)).not.toMatch(/google/i);
    const header = html.match(/<header[\s\S]*?<\/header>/)![0];
    expect(header).toMatch(/<a [^>]*href="\/sign-in"[^>]*>Sign in<\/a>/);
    expect(header).not.toContain("Join the waitlist");
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>← Back to home<\/a>/);
  });

  it("on the test bed, draws the stand-in in the card's place and calls no Clerk", async () => {
    vi.stubEnv("E2E", "1");
    const html = await render();
    expect(html).toContain('data-clerk-stand-in="waitlist"');
    expect(html).not.toContain('data-clerk="waitlist"');
    expect(text(html)).toContain("We review each request by hand.");
  });

  it("with Clerk off and no test bed (no keys), sends the person to /sign-in", async () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    await expect(render()).rejects.toThrow("redirect /sign-in");
  });
});
