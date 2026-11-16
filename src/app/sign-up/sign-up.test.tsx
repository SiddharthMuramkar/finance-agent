import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Where a waitlist invitation lands (issues #33, #76): Clerk's sign-up, carrying its `__clerk_ticket`. Opened with no
// invitation it says one is needed and links to the waitlist. On the test bed a stand-in takes the card's place; anywhere
// else without Clerk there is nothing to finish, so the page sends the person to /sign-in.

vi.mock("@clerk/nextjs", () => ({ SignUp: (props: object) => <div data-clerk="sign-up" data-props={JSON.stringify(props)} /> }));
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect, usePathname: () => "/sign-up" }));

const { default: SignUpPage } = await import("./[[...sign-up]]/page");
const INVITED = { searchParams: Promise.resolve({ __clerk_ticket: "t" }) };
const render = async (props: Parameters<typeof SignUpPage>[0] = INVITED) => renderToStaticMarkup(await SignUpPage(props));
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

describe("/sign-up", () => {
  it("with Clerk on and an invitation, draws Clerk's sign-up under Create your account, landing on /study afterwards", async () => {
    const html = await render();
    expect(html).toMatch(/<h1[^>]*>Create your account<\/h1>/);
    expect(html.match(/<h[1-6]\b/g)).toHaveLength(1);
    const props = JSON.parse(html.match(/data-clerk="sign-up" data-props="([^"]*)"/)![1].replaceAll("&quot;", '"'));
    expect(props).toEqual({ forceRedirectUrl: "/study" });
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/google/i);
    // The joining flow: the header offers Sign in, never another Join the waitlist.
    const header = html.match(/<header[\s\S]*?<\/header>/)![0];
    expect(header).toMatch(/<a [^>]*href="\/sign-in"[^>]*>Sign in<\/a>/);
    expect(header).not.toContain("Join the waitlist");
  });

  it("draws Clerk's own steps under /sign-up/… with no invitation in the address", async () => {
    const html = await render({ params: Promise.resolve({ "sign-up": ["verify-email-address"] }) });
    expect(html).toContain('data-clerk="sign-up"');
  });

  it("opened with no invitation, says one is needed and links to the waitlist, with no card", async () => {
    for (const e2e of ["", "1"]) {
      vi.stubEnv("E2E", e2e);
      const html = await render({});
      expect(html).toMatch(/<h1[^>]*>Create your account<\/h1>/);
      expect(text(html)).toContain("You need an invitation to create an account. Join the waitlist and we’ll email you one when you’re in.");
      expect(html.match(/<main[\s\S]*<\/main>/)![0]).toMatch(/<a [^>]*href="\/join"[^>]*>Join the waitlist<\/a>/);
      expect(html).not.toMatch(/data-clerk/);
    }
  });

  it("on the test bed with an invitation, draws the stand-in in the card's place and calls no Clerk", async () => {
    vi.stubEnv("E2E", "1");
    const html = await render();
    expect(html).toContain('data-clerk-stand-in="sign-up"');
    expect(html).not.toContain('data-clerk="sign-up"');
  });

  it("with Clerk off and no test bed (no keys), sends the person to /sign-in", async () => {
    vi.stubEnv("CLERK_SECRET_KEY", "");
    await expect(render()).rejects.toThrow("redirect /sign-in");
    await expect(render({})).rejects.toThrow("redirect /sign-in");
  });
});
