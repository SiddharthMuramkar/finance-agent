// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { SiteJoinEvents } from "./join-events";

// Spec 2026-11-12 E10, kept for the Signal site: Join pressed, with the place it was pressed in, and nothing about the visitor.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tracked = vi.hoisted(() => vi.fn());
vi.mock("@/app/analytics", () => ({ track: tracked }));

describe("Join pressed", () => {
  it("is sent with the place of the Join button pressed, and for nothing else", async () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <header data-site-section="nav"><a href="#" data-join=""><span>Join the waitlist</span></a></header>
      <section data-site-section="hero"><a href="#" data-join=""><span class="bars"></span><span>Join the waitlist</span></a><a href="#" id="other">About</a></section>
      <section data-site-section="closing"><a href="#" data-join="">Join the waitlist</a></section>`;
    document.body.append(host);
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<SiteJoinEvents />));
    for (const el of host.querySelectorAll<HTMLElement>("[data-join] span:last-child, #other, section[data-site-section='closing'] a")) {
      el.addEventListener("click", (e) => e.preventDefault());
      el.click();
    }
    expect(tracked.mock.calls).toEqual([
      ["home_join_pressed", { section: "nav" }],
      ["home_join_pressed", { section: "hero" }],
      ["home_join_pressed", { section: "closing" }],
    ]);
    act(() => root.unmount());
    host.remove();
  });
});
