import type { CaseData, CaseDataset } from "@/case-data/case-data";

// Synthetic Case Data for the fixture Widgets: the right shape, made-up numbers, every label marked "(synthetic)". Real
// Case Data never goes into git. The fixture tests (legacy-fixtures.test.tsx) draw the audit programs with it, and the
// Widget harness (/dev/widgets) serves it when the owner's Case Data folder is missing, so the parts that read Case Data
// (Breakeven's marker, DrawTheLine's history) draw in CI and on a cloud machine too.

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

export const SYNTHETIC_CASES: CaseData[] = [
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
