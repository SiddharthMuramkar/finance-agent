// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailLinkForm, emailLinkProblem } from "./email-link-form";

// "Email me a sign-in link" (ADR 0014): asks Better Auth to send a link with a plain fetch, as the Google button does,
// then says "Check your email". Refusals come back as Better Auth codes and are said in plain words.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let answer: { status: number; body: unknown };
const sent: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  sent.length = 0;
  answer = { status: 200, body: { status: true } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      sent.push({ url, init });
      return new Response(JSON.stringify(answer.body), { status: answer.status, headers: { "content-type": "application/json" } });
    }),
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function mount(props: Partial<Parameters<typeof EmailLinkForm>[0]> = {}) {
  await act(async () => root.render(<EmailLinkForm callbackURL="/course" primary={false} google {...props} />));
}

const field = () => host.querySelector<HTMLInputElement>('input[name="email"]')!;
const submit = () => host.querySelector<HTMLButtonElement>('button[type="submit"]')!;

async function ask(email: string) {
  field().value = email;
  await act(async () => void host.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
}

describe("the email-link form", () => {
  it("is a labelled email field and a large button, secondary beside Google and primary alone", async () => {
    await mount();
    const label = host.querySelector("label")!;
    expect(label.textContent).toBe("Email");
    expect(label.getAttribute("for")).toBe(field().id);
    expect(field().type).toBe("email");
    expect(field().required).toBe(true);
    expect(field().getAttribute("autocomplete")).toBe("email");
    expect(field().className).toMatch(/\bfield\b/);
    expect(submit().textContent).toBe("Email me a sign-in link");
    expect(submit().className).toMatch(/^btn btn-secondary btn-lg w-full/);
    await mount({ primary: true, google: false });
    expect(submit().className).toMatch(/^btn btn-primary btn-lg w-full/);
  });

  it("posts the trimmed address and the server's callbackURL to Better Auth, then says to check your email", async () => {
    await mount();
    await ask("  Noor@iCloud.com ");
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("/api/auth/sign-in/magic-link");
    expect(sent[0].init.method).toBe("POST");
    expect(JSON.parse(String(sent[0].init.body))).toEqual({ email: "Noor@iCloud.com", callbackURL: "/course" });
    const status = host.querySelector('[role="status"]')!;
    expect(status.textContent).toContain("Check your email");
    expect(status.textContent).toContain("We sent a sign-in link to Noor@iCloud.com. It works once, for 15 minutes. Open it on this device.");
    expect(host.querySelector("form")).toBeNull();
  });

  it("Use a different email brings the form back, empty", async () => {
    await mount();
    await ask("noor@icloud.com");
    const again = [...host.querySelectorAll("button")].find((b) => b.textContent === "Use a different email")!;
    await act(async () => again.click());
    expect(field().value).toBe("");
    expect(document.activeElement).toBe(field());
    expect(host.querySelector('[role="status"]')).toBeNull();
  });

  it("says each refusal in plain words, under the field, and keeps the address", async () => {
    await mount();
    answer = { status: 429, body: { code: "email_link_throttled", message: "email_link_throttled" } };
    await ask("noor@icloud.com");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Too many sign-in emails. Wait a few minutes, then try again.");
    expect(field().value).toBe("noor@icloud.com");
    expect(submit().disabled).toBe(false);
  });

  it("maps Better Auth's answers to the right words, mentioning Google only when it is there", () => {
    expect(emailLinkProblem(429, undefined)).toBe("throttled");
    expect(emailLinkProblem(429, "email_link_throttled")).toBe("throttled");
    expect(emailLinkProblem(429, "email_link_daily_cap")).toBe("daily_cap");
    expect(emailLinkProblem(502, "email_not_sent")).toBe("not_sent");
    expect(emailLinkProblem(400, "VALIDATION_ERROR")).toBe("bad_email");
    expect(emailLinkProblem(500, undefined)).toBe("not_sent");
  });

  it("says the daily cap and a failed send with Google as the way round, or without it when Google is off", async () => {
    await mount();
    answer = { status: 429, body: { code: "email_link_daily_cap" } };
    await ask("noor@icloud.com");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Email sign-in is resting until tomorrow. Continue with Google instead.");
    answer = { status: 502, body: { code: "email_not_sent" } };
    await ask("noor@icloud.com");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("We couldn't send the email. Try again, or continue with Google.");

    await mount({ primary: true, google: false });
    await ask("noor@icloud.com");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("We couldn't send the email. Try again in a moment.");
    answer = { status: 429, body: { code: "email_link_daily_cap" } };
    await ask("noor@icloud.com");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Email sign-in is resting until tomorrow. Try again then.");
  });

  it("a network failure is a failed send", async () => {
    await mount();
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    await ask("noor@icloud.com");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("We couldn't send the email. Try again, or continue with Google.");
  });
});
