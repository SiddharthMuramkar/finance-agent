import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Clerk's own components stand in as marked elements, carrying the props the page gave them: they need ClerkProvider and
// a browser, and the page only decides which one draws, and where it sends the person afterwards.
vi.mock("@clerk/nextjs", () => ({
  SignIn: (props: object) => <div data-clerk="sign-in" data-props={JSON.stringify(props)} />,
}));
// The site nav reads the address to mark the page showing.
vi.mock("next/navigation", () => ({ usePathname: () => "/sign-in" }));

const { default: SignInPage } = await import("./[[...sign-in]]/page");
const { passcodeEye } = await import("./passcode-field");

type Params = { next?: string; wrong?: string; locked?: string; passcode?: string };
const render = async (params: Params = {}) => renderToStaticMarkup(await SignInPage({ searchParams: Promise.resolve(params) }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");
const hiddenNext = (html: string) => html.match(/<input[^>]*name="next"[^>]*>/)?.[0];
/** The props the page gave Clerk's <SignIn/>, or null when it drew none. */
const clerkProps = (html: string) => {
  const found = html.match(/data-clerk="sign-in" data-props="([^"]*)"/);
  return found ? (JSON.parse(found[1].replaceAll("&quot;", '"')) as Record<string, ReactNode>) : null;
};

/** Clerk on: both keys set, as on production and a developer's machine with `clerk env pull`. */
const clerkOn = () => {
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_x");
  vi.stubEnv("CLERK_SECRET_KEY", "sk_test_x");
};
/** A deploy: production, on Vercel, where the passcode door is shut. */
const deployed = () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("VERCEL", "1");
};

beforeEach(() => {
  // The test bed's switch is off, and no Clerk keys: the page is the passcode form, as in CI.
  vi.stubEnv("E2E", "");
  vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
  vi.stubEnv("CLERK_SECRET_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("/sign-in with the passcode door open (a developer's machine, the test bed)", () => {
  it("is the passcode form, under the heading Enter your passcode, and no Clerk", async () => {
    const html = await render();
    expect(html).toMatch(/<h1[^>]*>Enter your passcode<\/h1>/);
    expect(clerkProps(html)).toBeNull();
  });

  it("carries a safe next through the form and drops an unsafe one", async () => {
    const field = hiddenNext(await render({ next: "/passages/12?from=map" }));
    expect(field).toContain('type="hidden"');
    expect(field).toContain('value="/passages/12?from=map"');
    for (const next of ["https://evil.example", "//evil.example", "/api/turn", "/sign-in", "/join", "/login"]) {
      expect(hiddenNext(await render({ next })), next).toBeUndefined();
    }
    expect(hiddenNext(await render({}))).toBeUndefined();
  });

  it("hides the passcode by default, with an eye that offers to show it", async () => {
    const html = await render();
    expect(html.match(/<input[^>]*name="passcode"[^>]*>/)?.[0]).toContain('type="password"');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-label="Show passcode"/);
    expect(passcodeEye(false)).toEqual({ type: "password", label: "Show passcode" });
    expect(passcodeEye(true)).toEqual({ type: "text", label: "Hide passcode" });
  });

  it("posts to /api/login with one full-width primary, Enter, and leads back to Home", async () => {
    const html = await render();
    expect(html).toMatch(/<form[^>]*action="\/api\/login"[^>]*method="post"/);
    // ADR 0018: the page's one primary, full width at the 44px large size.
    expect(html).toMatch(/<button type="submit"[^>]*class="btn btn-primary btn-lg w-full"[^>]*>Enter<\/button>/);
    expect(html.match(/btn-primary/g)).toHaveLength(1);
    expect(html).toMatch(/<a[^>]*href="\/"[^>]*>← Back to home<\/a>/);
  });

  it("says a wrong passcode inline under the field, and a pause instead of it", async () => {
    const wrong = await render({ wrong: "1", next: "/course" });
    const message = "That passcode didn&#x27;t work. Check it and try again.";
    expect(wrong.indexOf('name="passcode"')).toBeLessThan(wrong.indexOf(message));
    expect(wrong.indexOf(message)).toBeLessThan(wrong.indexOf(">Enter</button>"));
    const paused = await render({ wrong: "1", locked: "1" });
    expect(paused).toContain("Too many wrong passcodes");
    expect(paused).not.toContain("didn&#x27;t work");
  });

  it("marks Sign in as the page showing in the site nav, with no Join the waitlist beside it", async () => {
    const header = (await render()).match(/<header[\s\S]*?<\/header>/)![0];
    expect(header).toMatch(/<a (?=[^>]*href="\/sign-in")(?=[^>]*aria-current="page")[^>]*>Sign in<\/a>/);
    expect(header).not.toContain("Join the waitlist");
  });
});

describe("/sign-in with Clerk on (issue #33)", () => {
  it("draws Clerk's sign-in under the heading Sign in, sending the person to the safe next or /study afterwards", async () => {
    clerkOn();
    deployed();
    const html = await render({ next: "/passages/12?from=map" });
    expect(html).toMatch(/<h1[^>]*>Sign in<\/h1>/);
    expect(clerkProps(html)).toEqual({ forceRedirectUrl: "/passages/12?from=map" });
    for (const next of [undefined, "https://evil.example", "//evil.example", "/api/turn", "/sign-up"]) {
      expect(clerkProps(await render({ next }))?.forceRedirectUrl, String(next)).toBe("/study");
    }
  });

  it("names no way to sign in itself (Clerk's form shows what the instance offers: an email link today, Google later)", async () => {
    clerkOn();
    deployed();
    const t = text(await render());
    expect(t).not.toMatch(/google/i);
    expect(t).not.toMatch(/passcode/i);
    expect(await render({ passcode: "1" })).not.toContain('name="passcode"');
  });

  it("on a developer's machine, also offers the passcode behind a link, which keeps the next", async () => {
    clerkOn();
    const html = await render({ next: "/course" });
    expect(clerkProps(html)).not.toBeNull();
    expect(html).toMatch(/<a[^>]*href="\/sign-in\?passcode=1&amp;next=%2Fcourse"[^>]*>Use a passcode<\/a>/);
    const door = await render({ passcode: "1", next: "/course" });
    expect(clerkProps(door)).toBeNull();
    expect(door).toMatch(/<h1[^>]*>Enter your passcode<\/h1>/);
    expect(hiddenNext(door)).toContain('value="/course"');
  });

  it("is the passcode form in the browser test bed, which turns Clerk off whatever keys are set", async () => {
    clerkOn();
    vi.stubEnv("E2E", "1");
    const html = await render();
    expect(clerkProps(html)).toBeNull();
    expect(html).toMatch(/<h1[^>]*>Enter your passcode<\/h1>/);
  });
});

describe("/sign-in with neither (a deploy with no Clerk keys, such as a preview)", () => {
  it("says sign-in is off here, with no form at all", async () => {
    deployed();
    const html = await render({ wrong: "1" });
    expect(html).toMatch(/<h1[^>]*>Sign-in is off here<\/h1>/);
    expect(html).not.toContain("<form");
    expect(html).not.toContain("didn&#x27;t work");
    expect(clerkProps(html)).toBeNull();
  });
});
