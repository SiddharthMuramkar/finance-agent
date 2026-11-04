// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetView } from "@/app/widget-view";
import type { CaseData, CaseDataset } from "@/case-data/case-data";
import { archetypeOf, newReplyWidgetProblems, widgetCheckMessage, widgetProblems, widgetRuleProblems, widgetWarnings, LEAVE_OUT } from "./check";
import { CaseDataProvider } from "./case-data-provider";
import frozen from "./frozen.generated.json";
import { widgetLibrary } from "./library";
import { WAVE1_PARTS } from "./primitives/wave1";
import { WAVE2_PARTS } from "./primitives/wave2";

// The Widget language v2 (UX audit §7.2 to §7.6): the 16 new parts registered in the real library, the archetype
// of a Widget, warnings that ride along with the next turn instead of a correction round, and the hard errors kept
// for correctness.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const PARTS_DIR = join(process.cwd(), "src/widgets/fixtures/parts");
const AUDIT_DIR = join(process.cwd(), "src/widgets/fixtures/audit");
const read = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".openui"))
    .sort()
    .map((file) => ({ file, code: readFileSync(join(dir, file), "utf8") }));
const PARTS = read(PARTS_DIR);
const AUDIT = read(AUDIT_DIR);
const NEW = [...WAVE1_PARTS, ...WAVE2_PARTS].map((p) => p.name);
const fence = (code: string) => "```openui-lang\n" + code + "\n```";

// Synthetic Case Data (Case Data never goes into git): the right shape, made-up numbers.
const dataset = (id: string, unit: string, points: [string, number][]): CaseDataset => ({
  id,
  label: `${id} (synthetic)`,
  unit,
  source: "Synthetic test data",
  sourceUrl: "https://example.com/",
  checkedOn: "2026-01-01",
  points: points.map(([date, value]) => ({ date, value })),
});
const CASES: CaseData[] = [
  {
    caseId: "sensex-1992",
    asOf: "1992-03-31",
    revealed: false,
    datasets: [dataset("sensex-close", "index points", [["1979-04-03", 100], ["1990-07-25", 1000], ["1992-03-31", 4200]])],
  },
  {
    caseId: "mega-millions-2018",
    asOf: "2018-10-24",
    revealed: false,
    datasets: [
      dataset("cash-option", "USD", [["2018-10-23", 900_000_000]]),
      dataset("treasury-30-year", "percent", [["2018-10-01", 3.2], ["2018-10-23", 3.3]]),
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

describe("the 16 new parts", () => {
  it("are registered in the Widget library, with Step as StepThrough's child", () => {
    expect(NEW).toHaveLength(16);
    for (const name of [...NEW, "Step"]) expect(Object.keys(widgetLibrary.components), name).toContain(name);
  });

  it("may sit directly in a Widget, a Card, a TabItem and an AccordionItem", () => {
    const signature = (name: string) => frozen.instructions.split("\n").find((line) => line.startsWith(`${name}(`)) ?? "";
    for (const container of ["Widget", "Card", "TabItem", "AccordionItem"]) {
      for (const name of NEW) expect(signature(container), `${name} in ${container}`).toMatch(new RegExp(`\\b${name}\\b`));
    }
    const inCard = 'root = Widget("Is it in a card?", [card])\ncard = Card([s])\ns = Stat("Rate", 5, "percent")';
    expect(widgetProblems(inCard)).toEqual([]);
  });

  it("each have a fixture", () => {
    for (const name of NEW) expect(PARTS.some(({ code }) => code.includes(`${name}(`)), name).toBe(true);
  });

  for (const { file, code } of PARTS) {
    it(`${file} passes the Widget check and draws through the real library and renderer`, async () => {
      expect(widgetProblems(code)).toEqual([]);
      await act(async () => {
        root.render(
          <CaseDataProvider cases={CASES}>
            <WidgetView code={code} complete />
          </CaseDataProvider>,
        );
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(host.textContent).not.toContain("could not be drawn");
      expect(host.textContent?.trim().length).toBeGreaterThan(10);
    });
  }
});

describe("archetypeOf", () => {
  const archetypes = Object.fromEntries(PARTS.map(({ file, code }) => [file.replace(".openui", ""), archetypeOf(code)]));

  it("names a Widget's archetype from its parts, as the recipes name theirs", () => {
    expect(archetypes).toMatchObject({
      "quick-check": "Check",
      predict: "Predict",
      "draw-the-line": "Predict",
      rank: "Rank",
      "step-through": "Chain",
      versus: "Compare",
      breakeven: "Compare",
      verdict: "Compare",
      waffle: "Convert",
      pictogram: "Convert",
      "money-stack": "Grow",
      "price-tag": "Grow",
      stat: "Grow",
    });
  });

  it("reads the old Widgets too: the samey skeleton of the audit is mostly Grow and Compare", () => {
    const old = AUDIT.map(({ code }) => archetypeOf(code));
    expect(old.filter(Boolean).length).toBeGreaterThanOrEqual(8);
    expect(archetypeOf(AUDIT.find((f) => f.file.startsWith("01-"))!.code)).toBe("History");
  });

  it("is null for code that does not parse or has no clear shape", () => {
    expect(archetypeOf("not openui")).toBeNull();
    expect(archetypeOf('root = Widget("Hello?", [t])\nt = TextContent("Hi")')).toBeNull();
  });
});

describe("hard errors, kept for correctness", () => {
  it("refuse a QuickCheck answer out of range, or too few options", () => {
    const q = (options: string, answer: number) => `root = Widget("Which?", [q])\n$q = -1\nq = QuickCheck("Which?", ${options}, ${answer}, "Why.", $q)`;
    expect(widgetProblems(q('["A", "B"]', 1))).toEqual([]);
    expect(widgetProblems(q('["A", "B"]', -1))).toEqual([]);
    expect(widgetProblems(q('["A", "B"]', 2)).join()).toMatch(/QuickCheck answer 2 is outside -1 to 1/);
    expect(widgetProblems(q('["A"]', 0)).join()).toMatch(/2 to 4 options/);
  });

  it("refuse a Rank whose order does not list every item once", () => {
    const rank = (order: string) => `root = Widget("Which order?", [r])\nr = Rank("Order", ["A", "B"], ${order}, ["a", "b"], "Low", "High")`;
    expect(widgetProblems(rank("[0, 1]"))).toEqual([]);
    expect(widgetProblems(rank("[0, 0]")).join()).toMatch(/correctOrder/);
  });

  it("are none for the audit's eleven Widgets", () => {
    for (const { file, code } of AUDIT) expect(widgetProblems(code), file).toEqual([]);
  });
});

describe("warnings ride along with the next turn", () => {
  it("count the information budget, a number joined into text, and a Pictogram object we do not draw", () => {
    const quiz = AUDIT.find((f) => f.file.startsWith("10-"))!.code;
    const warnings = widgetWarnings(quiz).join("\n");
    expect(warnings).toMatch(/controls are showing/);
    expect(warnings).toMatch(/words of text/);
    expect(warnings).toMatch(/score: a number is joined into text with \+/);
    const pictogram = 'root = Widget("How many?", [p])\np = Pictogram("spaceship", 3, "Ships")';
    expect(widgetWarnings(pictogram).join()).toMatch(/no "spaceship"/);
    expect(widgetWarnings('root = Widget("Who wins?", [v])\nv = Versus("A", 1, "B", 2, "inr")').join()).toMatch(/both Versus values are typed/);
  });

  it("say nothing about a Widget within the budget", () => {
    for (const name of ["stat", "verdict", "versus", "quick-check", "money-stack", "breakeven"]) {
      expect(widgetWarnings(PARTS.find((f) => f.file === `${name}.openui`)!.code), name).toEqual([]);
    }
  });

  it("never start a correction round", () => {
    const quiz = AUDIT.find((f) => f.file.startsWith("10-"))!.code;
    expect(widgetWarnings(quiz).length).toBeGreaterThan(0);
    expect(newReplyWidgetProblems(`Try these.\n\n${fence(quiz)}`)).toEqual([]);
  });
});

describe("the Widget rules, v2", () => {
  it("need no Guided Task beside a slider when a Breakeven or Predict is the discovery", () => {
    const breakeven = PARTS.find((f) => f.file === "breakeven.openui")!.code;
    expect(widgetRuleProblems(breakeven)).toEqual([]);
    const statOnly = PARTS.find((f) => f.file === "stat.openui")!.code;
    expect(widgetRuleProblems(statOnly).join()).toMatch(/no Guided Task/);
  });

  it("let two Widgets draw the same reference data, but not the same Case Data", () => {
    const drawing = (title: string, dataset: string) => `root = Widget("${title}", [h])\nh = HistoryChart("${dataset}")`;
    expect(widgetRuleProblems(drawing("Rupee in 2008?", "reference/usd-inr"), [drawing("Rupee now?", "reference/usd-inr")])).toEqual([]);
    expect(widgetRuleProblems(drawing("Sensex again?", "sensex-1992/sensex-close"), [drawing("Sensex?", "sensex-1992/sensex-close")]).join()).toMatch(/Update that Widget instead/);
  });

  it("leave out a fence in a reply that already showed a Widget through show_widget", () => {
    const stat = PARTS.find((f) => f.file === "stat.openui")!.code;
    const reply = `Look at this.\n\n${fence(stat)}`;
    const broken = newReplyWidgetProblems(reply, [], [], true);
    expect(broken).toEqual([{ index: 0, problems: [expect.stringContaining(LEAVE_OUT)], leaveOut: true }]);
    expect(widgetCheckMessage(broken)).toMatch(/Write no openui-lang block/);
    expect(newReplyWidgetProblems(`No widget here.`, [], [], true)).toEqual([]);
  });
});
