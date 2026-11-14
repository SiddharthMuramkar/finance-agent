// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AboutView } from "./about";
import { aboutCopy } from "./about-copy";
import { loadShowcases } from "./showcase-widgets";

// D4 test 6: the About page's two live Widgets (the everyday and the news Showcases' Widgets) in a browser-like page.
// They are drawn by code from Topic files, so the page asks the server for nothing.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const widgets = loadShowcases().filter((s) => s.area === "everyday" || s.area === "economy");
let root: Root;
let host: HTMLElement;
const fetchSpy = vi.fn(async () => new Response("{}", { status: 401 }));

beforeEach(async () => {
  vi.stubGlobal("fetch", fetchSpy);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<AboutView stats={{ topics: 95, subjects: 9 }} widgets={widgets} />));
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

describe("The About page's two live Widgets", () => {
  it("draw their titles with no request", () => {
    const frames = [...host.querySelectorAll<HTMLElement>('[data-testid="about-widget"]')];
    expect(frames).toHaveLength(2);
    expect(frames[0].textContent).toContain("What ₹1,000 grows to at 10% a year");
    expect(frames[1].textContent).toContain(widgets[1].title);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("each sits right after the caption Example numbers. Move them., which is outside the frame", () => {
    expect(aboutCopy.widgets.caption).toBe("Example numbers. Move them.");
    for (const frame of host.querySelectorAll<HTMLElement>('[data-testid="about-widget"]')) {
      const caption = frame.previousElementSibling;
      expect(caption?.textContent).toBe("Example numbers. Move them.");
      expect(frame.textContent).not.toContain("Example numbers. Move them.");
    }
  });
});
