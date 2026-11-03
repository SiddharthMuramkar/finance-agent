import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LoginPage from "./page";
import { passcodeEye } from "./passcode-field";

const render = async (params: { next?: string; wrong?: string; locked?: string }) =>
  renderToStaticMarkup(await LoginPage({ searchParams: Promise.resolve(params) }));

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
