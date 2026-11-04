// @vitest-environment happy-dom
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { archetypeOf } from "./check";
import { RankView } from "./primitives/wave2/rank";
import { QuickCheckView } from "./primitives/wave1/quick-check";
import { allById, byId, click, draw, redraw, type Page } from "./primitives/wave1/test-kit";

const q = (id: string) => `Query("case_data", {dataset: "${id}"}, {rows: [], label: "", unit: "", source: "", sourceUrl: "", asOf: "", revealed: false, error: ""})`;

describe("archetypeOf with a reference backdrop", () => {
  it("keeps a History Widget with a reference dataset a History", () => {
    const code = ['root = Widget("Sensex", [chart])', "chart = HistoryChart(a, b)", `a = ${q("sensex-1992/sensex-close")}`, `b = ${q("reference/usd-inr")}`].join("\n");
    expect(archetypeOf(code)).toBe("History");
  });
  it("still calls two real datasets a Compare", () => {
    const code = ['root = Widget("Two", [chart])', "chart = HistoryChart(a, b)", `a = ${q("sensex-1992/sensex-close")}`, `b = ${q("mega-millions-2018/cash-option")}`].join("\n");
    expect(archetypeOf(code)).toBe("Compare");
  });
});

let page: Page | null = null;
afterEach(() => {
  page?.cleanup();
  page = null;
});

const full = { prompt: "Order", items: ["A", "B", "C"], correctOrder: [0, 1, 2], reasons: ["a", "b", "c"], lowLabel: "low", highLabel: "high" };

describe("Rank follows its props", () => {
  it("shows every row once full props arrive after partial ones", () => {
    page = draw(<RankView {...full} items={["A"]} correctOrder={[]} reasons={[]} />);
    expect(allById(page, "rank-item")).toHaveLength(0);
    redraw(page, <RankView {...full} />);
    expect(allById(page, "rank-item")).toHaveLength(3);
  });
  it("never says all in the right place on an empty list", () => {
    page = draw(<RankView {...full} items={[]} correctOrder={[]} reasons={[]} />);
    expect(byId(page, "rank-result")).toBeNull();
    expect(page.host.textContent ?? "").not.toContain("All in the right place");
  });
});

describe("QuickCheck keeps focus", () => {
  it("moves focus to the first option after Try again", async () => {
    let picked = 1;
    const view = () => (
      <QuickCheckView
        question="Q"
        options={["x", "y"]}
        answer={0}
        why="w"
        picked={picked}
        onPick={(i) => {
          picked = i;
        }}
      />
    );
    page = draw(view());
    const again = [...page.host.querySelectorAll("button")].find((b) => b.textContent === "Try again")!;
    again.focus();
    click(again);
    redraw(page, view());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(document.activeElement).toBe(byId(page, "quick-check-option-0"));
  });
});
