// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetView } from "@/app/widget-view";
import type { CaseData, CaseDataset } from "@/case-data/case-data";
import { widgetProblems } from "./check";
import { CaseDataProvider } from "./case-data-provider";

// The 11 Widget programs the Tutor wrote in the UX audit (3 Nov 2026), kept as they were. Saved Sessions and Notes
// store programs like these, so every later change to the Widget library must leave all of them drawing. Case Data
// never goes into git, so the cases below are synthetic: the right shape, made-up numbers.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DIR = join(process.cwd(), "src/widgets/fixtures/audit");
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".openui"))
  .sort();

/** Problems a fixture is known to have today. Each entry is a bug to remove, not a state to keep. */
const KNOWN_PROBLEMS: Record<string, string[]> = {};

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

const CASES: CaseData[] = [
  {
    caseId: "sensex-1992",
    asOf: "1992-03-31",
    revealed: false,
    datasets: [
      dataset("sensex-close", "Sensex (synthetic)", "index points", [
        ["1979-04-03", 100],
        ["1990-07-25", 1000],
        ["1991-12-31", 1900],
        ["1992-02-29", 3000],
        ["1992-03-31", 4200],
      ]),
    ],
  },
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

describe("the audit fixtures", () => {
  it("are the eleven programs of the audit", () => {
    expect(files).toHaveLength(11);
  });

  for (const file of files) {
    const code = readFileSync(join(DIR, file), "utf8");

    it(`${file} passes the Widget check (or shows only its known problems)`, () => {
      expect(widgetProblems(code)).toEqual(KNOWN_PROBLEMS[file] ?? []);
    });

    it(`${file} draws through the real library and renderer`, async () => {
      await act(async () => {
        root.render(
          <CaseDataProvider cases={CASES}>
            <WidgetView code={code} complete />
          </CaseDataProvider>,
        );
      });
      // Let the Queries settle.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(host.textContent).not.toContain("could not be drawn");
      expect(host.textContent?.trim().length).toBeGreaterThan(20);
    });
  }
});
