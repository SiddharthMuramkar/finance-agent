// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Sign out (issue #33): without Clerk, a plain form post to /api/logout, which ends the passcode cookie; while Clerk runs
// (inside ClerkOn), pressing it ends the passcode cookie too, then Clerk's session through its browser SDK, landing Home.

const signOut = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("@clerk/nextjs", () => ({ useClerk: () => ({ signOut }) }));
const { ClerkOn, SignOutForm } = await import("./sign-out");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
const form = () => host.querySelector("form")!;
const mount = (clerk: boolean) =>
  act(async () => {
    const button = (
      <SignOutForm>
        <button type="submit">Sign out</button>
      </SignOutForm>
    );
    root.render(clerk ? <ClerkOn>{button}</ClerkOn> : button);
  });

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  signOut.mockClear();
});

describe("SignOutForm", () => {
  it("without Clerk, is a plain POST form to /api/logout, never a link", async () => {
    await mount(false);
    expect(form().getAttribute("action")).toBe("/api/logout");
    expect(form().getAttribute("method")).toBe("post");
    expect(host.querySelector("a")).toBeNull();
  });

  it("with Clerk, ends the passcode cookie, then Clerk's session, landing Home", async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 303 }));
    vi.stubGlobal("fetch", fetch);
    await mount(true);
    // Still a POST form to /api/logout, so it works before the page's script has loaded.
    expect(form().getAttribute("action")).toBe("/api/logout");
    await act(async () => void form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(fetch).toHaveBeenCalledWith("/api/logout", { method: "POST", redirect: "manual" });
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
    expect(fetch.mock.invocationCallOrder[0]).toBeLessThan(signOut.mock.invocationCallOrder[0]);
  });

  it("with Clerk, still ends Clerk's session when /api/logout cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new Error("offline"))));
    await mount(true);
    await act(async () => void form().dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: "/" });
  });
});
