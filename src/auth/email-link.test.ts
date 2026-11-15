import { afterEach, describe, expect, it, vi } from "vitest";
import { emailLinkSends } from "@/db/schema";
import { testDb } from "@/test/pglite";
import { deliveryFor, emailLinkOn, landingLink, nameFromEmail, sendSignInLink, sendWithResend, signInEmail, takeOutboxLink } from "./email-link";

const BASE = {
  BETTER_AUTH_SECRET: "a-test-secret-of-at-least-32-characters!",
  BETTER_AUTH_URL: "https://app.example",
  RESEND_API_KEY: "re_test_key",
  EMAIL_FROM: "Value It <sign-in@app.example>",
};
const VERIFY = "https://app.example/api/auth/magic-link/verify";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("emailLinkOn", () => {
  it("is off without the secret, the URL, the Resend key or EMAIL_FROM, and always off on a preview", () => {
    expect(emailLinkOn(BASE)).toBe(true);
    for (const missing of Object.keys(BASE)) expect(emailLinkOn({ ...BASE, [missing]: " " }), missing).toBe(false);
    expect(emailLinkOn({ ...BASE, VERCEL_ENV: "preview" })).toBe(false);
    expect(emailLinkOn({ ...BASE, VERCEL_ENV: "production" })).toBe(true);
    expect(emailLinkOn({})).toBe(false);
  });

  it("is off while BETTER_AUTH_URL is not a bare https address, so no link points at a broken host", () => {
    for (const address of ["app.example", "https://app.example/login", "http://app.example"]) expect(emailLinkOn({ ...BASE, BETTER_AUTH_URL: address }), address).toBe(false);
    expect(emailLinkOn({ ...BASE, BETTER_AUTH_URL: "https://app.example/" })).toBe(true);
  });

  it("is on in the test bed without Resend, but still needs the secret and the URL", () => {
    const testBed = { E2E: "1", BETTER_AUTH_SECRET: BASE.BETTER_AUTH_SECRET, BETTER_AUTH_URL: BASE.BETTER_AUTH_URL };
    expect(emailLinkOn(testBed)).toBe(true);
    expect(emailLinkOn({ ...testBed, BETTER_AUTH_URL: "" })).toBe(false);
    expect(emailLinkOn({ ...testBed, NODE_ENV: "production" })).toBe(false);
  });
});

describe("deliveryFor", () => {
  it("the test bed uses its outbox even beside a Resend key; everywhere else Resend", () => {
    expect(deliveryFor({ ...BASE, E2E: "1" })).toBe("outbox");
    expect(deliveryFor(BASE)).toBe("resend");
    expect(deliveryFor({ ...BASE, E2E: "1", VERCEL: "1" })).toBe("resend");
  });
});

describe("landingLink", () => {
  it("points the email at /login with the token and a safe next, never straight at verify", () => {
    const url = `${VERIFY}?token=Tok123&callbackURL=%2Fcourse%3Ftopic%3D3&errorCallbackURL=https%3A%2F%2Fevil.example&newUserCallbackURL=%2F%2Fevil`;
    const link = new URL(landingLink(url, BASE.BETTER_AUTH_URL));
    expect(link.origin + link.pathname).toBe("https://app.example/login");
    expect([...link.searchParams]).toEqual([
      ["link", "Tok123"],
      ["next", "/course?topic=3"],
    ]);
  });

  it("drops an unsafe callbackURL for /study", () => {
    for (const callbackURL of ["https://evil.example/x", "//evil.example", "/api/turn", "/login", ""]) {
      const link = new URL(landingLink(`${VERIFY}?token=t&callbackURL=${encodeURIComponent(callbackURL)}`, BASE.BETTER_AUTH_URL));
      expect(link.searchParams.get("next"), callbackURL).toBe("/study");
    }
  });
});

describe("signInEmail", () => {
  it("carries the same landing link in its text and HTML, escaped, with no images or tracking", () => {
    const link = "https://app.example/login?link=a<b&next=%2Fcourse";
    const mail = signInEmail(link);
    expect(mail.subject).toBe("Your sign-in link for Value It");
    expect(mail.text).toContain(link);
    expect(mail.text).toContain("It works once, for the next 15 minutes.");
    expect(mail.text).toContain("If you didn't ask for this, ignore this email.");
    expect(mail.html).toContain('href="https://app.example/login?link=a&lt;b&amp;next=%2Fcourse"');
    expect(mail.html).toContain("Sign in to Value It");
    expect(mail.html).not.toContain("a<b");
    expect(mail.html).not.toMatch(/<img|<script|https?:\/\/(?!app\.example)/i);
  });
});

describe("nameFromEmail", () => {
  it("names a new email-link person from their address", () => {
    expect(nameFromEmail("asha.kumar+x@icloud.com")).toBe("Asha Kumar");
    expect(nameFromEmail("j_doe-99@x.com")).toBe("J Doe 99");
    expect(nameFromEmail("NOOR@x.com")).toBe("Noor");
    expect(nameFromEmail("+tag@x.com")).toBe("Learner");
  });
});

describe("sendWithResend", () => {
  it("makes one POST with the key, EMAIL_FROM, the address and an Idempotency-Key from the token", async () => {
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json({ id: "email-1" }));
    vi.stubGlobal("fetch", fetch);
    const mail = signInEmail("https://app.example/login?link=t&next=%2Fstudy");
    await sendWithResend(BASE, "asha@x.com", mail, "token-1");
    await sendWithResend(BASE, "asha@x.com", mail, "token-1");
    await sendWithResend(BASE, "asha@x.com", mail, "token-2");

    expect(fetch).toHaveBeenCalledTimes(3);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer re_test_key");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(String(init.body))).toEqual({ from: BASE.EMAIL_FROM, to: ["asha@x.com"], subject: mail.subject, text: mail.text, html: mail.html });
    const key = (i: number) => new Headers(fetch.mock.calls[i][1].headers).get("idempotency-key");
    expect(key(0)).toMatch(/^sign-in\/[0-9a-f]{32}$/);
    expect(key(0)).not.toContain("token-1");
    expect(key(1)).toBe(key(0));
    expect(key(2)).not.toBe(key(0));
  });

  it("a refusal is email_not_sent and the log names no address", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 422 })));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const mail = signInEmail("https://app.example/login?link=t&next=%2Fstudy");
    await expect(sendWithResend(BASE, "asha@x.com", mail, "t")).rejects.toMatchObject({ body: { code: "email_not_sent" } });
    expect(error).toHaveBeenCalledWith("email_link_not_sent: Resend answered 422");
    expect(JSON.stringify(error.mock.calls)).not.toContain("asha");
  });

  it("an unreachable Resend is email_not_sent too", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("fetch failed for asha@x.com"))));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const mail = signInEmail("https://app.example/login?link=t&next=%2Fstudy");
    await expect(sendWithResend(BASE, "asha@x.com", mail, "t")).rejects.toMatchObject({ body: { code: "email_not_sent" } });
    expect(JSON.stringify(error.mock.calls)).not.toContain("asha");
  });
});

describe("sendSignInLink", () => {
  it("in the test bed keeps the landing link in the outbox, hands it out once, and never calls Resend", async () => {
    const db = await testDb();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const env = { E2E: "1", BETTER_AUTH_SECRET: BASE.BETTER_AUTH_SECRET, BETTER_AUTH_URL: BASE.BETTER_AUTH_URL, RESEND_API_KEY: "re_should_not_be_used" };
    await sendSignInLink(db, env)({ email: "Mia@E2E.example", url: `${VERIFY}?token=abc&callbackURL=%2Fcourse`, token: "abc" });
    expect(fetch).not.toHaveBeenCalled();
    expect(takeOutboxLink("mia@e2e.example")).toBe("https://app.example/login?link=abc&next=%2Fcourse");
    expect(takeOutboxLink("mia@e2e.example")).toBeNull();
    expect(await db.select().from(emailLinkSends)).toHaveLength(1);
  });

  it("sends through Resend to the lowercase address, and refuses a fourth link in an hour with email_link_throttled", async () => {
    const db = await testDb();
    const fetch = vi.fn<(url: string, init: RequestInit) => Promise<Response>>(async () => Response.json({ id: "email-1" }));
    vi.stubGlobal("fetch", fetch);
    const send = sendSignInLink(db, BASE);
    for (let i = 0; i < 3; i++) await send({ email: " Asha@X.com", url: `${VERIFY}?token=t${i}&callbackURL=%2Fstudy`, token: `t${i}` });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(fetch.mock.calls[0][1].body)).to).toEqual(["asha@x.com"]);
    expect(JSON.parse(String(fetch.mock.calls[0][1].body)).text).toContain("https://app.example/login?link=t0&next=%2Fstudy");
    await expect(send({ email: "asha@x.com", url: `${VERIFY}?token=t3&callbackURL=%2Fstudy`, token: "t3" })).rejects.toMatchObject({
      statusCode: 429,
      body: { code: "email_link_throttled" },
    });
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
