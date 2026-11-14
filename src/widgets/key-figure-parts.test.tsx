// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetView } from "@/app/widget-view";
import type { CaseData, CaseDataset } from "@/case-data/case-data";
import { CaseDataProvider } from "./case-data-provider";
import { click, key, setRange } from "./primitives/wave1/test-kit";

/**
 * One key figure per Widget (spec 2026-11-11, A3b, R18): every part fixture, drawn through the real library and renderer,
 * has at most one lead [data-key-figure], and it sits on the element the spec's key-figure table names.
 */

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Case Data never goes into git, so these are synthetic: the shape of the audit's cases, made-up numbers
// (the same cases as legacy-fixtures.test.tsx).
const dataset = (id: string, label: string, unit: string, points: [string, number][]): CaseDataset => ({
  id,
  label,
  unit,
  source: "Synthetic test data",
  sourceUrl: "https://example.com/",
  checkedOn: "2026-01-01",
  points: points.map(([date, value]) => ({ date, value })),
});
const monthly = (year: number, n: number, start: number, step: number): [string, number][] =>
  Array.from({ length: n }, (_, i) => {
    const month = year * 12 + i;
    return [`${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, "0")}-15`, start + step * i];
  });
const SENSEX: [string, number][] = [
  ["1979-04-03", 100],
  ["1990-07-25", 1000],
  ["1991-12-31", 1900],
  ["1992-02-29", 3000],
  ["1992-03-31", 4200],
];
const CASES: CaseData[] = [
  { caseId: "sensex-1992", asOf: "1992-03-31", revealed: false, datasets: [dataset("sensex-close", "Sensex (synthetic)", "index points", SENSEX)] },
  {
    caseId: "mega-millions-2018",
    asOf: "2018-10-24",
    revealed: false,
    datasets: [
      dataset("advertised-annuity", "Advertised annuity (synthetic)", "USD", [["2018-10-23", 1_600_000_000]]),
      dataset("cash-option", "Cash option (synthetic)", "USD", [["2018-10-23", 900_000_000]]),
      dataset("treasury-30-year", "30-year Treasury (synthetic)", "percent", monthly(2018, 4, 3.1, 0.05)),
    ],
  },
];

const DIR = join(process.cwd(), "src/widgets/fixtures/parts");
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".openui"))
  .sort();
const LEAD = "[data-key-figure]:not([data-key-figure-extra])";

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

const fixture = (name: string, group = "parts") => readFileSync(join(process.cwd(), "src/widgets/fixtures", group, `${name}.openui`), "utf8");

async function render(name: string, group = "parts", cases = CASES, revealed: string[] = []) {
  await draw(fixture(name, group), cases, revealed);
}

async function draw(code: string, cases = CASES, revealed: string[] = []) {
  await act(async () => {
    root.render(
      <CaseDataProvider cases={cases} revealed={revealed}>
        <WidgetView code={code} complete />
      </CaseDataProvider>,
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}
const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
const button = (text: string) => [...host.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) ?? null;
const byId = (testId: string) => host.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
const leads = () => [...host.querySelectorAll<HTMLElement>(LEAD)];

describe("each part fixture at rest", () => {
  it("reads the part fixtures", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const file of files) {
    it(`${file} has at most one lead key figure`, async () => {
      await render(file.replace(/\.openui$/, ""));
      expect(host.textContent).not.toContain("could not be drawn");
      expect(leads().length).toBeLessThanOrEqual(1);
    });
  }

  const BY_TEST_ID: Record<string, string> = {
    stat: "stat-value",
    "price-tag": "price-tag-later-value",
    "shrinking-note": "shrinking-note-worth",
    versus: "versus-chip",
    verdict: "verdict-text",
    "rate-move": "rate-move-new",
    "rate-move-practice": "rate-move-new",
  };
  for (const [name, testId] of Object.entries(BY_TEST_ID)) {
    it(`${name}: the key figure is ${testId}`, async () => {
      await render(name);
      expect(leads()).toHaveLength(1);
      expect(leads()[0].getAttribute("data-testid")).toBe(testId);
    });
  }

  const BY_TEXT: Record<string, string> = { "lingo-card": "Yield", headline: "Central bank tightens pressure on reserve positions" };
  for (const [name, text] of Object.entries(BY_TEXT)) {
    it(`${name}: the key figure is "${text}"`, async () => {
      await render(name);
      expect(leads()).toHaveLength(1);
      expect(leads()[0].textContent?.trim()).toBe(text);
    });
  }

  const NONE = ["story-scene", "timeline-strip", "two-paths", "money-jar", "who-pays-whom", "myth-or-fact", "choice-cards", "waffle", "pictogram", "money-stack", "waterfall"];
  for (const name of NONE) {
    it(`${name} has no key figure: its answer is the picture, the story or a sentence`, async () => {
      await render(name);
      expect(host.querySelectorAll("[data-key-figure]")).toHaveLength(0);
    });
  }
});

describe("the key figure that shows after an interaction", () => {
  it("Breakeven: breakeven-found, once the rate is found", async () => {
    await render("breakeven");
    expect(byId("breakeven-found")).toBeNull();
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    // A drag rests on the opening 3% within 12 pixels of it (spec 2026-11-12, B5), so the hunt near it goes by arrow key.
    for (let rate = 0; rate <= 10 && !byId("breakeven-found"); rate = Math.round((rate + 0.1) * 10) / 10) {
      setRange(slider, rate);
      await settle();
    }
    setRange(slider, 3);
    for (let press = 0; press < 100 && !byId("breakeven-found"); press++) {
      key(slider, "ArrowUp");
      await settle();
    }
    expect(leads().map((el) => el.getAttribute("data-testid"))).toEqual(["breakeven-found"]);
  });

  it("Predict: predict-result, after Lock in, when the actual is known", async () => {
    await render("predict");
    click(button("Lock in my guess"));
    await settle();
    expect(leads().map((el) => el.getAttribute("data-testid"))).toEqual(["predict-result"]);
  });

  it("QuickCheck: the verdict word, after a tap", async () => {
    await render("quick-check");
    click(byId("quick-check-option-0"));
    await settle();
    expect(leads()).toHaveLength(1);
    expect(["Right.", "Not quite.", "Noted."]).toContain(leads()[0].textContent);
  });

  it("Rank: rank-result, after Check the order", async () => {
    await render("rank");
    click(button("Check the order"));
    await settle();
    expect(leads().map((el) => el.getAttribute("data-testid"))).toEqual(["rank-result"]);
  });

  it("DrawTheLine: draw-result, after the reveal, when what happened is known", async () => {
    const sensex = { caseId: "sensex-1992", asOf: "1992-03-31", revealed: true, datasets: [dataset("sensex-close", "Sensex (synthetic)", "index points", [["1979-04-03", 100], ["1990-07-25", 1000], ["1991-12-31", 1900], ["1992-02-29", 3000], ["1992-03-31", 4200], ["1993-03-31", 2500], ["1994-03-31", 3500], ["1996-03-31", 3300], ["1999-03-31", 3700]] as [string, number][])] };
    await render("draw-the-line", "parts", [sensex], ["sensex-1992"]);
    for (const slice of [...host.querySelectorAll('[data-testid="draw-slice"]')]) key(slice, "ArrowUp");
    await settle();
    click(button("Show me what happened"));
    await settle();
    expect(byId("draw-result")?.textContent).toContain("Your line was");
    expect(leads().map((el) => el.getAttribute("data-testid"))).toEqual(["draw-result"]);
  });

  it("StepThrough: step-ask-result, after Show the number, and none before", async () => {
    await render("step-through");
    click(button("Next"));
    click(button("Next"));
    await settle();
    expect(leads()).toHaveLength(0);
    click(button("Show the number"));
    await settle();
    expect(leads().map((el) => el.getAttribute("data-testid"))).toEqual(["step-ask-result"]);
  });
});

describe("the audit fixtures' key figures", () => {
  it("a Calculator's is its first result's value", async () => {
    await render("07-sip-1000-month", "audit");
    const first = host.querySelector('[data-testid="calculator"] dd');
    expect(leads()).toEqual([first]);
  });

  it("a Formula Card's is its first output's worked value", async () => {
    // No audit fixture holds a Formula Card, so this draws the one formula-card.test.tsx draws.
    await draw('root = Widget("PV", [card])\ncard = FormulaCard("present-value", {}, {}, {amount: 1000, ratePercent: 10, years: 5})');
    const first = host.querySelector('[data-testid="formula-output"] dd:last-child');
    expect(leads()).toEqual([first]);
  });

  it("an AnnuityChart's is pv-total", async () => {
    await render("06-lottery-breakeven", "audit");
    expect(leads().map((el) => el.getAttribute("data-testid"))).toEqual(["pv-total"]);
  });
});
