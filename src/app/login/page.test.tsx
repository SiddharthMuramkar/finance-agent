import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import LoginPage from "./page";

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
    expect(await render({ wrong: "1", next: "/course" })).toContain("That passcode is not right.");
    expect(await render({ locked: "1", next: "/course" })).toContain("Too many wrong passcodes");
  });
});
