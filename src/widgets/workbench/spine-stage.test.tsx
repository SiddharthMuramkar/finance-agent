// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { exploreWidgetOf } from "@/course/explore-widget";
import { loadCourseMap } from "@/course/map";
import { setRange } from "../primitives/wave1/test-kit";

// Spine critics round 1 on #96 (widget fit): every Spine Topic 9 to 15 explore Workbench draws a piece that is not a chart
// (a cast that reacts, a survive-or-fail fork, a story-to-lever map, an assumptions checklist, a Lingo card, a story
// moment), and that piece carries the Topic's own idea. Drawn through the real Widget library from each Topic file.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const map = loadCourseMap();
let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function draw(topicId: string) {
  const widget = exploreWidgetOf(map.topic(topicId)!);
  expect(widget).not.toBeNull();
  await act(async () => {
    root.render(<WidgetView code={widget!.code} complete />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
}
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`);
const text = (id: string) => q(id)?.textContent ?? "";
const lever = (label: string) => host.querySelector<HTMLInputElement>(`input[type="range"][aria-label="${label}"]`)!;

describe("Spine Topics 9 to 15: each explore Workbench draws its own idea, not only a chart", () => {
  it("Topic 10 (survival) puts the chance it fails first, as a survive-or-fail fork that moves with it", async () => {
    await draw("spine-10-survival");
    expect(q("value-levers-fork")).not.toBeNull();
    expect(text("value-levers-fork-survives")).toMatch(/Survives: 100 in 100/);
    expect(text("value-levers-fork-fails")).toMatch(/Fails: 0 in 100/);
    // The chance it fails is the first control at rest, never under More settings.
    const first = host.querySelector('[data-testid="value-levers-controls"] input[type="range"]');
    expect(first?.getAttribute("aria-label")).toBe("Chance it fails");
    expect(host.querySelector('[data-testid="value-levers-more"] input[aria-label="Chance it fails"]')).toBeNull();
    // The cast reacts.
    expect(q("value-levers-scene")).not.toBeNull();
    setRange(lever("Chance it fails"), 40);
    expect(text("value-levers-fork-fails")).toMatch(/Fails: 40 in 100/);
    expect(q("value-levers-scene")?.getAttribute("data-mood")).toBe("below");
  });

  it("Topic 11 (story to numbers) opens on the June story and maps each story's words to the lever it sets", async () => {
    await draw("spine-11-story-to-numbers");
    expect(text("value-levers-headline")).toMatch(/\$5\.8bn/);
    const rows = [...host.querySelectorAll('[data-testid="value-levers-map"] li')].map((li) => li.textContent);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatch(/20% slice.*How big it gets/);
    expect(rows[1]).toMatch(/not Gurley's \$300bn.*How big it gets/);
    expect(q("value-levers-scene")).not.toBeNull();
  });

  it("Topic 13 (what a price assumes) lists what the price assumes, lever by lever, against the story", async () => {
    await draw("spine-13-price-assumes");
    const items = host.querySelectorAll('[data-testid="value-levers-checklist"] li');
    expect(items.length).toBe(4);
    expect(text("value-levers-checklist")).toMatch(/Not yet at the price/);
    expect(q("value-levers-scene")).not.toBeNull();
  });

  it.each(["spine-14-being-wrong", "spine-15-value-yourself"])("%s has a cast that reacts to the value", async (id) => {
    await draw(id);
    expect(q("value-levers-scene")).not.toBeNull();
    expect(q("value-levers-scene")?.getAttribute("data-mood")).toMatch(/below|near|above/);
  });

  it("Topic 12 (price or value) shows a Lingo card for 'multiple' on the decoder", async () => {
    await draw("spine-12-price-or-value");
    expect(q("lingo-card")).not.toBeNull();
    expect(host.querySelector('[data-testid="lingo-card"]')?.getAttribute("aria-label")).toMatch(/multiple/i);
  });

  it("Topic 9 (to one share) tells who is paid before the shareholders as a story moment", async () => {
    await draw("spine-09-to-one-share");
    expect(q("story-scene")).not.toBeNull();
  });
});
