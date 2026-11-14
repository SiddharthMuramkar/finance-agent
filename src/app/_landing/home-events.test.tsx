// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { HomeJoinEvents } from "./home-events";

// Spec 2026-11-12 E10: Join pressed, with the section it was pressed in, and nothing about the visitor.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const tracked = vi.hoisted(() => vi.fn());
vi.mock("../analytics", () => ({ track: tracked }));

describe("Join pressed", () => {
  it("is sent with the section of the Join button pressed, and for nothing else", async () => {
    const host = document.createElement("div");
    host.innerHTML = `
      <header data-home-section="header"><a href="#" data-join=""><span>Join early access</span></a></header>
      <section data-home-section="hero"><a href="#" data-join=""><span class="bars"></span><span>Join early access</span></a><a href="#" id="other">About</a></section>
      <section data-home-section="closing"><a href="#" data-join="">Join early access</a></section>`;
    document.body.append(host);
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<HomeJoinEvents />));
    for (const el of host.querySelectorAll<HTMLElement>("[data-join] span:last-child, #other, section[data-home-section='closing'] a")) {
      el.addEventListener("click", (e) => e.preventDefault());
      el.click();
    }
    expect(tracked.mock.calls).toEqual([
      ["home_join_pressed", { section: "header" }],
      ["home_join_pressed", { section: "hero" }],
      ["home_join_pressed", { section: "closing" }],
    ]);
    act(() => root.unmount());
    host.remove();
  });
});
