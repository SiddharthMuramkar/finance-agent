// @vitest-environment happy-dom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import WidgetsDevPage from "./page";
import { fixtureList, resolveFixture } from "./fixtures";

// The Widget harness: a developer page that draws a fixture through the real WidgetView, and answers 404 in production.

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => vi.unstubAllEnvs());

const open = (query: Record<string, string>) => WidgetsDevPage({ searchParams: Promise.resolve(query) });

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

describe("the Widget harness page", () => {
  it("answers 404 in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(open({ fixture: "01-sensex-milestones" })).rejects.toThrow("NEXT_NOT_FOUND");
    await expect(open({})).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("finds a fixture by its name, with or without its extension or folder", () => {
    expect(fixtureList().filter((f) => f.startsWith("audit/"))).toHaveLength(11);
    expect(resolveFixture("01-sensex-milestones")).toBe("audit/01-sensex-milestones.openui");
    expect(resolveFixture("01-sensex-milestones.openui")).toBe("audit/01-sensex-milestones.openui");
    expect(resolveFixture("audit/01-sensex-milestones.openui")).toBe("audit/01-sensex-milestones.openui");
    expect(resolveFixture("../../package.json")).toBeUndefined();
  });

  it("lists every fixture, with a link at each of the five widths (360, 480, 560, 720, 860)", async () => {
    const { host, done } = await draw({});
    const all = fixtureList();
    expect(all.length).toBeGreaterThanOrEqual(11);
    expect(host.querySelectorAll("[data-fixture]")).toHaveLength(all.length);
    const links = [...host.querySelectorAll("[data-fixture] a")].map((a) => a.getAttribute("href"));
    expect(links).toHaveLength(all.length * 5);
    for (const width of [360, 480, 560, 720, 860]) {
      expect(links).toContain(`/dev/widgets?fixture=07-sip-1000-month.openui&width=${width}`);
    }
    await done();
  });

  it("shows the button sheet: every variant at rest, hover, pressed, focus and disabled", async () => {
    const { host, done } = await draw({});
    const sheet = host.querySelector<HTMLElement>("section#buttons")!;
    expect(sheet).not.toBeNull();
    for (const variant of ["primary", "secondary", "danger", "small", "icon", "chip", "link", "tag"]) {
      const row = sheet.querySelector<HTMLElement>(`[data-variant="${variant}"]`);
      expect(row, variant).not.toBeNull();
      const states = [...row!.querySelectorAll("[data-state-cell]")].map((c) => c.getAttribute("data-state-cell"));
      expect(states, variant).toEqual(["rest", "hover", "pressed", "focus", "disabled"]);
    }
    expect(sheet.querySelectorAll('[data-variant="primary"] [data-force="pressed"]')).toHaveLength(1);
    expect(sheet.querySelector('[data-variant="primary"] button:disabled')).not.toBeNull();
    await done();
  });

  it("draws a fixture in a frame with the Study aside's and card's test ids, at the asked width", async () => {
    const { host, done } = await draw({ fixture: "08-inflation-vada-pav.openui", width: "360", theme: "dark" });
    const pane = host.querySelector<HTMLElement>('aside[data-testid="widget-pane"]')!;
    expect(pane.style.width).toBe("360px");
    expect(pane.querySelector('section[data-testid="widget-card"]')).not.toBeNull();
    expect(pane.textContent).not.toContain("could not be drawn");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await done();
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });
});
