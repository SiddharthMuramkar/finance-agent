import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// No browser here: hooks are stubbed so the buttons can be called as plain functions and their click handlers run.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (v: unknown) => [v, () => {}],
  useRef: () => ({ current: null }),
  useEffect: () => {},
}));

const { BackToPathButton, JumpButton, WhatComesNextButton } = await import("./jump-button");

const assign = vi.fn();
vi.stubGlobal("window", { location: { assign } });
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
afterEach(() => assign.mockClear());

// BackToPathButton returns a fragment whose first child is the button; JumpButton a div whose first child is it.
const clickOf = (el: ReactElement) => {
  const children = (el.props as { children: unknown }).children as unknown[];
  const button = (Array.isArray(children) ? children[0] : children) as ReactElement;
  return (button.props as { onClick: () => unknown }).onClick;
};

describe("Choosing a Topic on the Course Map", () => {
  it("Back to the default path opens the Study Workspace at /study", async () => {
    await clickOf(BackToPathButton())();
    expect(assign).toHaveBeenCalledWith("/study");
  });

  it("Study this Topic opens the Study Workspace at /study", async () => {
    await clickOf(JumpButton({ topicId: "bonds", title: "Bonds", unmet: [] }))();
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/study"));
  });

  it("What comes next chooses the current Topic and opens the Study Workspace at /study", async () => {
    await clickOf(WhatComesNextButton({ label: "Next Topic: Bond prices" }))();
    expect(fetch).toHaveBeenLastCalledWith("/api/jump", expect.objectContaining({ body: JSON.stringify({ next: true }) }));
    expect(assign).toHaveBeenCalledWith("/study");
  });
});
