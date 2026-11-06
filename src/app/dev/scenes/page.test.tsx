// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import ScenesDevPage from "./page";

// /dev/scenes (E3): a Topic's scenes, its terms as Lingo cards and its Running-example scene, drawn by the
// real renderer with no database. It does not exist in production. E6's screenshots and critics use it.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.unstubAllEnvs());

const open = (query: Record<string, string>) => ScenesDevPage({ searchParams: Promise.resolve(query) });

async function draw(query: Record<string, string>) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const page = await open(query);
  await act(async () => root.render(page));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return { host, done: () => act(() => root.unmount()) };
}

describe("the scenes dev page", () => {
  it("answers 404 in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(open({ topic: "scene-fixture" })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(open({})).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("answers 404 for a Topic that is not there", async () => {
    await expect(open({ topic: "no-such-topic" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("lists the fixture Topic (and any real Topic with scenes) when no Topic is asked for", async () => {
    const { host, done } = await draw({});
    const links = [...host.querySelectorAll("[data-testid='scene-index'] a")].map((a) => a.getAttribute("href"));
    expect(links).toContain("/dev/scenes?topic=scene-fixture");
    await done();
  });

  it("draws the fixture Topic's scenes in step order, its terms as Lingo cards, and its Running-example scene", async () => {
    const { host, done } = await draw({ topic: "scene-fixture" });
    const scenes = [...host.querySelectorAll("[data-testid='dev-scene']")];
    expect(scenes.map((s) => s.getAttribute("data-recipe"))).toEqual([
      "story_scene",
      "lingo_card",
      "two_paths",
      "who_pays_whom",
      "money_jar",
      "choice_cards",
      "myth_or_fact",
      "headline",
      "timeline",
    ]);
    expect(host.querySelector("[data-testid='story-scene']")).not.toBeNull();
    expect(host.querySelector("[data-testid='headline']")).not.toBeNull();
    expect(host.querySelector("[data-testid='dev-running-scene'] [data-testid='story-scene']")).not.toBeNull();
    expect(host.querySelectorAll("[data-testid='dev-terms'] [data-testid='lingo-card']")).toHaveLength(2);
    expect(host.textContent).not.toContain("could not be drawn");
    await done();
  });

  it("draws present-value with an honest empty state until E6a writes its scenes", async () => {
    const { host, done } = await draw({ topic: "present-value" });
    expect(host.querySelector("h1")?.textContent).toContain("Present value");
    expect(host.querySelector("[data-testid='no-scenes']")).not.toBeNull();
    await done();
  });
});
