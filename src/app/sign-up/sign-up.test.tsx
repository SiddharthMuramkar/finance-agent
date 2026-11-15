import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Where a Waitlist invitation lands (issue #33): Clerk's sign-up, carrying its `__clerk_ticket`. Without Clerk there is
// nothing to finish, so the page sends the person to /sign-in.

vi.mock("@clerk/nextjs", () => ({ SignUp: (props: object) => <div data-clerk="sign-up" data-props={JSON.stringify(props)} /> }));
const redirect = vi.hoisted(() =>
  vi.fn((to: string) => {
    throw new Error(`redirect ${to}`);
  }),
);
vi.mock("next/navigation", () => ({ redirect }));

const { default: SignUpPage } = await import("./[[...sign-up]]/page");
const render = async () => renderToStaticMarkup(await SignUpPage());

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
  it("with Clerk on, draws Clerk's sign-up under Create your account, landing on /study afterwards", async () => {
    const html = await render();
    expect(html).toMatch(/<h1[^>]*>Create your account<\/h1>/);
    const props = JSON.parse(html.match(/data-clerk="sign-up" data-props="([^"]*)"/)![1].replaceAll("&quot;", '"'));
    expect(props).toEqual({ forceRedirectUrl: "/study" });
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/google/i);
    // The joining flow: the header offers Sign in, never another Join early access.
    const header = html.match(/<header[\s\S]*?<\/header>/)![0];
    expect(header).toMatch(/<a href="\/sign-in"[^>]*>Sign in<\/a>/);
    expect(header).not.toContain("Join early access");
  });

  it("with Clerk off (the test bed, or no keys), sends the person to /sign-in", async () => {
    vi.stubEnv("E2E", "1");
    await expect(render()).rejects.toThrow("redirect /sign-in");
    vi.stubEnv("E2E", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    await expect(render()).rejects.toThrow("redirect /sign-in");
  });
});
