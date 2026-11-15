import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { SignIn } from "@/auth/session";

// Who is signed in comes from currentSignIn (tested in src/auth/session.test.ts); here it is whatever a test says.
const who = vi.hoisted(() => ({ signIn: { kind: "signed-out" } as SignIn, asked: 0 }));
vi.mock("@/auth/session", () => ({
  currentSignIn: async () => {
    who.asked++;
    return who.signIn;
  },
}));

const { default: LoginPage } = await import("./page");
const { passcodeEye } = await import("./passcode-field");

type Params = { next?: string; wrong?: string; locked?: string; error?: string; passcode?: string; link?: string };
const render = async (params: Params) => renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve(params) }));
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/\s+/g, " ");

const hiddenNext = (html: string) => html.match(/<input[^>]*name="next"[^>]*>/)?.[0];

describe("The sign-in page", () => {
  it("carries a safe next through the form", async () => {
    const field = hiddenNext(await render({ next: "/passages/12?from=map" }));
    expect(field).toContain('type="hidden"');
    expect(field).toContain('value="/passages/12?from=map"');
  });

  it("drops an unsafe next", async () => {
    for (const next of ["https://evil.example", "//evil.example", "/api/turn", "/login"]) {
      expect(hiddenNext(await render({ next })), next).toBeUndefined();
    }
    expect(hiddenNext(await render({}))).toBeUndefined();
  });

  it("shows the same messages with a next", async () => {
    expect(await render({ wrong: "1", next: "/course" })).toContain("That passcode didn&#x27;t work. Check it and try again.");
    expect(await render({ locked: "1", next: "/course" })).toContain("Too many wrong passcodes");
  });
});

describe("The passcode page", () => {
  it("says what it is for", async () => {
    expect(await render({})).toMatch(/<h1[^>]*>Enter your passcode<\/h1>/);
  });

  it("hides the passcode by default, with an eye that offers to show it", async () => {
    const html = await render({});
    expect(html.match(/<input[^>]*name="passcode"[^>]*>/)?.[0]).toContain('type="password"');
    expect(html).toMatch(/<button[^>]*type="button"[^>]*aria-label="Show passcode"/);
  });

  it("has an eye that turns the field visible and then offers to hide it", () => {
    expect(passcodeEye(false)).toEqual({ type: "password", label: "Show passcode" });
    expect(passcodeEye(true)).toEqual({ type: "text", label: "Hide passcode" });
  });

  it("submits to the sign-in route with an Enter button", async () => {
    const html = await render({});
    expect(html).toMatch(/<form[^>]*action="\/api\/login"[^>]*method="post"/);
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Enter<\/button>/);
    // ADR 0015: the page's one primary, full width at the 44px large size.
    expect(html).toMatch(/<button type="submit"[^>]*class="btn btn-primary btn-lg w-full"[^>]*>Enter<\/button>/);
  });

  it("leads back to Home", async () => {
    expect(await render({})).toMatch(/<a[^>]*href="\/"[^>]*>← Back to home<\/a>/);
  });

  it("says a wrong passcode inline, right under the field", async () => {
    const html = await render({ wrong: "1" });
    const message = "That passcode didn&#x27;t work. Check it and try again.";
    expect(html).toContain(message);
    expect(html).not.toContain("That passcode is not right.");
    expect(html.indexOf('name="passcode"')).toBeLessThan(html.indexOf(message));
    expect(html.indexOf(message)).toBeLessThan(html.indexOf(">Enter</button>"));
  });

  it("still says when sign-in is paused, and not the wrong-passcode message with it", async () => {
    const html = await render({ wrong: "1", locked: "1" });
    expect(html).toContain("Too many wrong passcodes");
    expect(html).not.toContain("didn&#x27;t work");
  });
});

const SECRET = "a-test-secret-of-at-least-32-characters!";
/** Google sign-in on (the secret and a client id), as on production. */
const googleOn = () => {
  vi.stubEnv("BETTER_AUTH_SECRET", SECRET);
  vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
};
/** Email links on (the secret, the site's address, and Resend), as on production. */
const emailOn = () => {
  vi.stubEnv("BETTER_AUTH_SECRET", SECRET);
  vi.stubEnv("BETTER_AUTH_URL", "https://www.value-it.xyz");
  vi.stubEnv("RESEND_API_KEY", "re_test");
  vi.stubEnv("EMAIL_FROM", "Value It <sign-in@value-it.xyz>");
};

/** The buttons on the page, by their words, with their classes. */
const buttons = (html: string) => Object.fromEntries([...html.matchAll(/<button[^>]*class="([^"]*)"[^>]*>(?:<[^>]+>)*([^<]+)</g)].map((m) => [m[2], m[1]]));

describe("The sign-in page with accounts on (ADR 0014)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    who.signIn = { kind: "signed-out" };
    who.asked = 0;
  });

  it("offers Google first, then the email link as a secondary, then the passcode behind a link", async () => {
    googleOn();
    emailOn();
    const html = await render({ next: "/course" });
    expect(html).toMatch(/<h1 class="type-h1">Sign in<\/h1>/);
    const t = text(html);
    expect(t.indexOf("Continue with Google")).toBeLessThan(t.indexOf(" or "));
    expect(t.indexOf(" or ")).toBeLessThan(t.indexOf("Email me a sign-in link"));
    const b = buttons(html);
    expect(b["Continue with Google"]).toMatch(/\bbtn-primary\b/);
    expect(b["Email me a sign-in link"]).toMatch(/^btn btn-secondary btn-lg\b/);
    expect(html.match(/btn-primary/g)).toHaveLength(1);
    expect(html).toMatch(/<input[^>]*type="email"[^>]*>/);
    expect(html).toMatch(/<input[^>]*autoComplete="email"[^>]*>/);
    expect(html).toMatch(/<a[^>]*href="\/login\?passcode=1&amp;next=%2Fcourse"[^>]*>Use a passcode<\/a>/);
    expect(html).not.toContain('name="passcode"');
  });

  it("makes the email link the one primary when Google is off, and shows no Google", async () => {
    emailOn();
    const html = await render({});
    expect(html).not.toContain("Continue with Google");
    expect(text(html)).not.toMatch(/ or /);
    expect(buttons(html)["Email me a sign-in link"]).toMatch(/^btn btn-primary btn-lg\b/);
    expect(html).toMatch(/<a[^>]*href="\/login\?passcode=1"[^>]*>Use a passcode<\/a>/);
  });

  it("shows Google alone when email links are off, and nothing but the passcode on a preview", async () => {
    googleOn();
    expect(await render({})).not.toContain("Email me a sign-in link");
    emailOn();
    vi.stubEnv("VERCEL_ENV", "preview");
    const preview = await render({});
    expect(preview).not.toContain("Email me a sign-in link");
    expect(preview).not.toContain("Continue with Google");
    expect(preview).toMatch(/<h1[^>]*>Enter your passcode<\/h1>/);
  });

  it("with ?link=, asks for one press: a GET form to verify with the token, a safe callbackURL and errorCallbackURL=/login", async () => {
    googleOn();
    emailOn();
    const html = await render({ link: "AbCdEf0123", next: "/passages/12?from=map" });
    expect(html).toMatch(/<h1 class="type-h1">Finish signing in<\/h1>/);
    expect(html).toMatch(/<form[^>]* action="\/api\/auth\/magic-link\/verify" method="get"/);
    const hidden = Object.fromEntries([...html.matchAll(/<input type="hidden" name="([^"]+)" value="([^"]*)"\/>/g)].map((m) => [m[1], m[2].replaceAll("&amp;", "&")]));
    expect(hidden).toEqual({ token: "AbCdEf0123", callbackURL: "/passages/12?from=map", errorCallbackURL: "/login" });
    expect(Object.keys(buttons(html))).toEqual(["Sign in"]);
    expect(buttons(html)["Sign in"]).toMatch(/\bbtn-primary\b/);
    expect(html).not.toContain("Continue with Google");
    expect(html).not.toContain("Use a passcode");
    // It never sends itself: the person presses Sign in (a mail scanner opening the link uses nothing up).
    expect(html).not.toMatch(/<script|autoFocus|requestSubmit/i);
  });

  it("with ?link=, an unsafe next becomes /study, and a token that can't be one shows the expired message", async () => {
    emailOn();
    for (const next of ["https://evil.example", "//evil.example", "/api/turn", "/login"]) {
      expect(await render({ link: "AbC", next }), next).toContain('name="callbackURL" value="/study"');
    }
    const broken = await render({ link: '"><script>x</script>' });
    expect(broken).not.toContain("magic-link/verify");
    expect(broken).toMatch(/<h1 class="type-h1">That sign-in link has expired<\/h1>/);
  });

  it("says a used or expired link has expired, with the way to ask again underneath", async () => {
    googleOn();
    emailOn();
    const html = await render({ error: "INVALID_TOKEN" });
    expect(html).toMatch(/<h1 class="type-h1">That sign-in link has expired<\/h1>/);
    expect(text(html)).toContain("Each link works once, for 15 minutes. Ask for a new one below.");
    expect(html).toContain("Continue with Google");
    expect(html).toContain("Email me a sign-in link");
    expect(html).not.toContain("Sign-in didn&#x27;t work");
  });

  it("tells a waiting person they wait, by email, with Check again and Sign out, and no sign-in form", async () => {
    googleOn();
    emailOn();
    who.signIn = { kind: "waiting", user: { id: "u1", email: "noor@icloud.com", name: "Noor" } };
    const html = await render({ next: "/course" });
    expect(html).toMatch(/<h1 class="type-h1">Waiting for approval<\/h1>/);
    expect(text(html)).toContain("noor@icloud.com");
    expect(html).toMatch(/<a[^>]*href="\/login\?next=%2Fcourse"[^>]*>Check again<\/a>/);
    expect(html).toMatch(/<form[^>]* action="\/api\/logout" method="post"[^>]*><button type="submit"[^>]*>Sign out<\/button><\/form>/);
    expect(html).not.toContain("Continue with Google");
    expect(html).not.toContain("Email me a sign-in link");
    expect(html).not.toContain('name="passcode"');
  });

  it("tells a denied person they are not approved, with Check again and Sign out", async () => {
    emailOn();
    who.signIn = { kind: "denied", user: { id: "u2", email: "spam@x.com", name: "Spam" } };
    const html = await render({});
    expect(html).toMatch(/<h1 class="type-h1">Access not approved<\/h1>/);
    expect(text(html)).toContain("spam@x.com");
    expect(html).toMatch(/<a[^>]*href="\/login"[^>]*>Check again<\/a>/);
    expect(html).toMatch(/action="\/api\/logout"/);
    expect(html).not.toContain("Waiting for approval");
  });

  it("a sign-in link outranks the waiting screen, so opening one for another address still works", async () => {
    emailOn();
    who.signIn = { kind: "waiting", user: { id: "u1", email: "noor@icloud.com", name: "Noor" } };
    expect(await render({ link: "AbC" })).toMatch(/<h1 class="type-h1">Finish signing in<\/h1>/);
  });

  it("an old not_invited error, or any other code, gets the plain message", async () => {
    googleOn();
    emailOn();
    for (const error of ["not_invited", "access_denied", "email_not_verified"]) {
      const html = await render({ error });
      expect(html, error).toContain("Sign-in didn&#x27;t work. Try again.");
      expect(html, error).not.toContain("not on the list");
      expect(html, error).toContain("Continue with Google");
    }
  });

  it("asks who is signed in only while accounts are on, so the passcode page reads no session", async () => {
    await render({});
    expect(who.asked).toBe(0);
    emailOn();
    await render({});
    expect(who.asked).toBe(1);
  });
});

