import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";

// No browser here: hooks are stubbed so the buttons can be called as plain functions and their click handlers run.
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useState: (v: unknown) => [v, () => {}],
  useRef: () => ({ current: null }),
  useEffect: () => {},
}));

const { BackToPathButton, DoFirstLink, PrerequisiteConfirm, WhatComesNextButton } = await import("./jump-button");

const assign = vi.fn();
vi.stubGlobal("window", { location: { assign } });
vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true })));
afterEach(() => {
  assign.mockClear();
  vi.mocked(fetch).mockClear();
});

// BackToPathButton returns a fragment whose first child is the button; DoFirstLink one whose first child is the link.
const clickOf = (el: ReactElement) => {
  const children = (el.props as { children: unknown }).children as unknown[];
  const button = (Array.isArray(children) ? children[0] : children) as ReactElement;
  return (button.props as { onClick: (e?: { preventDefault(): void }) => unknown }).onClick;
};
const sent = () => JSON.parse((vi.mocked(fetch).mock.lastCall?.[1] as RequestInit).body as string);
const noDefault = { preventDefault: () => {} };

describe("Choosing a Topic on the Course Map", () => {
  it("Back to the default path opens the Study Workspace at /study", async () => {
    await clickOf(BackToPathButton())();
    expect(assign).toHaveBeenCalledWith("/study");
  });

  it("a Do first link chooses that Topic and opens the Study Workspace", async () => {
    await clickOf(DoFirstLink({ topicId: "pv", title: "Present value" }))(noDefault);
    expect(sent()).toEqual({ topicId: "pv" });
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("/study"));
  });

  it("What comes next chooses the current Topic and opens the Study Workspace at /study", async () => {
    await clickOf(WhatComesNextButton({ label: "Next Topic: Bond prices" }))();
    expect(sent()).toEqual({ next: true });
    expect(assign).toHaveBeenCalledWith("/study");
  });
});

describe("Study <prerequisite> first", () => {
  it("passes the first unpassed prerequisite to the warning's main button", () => {
    const onStudyFirst = vi.fn();
    const group = PrerequisiteConfirm({ title: "Bond prices", unmet: [{ id: "pv", title: "Present value" }], onStudyFirst, onGo: () => {}, onCancel: () => {} });
    const buttons = ((group.props as { children: ReactElement[] }).children[1].props as { children: ReactElement[] }).children;
    (buttons[0].props as { onClick: () => void }).onClick();
    expect(onStudyFirst).toHaveBeenCalledWith("pv");
  });
});
