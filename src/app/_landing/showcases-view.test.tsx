// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveWidget } from "./live-widget";
import { loadShowcases } from "./showcase-widgets";

// D3 test 6: Home's three Showcase Widgets in a browser-like page (happy-dom), as a visitor plays with them. They are
// built from Topic files and need no Case Data, so the browser never asks the server for anything.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const showcases = loadShowcases();
let root: Root;
let host: HTMLElement;
const fetchSpy = vi.fn(async () => new Response("{}", { status: 401 }));

beforeEach(async () => {
  vi.stubGlobal("fetch", fetchSpy);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <>
        {showcases.map((showcase) => (
          <LiveWidget key={showcase.id} code={showcase.code} testId="showcase-widget" />
        ))}
      </>,
    ),
  );
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
});

const frames = () => [...host.querySelectorAll<HTMLElement>('[data-testid="showcase-widget"]')];

describe("Home's three Showcase Widgets", () => {
  it("draw all three, each with its Widget's title", () => {
    expect(frames()).toHaveLength(3);
    frames().forEach((frame, i) => expect(frame.textContent, showcases[i].id).toContain(showcases[i].title));
  });

  // E6: the first is a picture of growth, not a Formula Card: ₹1,000 at 10% for 3 years grows to ₹1,331, as the card's
  // own line says, drawn as the ₹1,000 put in and the ₹331 it earned.
  it("the picture of growth starts at ₹1,000 put in and ₹331 earned, with no Formula Card", () => {
    expect(frames()[0].textContent).toContain("Amount ₹1,000");
    expect(frames()[0].textContent).toContain("Growth ₹331");
    expect(frames()[0].querySelector('[data-testid="formula-output"]')).toBeNull();
  });

  it("the story steps to its second beat when the visitor presses Next", async () => {
    const story = frames()[2];
    // The stepped bubble (a narrow frame's form; a wide one lists every beat instead, spec 2026-11-12 B8).
    expect(story.querySelector('[data-testid="story-bubble"]')?.textContent).not.toContain("Over seven years to $1 billion run-rate");
    await act(async () => story.querySelector<HTMLButtonElement>('[data-testid="story-next"]')!.click());
    expect(story.querySelector('[data-testid="story-bubble"]')?.textContent).toContain("Over seven years to $1 billion run-rate");
  });

  it("never calls fetch while drawn or played", async () => {
    await act(async () => frames()[2].querySelector<HTMLButtonElement>('[data-testid="story-next"]')!.click());
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
