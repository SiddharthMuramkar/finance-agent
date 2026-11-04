// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseData, CaseDataset } from "@/case-data/case-data";
import { exploreWidgetFor } from "@/course/explore-widget";
import { loadCourseMap } from "@/course/map";
import type { Progress } from "@/course/navigator";
import { WIDGET_OPENED, writtenAheadFor } from "@/course/written-ahead";
import { Conversation, type Line } from "./conversation";

// Seam 2: Present value's annuity Widget, "What the annuity is worth today" (spec #119, "Widgets › Present value",
// the owner's Part 5), as the Study Workspace draws it at the explore step: shown by code, with Case Data from the
// page's cache. Until the Insight is settled the verdict and the break-even stay hidden; until the reveal the
// 30-year Treasury quick button and its Guided Task do. Drawn in a browser-like page (happy-dom), as only the browser
// fills a Widget's starting values in.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const map = loadCourseMap();
const topic = map.topic("present-value")!;
const noReview = { question: null, dueCount: 0, done: 0, cap: 5 };

const dataset = (id: string, label: string, unit: string, points: [string, number][]): CaseDataset => ({
  id,
  label,
  unit,
  source: `Source of ${id}`,
  sourceUrl: "https://example.com/",
  checkedOn: "2026-10-01",
  points: points.map(([date, value]) => ({ date, value })),
});
const cash = dataset("cash-option", "Cash option", "USD", [["2018-10-23", 877_800_000]]);
const beforeReveal: CaseData = {
  caseId: "mega-millions-2018",
  asOf: "2018-10-24",
  revealed: false,
  datasets: [cash, dataset("treasury-30-year", "30-year Treasury yield", "percent", [["2018-10-23", 3.32], ["2018-10-24", 3.33]])],
};
const afterReveal: CaseData = {
  ...beforeReveal,
  revealed: true,
  datasets: [cash, dataset("treasury-30-year", "30-year Treasury yield", "percent", [["2018-10-23", 3.32], ["2018-10-24", 3.33], ["2018-10-25", 3.38]])],
};

/** The Learner's place at Present value's explore step: the jackpot Check's concept done, the Insight `settled` or not. */
function atExplore(settled: boolean) {
  const progress: Progress = {
    currentTopicId: "present-value",
    topics: { "present-value": { step: "explore", passedChecks: [], revealShown: false, status: "in_progress", ...(settled ? { insight: "found" as const } : {}) } },
  };
  return exploreWidgetFor(map, progress);
}

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
  vi.unstubAllGlobals();
});

async function workspace({ settled = false, data = beforeReveal, initial = [] as Line[] } = {}) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === `/api/case-data/${data.caseId}` ? new Response(JSON.stringify(data), { status: 200 }) : new Response(JSON.stringify({ ok: true }), { status: 200 }),
    ),
  );
  const writtenAhead = writtenAheadFor(topic, [data]);
  const explore = atExplore(settled);
  await act(async () => {
    root.render(
      <Conversation
        initial={initial}
        quiz={null}
        pending={null}
        review={noReview}
        place={{ stage: "foundation", title: topic.title }}
        explore={explore && { ...explore, code: writtenAhead.find((w) => w.id === explore.id)!.code }}
        writtenAhead={writtenAhead}
        revealed={data.revealed ? [data.caseId] : []}
        insightSettled={settled}
      />,
    );
  });
  // The Case Data fetch answers, then the chart draws with it.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

const card = () => host.querySelector('[data-testid="widget-card"]')!;
const shown = () => card().textContent ?? "";
const button = (name: string) => [...card().querySelectorAll("button")].find((b) => b.textContent === name);
const ticks = () => [...card().querySelectorAll("[data-state]")].map((li) => li.getAttribute("data-state"));
const box = () => card().querySelector<HTMLInputElement>('input[type="number"][aria-label="Interest rate (discount rate), exact value"]')!;

async function click(target: HTMLElement) {
  await act(async () => target.click());
}

/** Types an exact rate into the number box and presses Enter, as a Learner does. */
async function typeRate(value: number) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(box(), String(value));
    box().dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => box().dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
}

const VERDICT = /the annuity is worth \$[\d.]+M (more|less) than the cash/;
const BREAK_EVEN = "At about 3.38%, the annuity and the cash are worth the same.";

describe("Present value's annuity Widget at the explore step", () => {
  it("is the one Widget code shows: the written-ahead annuity Widget, not the old explore Widget", async () => {
    await workspace();
    expect(host.querySelector('[data-testid="explore-chip"]')).not.toBeNull();
    expect(card().querySelector("h3")?.textContent).toBe("What the annuity is worth today");
    expect(host.textContent).not.toContain("Cash now or 30 yearly payments");
  });

  it("has a 0–10% rate in 0.01 steps from 5%, a 0% quick button and Reset back to 5%", async () => {
    await workspace();
    const range = card().querySelector<HTMLInputElement>('input[type="range"][aria-label="Interest rate (discount rate)"]')!;
    expect([range.min, range.max, range.getAttribute("step"), range.value]).toEqual(["0", "10", "0.01", "5"]);
    await click(button("0%")!);
    expect(range.value).toBe("0");
    await click(button("Reset")!);
    expect(range.value).toBe("5");
  });

  it("draws payment years 2018 to 2047, labelled every 5 years, on a $ millions axis, with a read per bar", async () => {
    await workspace();
    const years = [...card().querySelectorAll('[data-testid="chart-x-label"]')].map((l) => l.textContent);
    expect(years).toEqual(["2018", "2023", "2028", "2033", "2038", "2043"]);
    expect(card().querySelector('[data-testid="chart-y-name"]')?.textContent).toContain("$ millions");
    // The thirty bars are one control: a single tab stop that the arrow keys, Home and End step through.
    const slider = card().querySelector<SVGRectElement>('svg [role="slider"]')!;
    expect(card().querySelectorAll("svg [tabindex='0']")).toHaveLength(1);
    expect(slider.getAttribute("aria-valuetext")).toMatch(/^Payment in 2047: /);
    const key = async (k: string) => act(async () => void slider.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true })));
    await key("Home");
    expect(card().querySelector('[data-testid="chart-readout"]')?.textContent).toMatch(/^Payment in 2018: /);
    for (let i = 0; i < 11; i++) await key("ArrowRight");
    expect(card().querySelector('[data-testid="chart-readout"]')?.textContent).toMatch(/^Payment in 2029: \$[\d.]+M paid → worth \$[\d.]+M today$/);
    await key("End");
    expect(slider.getAttribute("aria-valuetext")).toMatch(/^Payment in 2047: /);
  });

  it("reads out the sum of payments, the worth today (teal) and the sourced cash option (amber), with labelled bars", async () => {
    await workspace();
    await typeRate(3.33);
    expect(shown()).toContain("Sum of payments: $1.537 billion");
    expect(card().querySelector('[data-kind="assumption"] [data-testid="pv-total"]')?.textContent).toBe("$884.1 million");
    expect(card().querySelector('[data-kind="sourced"]')?.textContent).toContain("Cash option");
    expect(shown()).toContain("Annuity, worth today: $884.1M");
    expect(shown()).toContain("Cash option: $877.8M");
  });

  it("hides the verdict and the break-even before the Insight is settled, at 3.33 and at 3.38", async () => {
    await workspace();
    await typeRate(3.33);
    expect(shown()).not.toMatch(VERDICT);
    await typeRate(3.38);
    expect(shown()).not.toMatch(VERDICT);
    expect(shown()).not.toContain("3.38%, the annuity and the cash");
    expect(button("Show me")).toBeUndefined();
  });

  it("after the Insight, says by code how far the annuity is above the cash, flipping past break-even, where the line shows", async () => {
    await workspace({ settled: true });
    await typeRate(3.33);
    expect(shown()).toContain("At 3.33%, the annuity is worth $6.3M more than the cash");
    expect(shown()).not.toContain(BREAK_EVEN);
    await typeRate(3.38);
    expect(shown()).toMatch(/At 3\.38%, the annuity is worth \$0\.\dM less than the cash/);
    expect(shown()).toContain(BREAK_EVEN);
    await typeRate(4);
    expect(shown()).not.toContain(BREAK_EVEN);
  });

  it("after the Insight, shows the break-even on Show me, offered only once the Learner has tried a rate", async () => {
    await workspace({ settled: true });
    expect(button("Show me")).toBeUndefined();
    await typeRate(4.5);
    await click(button("Show me")!);
    expect(shown()).toContain(BREAK_EVEN);
  });

  it("before the reveal has no 30-year Treasury quick button or task", async () => {
    await workspace({ settled: true });
    expect(shown()).not.toMatch(/Treasury|3\.33/);
  });

  it("ticks its Guided Tasks itself: 0%, within 0.02% of break-even, and after the reveal the Treasury's rate from Case Data", async () => {
    await workspace({ data: afterReveal });
    expect(ticks()).toEqual(["current", "todo", "todo"]);
    await click(button("0%")!);
    expect(ticks()).toEqual(["done", "current", "todo"]);
    await typeRate(3.35);
    expect(ticks()).toEqual(["done", "current", "todo"]);
    await typeRate(3.36);
    expect(ticks()).toEqual(["done", "done", "current"]);
    await click(button("3.33% (30-yr Treasury, 24 Oct 2018)")!);
    expect(box().value).toBe("3.33");
    expect(ticks()).toEqual(["done", "done", "done"]);
  });

  it("is the same Widget when the Tutor reopens it: one tab, its chip pointing at it", async () => {
    await workspace({ initial: [{ role: "item", kind: WIDGET_OPENED, data: { id: "annuity-worth-today" } }] });
    const tabs = [...host.querySelectorAll('[aria-label="Widgets in this Session"] button')];
    expect(tabs).toHaveLength(1);
    expect(host.textContent).toContain("Open: What the annuity is worth today →");
  });
});
