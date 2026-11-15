import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// /join (issue #33): Clerk's Waitlist, where a stranger leaves their email for early access; the owner lets them in from
// Clerk, and Clerk emails the invitation. Without Clerk nobody can join, so the page sends the person to /sign-in.

vi.mock("@clerk/nextjs", () => ({ Waitlist: (props: object) => <div data-clerk="waitlist" data-props={JSON.stringify(props)} /> }));
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

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
  it("with Clerk on, draws Clerk's Waitlist under Join early access, saying what happens next", async () => {
    const html = await render();
    expect(html).toMatch(/<h1[^>]*>Join early access<\/h1>/);
    expect(html).toContain('data-clerk="waitlist"');
    expect(text(html)).toContain("Leave your email and we'll write when your place is ready.");
    expect(text(html)).not.toMatch(/google/i);
    const header = html.match(/<header[\s\S]*?<\/header>/)![0];
    expect(header).toMatch(/<a href="\/sign-in"[^>]*>Sign in<\/a>/);
    expect(header).not.toContain("Join early access");
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>← Back to home<\/a>/);
  });

  it("with Clerk off (the test bed, or no keys), sends the person to /sign-in", async () => {
    vi.stubEnv("E2E", "1");
    await expect(render()).rejects.toThrow("redirect /sign-in");
    vi.stubEnv("E2E", "");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    await expect(render()).rejects.toThrow("redirect /sign-in");
  });
});
