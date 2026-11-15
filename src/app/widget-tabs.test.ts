import { describe, expect, it } from "vitest";
import { cappedTabs, MAX_TABS, sameTab, type TabWidget } from "./widget-tabs";
import { updatedInPlace, type WidgetItem } from "./widget-panel";

// Spec 2026-11-12 B6, ADR 0008: "The panel lists at most six Widgets. The seventh replaces the oldest that is neither
// written ahead nor showing. Opening the same recipe at new numbers updates its tab in place." Each expected list is
// written by hand from that rule.

const w = (n: number, extra: Partial<TabWidget> = {}): TabWidget => ({ key: `w${n}`, number: n, ...extra });
const keys = (tabs: readonly TabWidget[]) => tabs.map((t) => t.key);
const seven = [1, 2, 3, 4, 5, 6, 7].map((n) => w(n));

describe("cappedTabs", () => {
  it("lists six Widgets as they are", () => {
    expect(MAX_TABS).toBe(6);
    expect(keys(cappedTabs(seven.slice(0, 6), "w6"))).toEqual(["w1", "w2", "w3", "w4", "w5", "w6"]);
  });

  it("the seventh replaces the oldest", () => {
    expect(keys(cappedTabs(seven, "w7"))).toEqual(["w2", "w3", "w4", "w5", "w6", "w7"]);
  });

  it("skips a written-ahead Widget", () => {
    const list = [w(1, { writtenAhead: "rates" }), ...seven.slice(1)];
    expect(keys(cappedTabs(list, "w7"))).toEqual(["w1", "w3", "w4", "w5", "w6", "w7"]);
  });

  it("skips the Widget showing", () => {
    expect(keys(cappedTabs(seven, "w1"))).toEqual(["w1", "w3", "w4", "w5", "w6", "w7"]);
  });

  it("skips both, one arrival at a time", () => {
    const list = [w(1, { writtenAhead: "rates" }), ...[2, 3, 4, 5, 6, 7, 8].map((n) => w(n))];
    // 7th: w1 written ahead, w2 showing, so w3 leaves; 8th: w4 leaves.
    expect(keys(cappedTabs(list, "w2"))).toEqual(["w1", "w2", "w5", "w6", "w7", "w8"]);
  });

  it("keeps the explore Widget, which is written ahead", () => {
    const list = [w(1), w(0, { key: "explore", writtenAhead: "explore-id" }), ...[2, 3, 4, 5, 6].map((n) => w(n))];
    expect(keys(cappedTabs(list, "w6"))).toEqual(["explore", "w2", "w3", "w4", "w5", "w6"]);
  });

  it("when every other tab is written ahead, the oldest that is not showing leaves", () => {
    const ahead = [1, 2, 3, 4, 5, 6].map((n) => w(n, { writtenAhead: `a${n}` }));
    expect(keys(cappedTabs([...ahead, w(7)], "w7"))).toEqual(["w2", "w3", "w4", "w5", "w6", "w7"]);
    expect(keys(cappedTabs([...ahead, w(7)], "w1"))).toEqual(["w1", "w3", "w4", "w5", "w6", "w7"]);
  });

  it("never drops the Widget that just arrived", () => {
    const ahead = [1, 2, 3, 4, 5, 6].map((n) => w(n, { writtenAhead: `a${n}` }));
    expect(keys(cappedTabs([...ahead, w(7)], undefined))).toContain("w7");
  });

  it("counts a tab updated in place from its newest Widget", () => {
    // w2's tab now holds the 8th Widget (same recipe): it is the newest, so w1 and then w3 leave.
    const list = [w(1), w(8, { key: "w2" }), w(3), w(4), w(5), w(6), w(7), w(9)];
    expect(keys(cappedTabs(list, "w9"))).toEqual(["w2", "w4", "w5", "w6", "w7", "w9"]);
  });

  it("shows a Widget whose tab had left, when it shows again (its chip was pressed)", () => {
    expect(keys(cappedTabs(seven, "w1"))).toContain("w1");
    expect(keys(cappedTabs(seven, "w7"))).not.toContain("w1");
  });
});

describe("sameTab", () => {
  it("matches the same slider recipe at new numbers, or the same written-ahead Widget; never two Lingo cards", () => {
    expect(sameTab({ recipe: "rate_move", preset: { $old: 4 } }, { recipe: "rate_move", preset: { $old: 5 } })).toBe(true);
    // Two Lingo cards (no sliders) show different words, not new numbers: each keeps its own tab.
    expect(sameTab({ recipe: "lingo_card" }, { recipe: "lingo_card" })).toBe(false);
    expect(sameTab({ recipe: "story_scene", preset: {} }, { recipe: "story_scene", preset: {} })).toBe(false);
    expect(sameTab({ writtenAhead: "rates" }, { writtenAhead: "rates" })).toBe(true);
    expect(sameTab({ recipe: "rate_move", preset: { $x: 1 } }, { recipe: "grow_money" })).toBe(false);
    expect(sameTab({ recipe: "" }, { recipe: "" })).toBe(false);
    expect(sameTab({}, {})).toBe(false);
  });
});

describe("updatedInPlace: the same recipe at new numbers", () => {
  const code = (title: string, rate: number) => `root = Widget("${title}", [rate])\n$rate = ${rate}\nrate = Slider("rate", "Rate", 0, 10, 0.25, $rate, "percent")`;
  const item = (n: number, title: string, extra: Partial<WidgetItem> = {}): WidgetItem => ({ key: `m${n}:0`, number: n, code: code(title, n), complete: true, ...extra });

  it("takes the earlier tab's place and keeps its key, so its chip opens the new numbers", () => {
    const list = [item(1, "A move from 4% to 5%", { recipe: "rate_move", preset: { $x: 1 } }), item(2, "Growth"), item(3, "A move from 5% to 6%", { recipe: "rate_move", preset: { $x: 1 } })];
    const out = updatedInPlace(list);
    expect(out.map((i) => i.key)).toEqual(["m3:0", "m2:0"]);
    expect(out[0].code).toContain("$rate = 3");
    expect(out[0].replaces).toEqual(["m1:0"]);
  });

  it("a seventh Widget of a recipe already in the panel drops nothing", () => {
    const list = [1, 2, 3, 4, 5, 6].map((n) => item(n, `W${n}`, { recipe: `r${n}`, preset: { $x: n } }));
    const tabs = cappedTabs(updatedInPlace([...list, item(7, "W2 again", { recipe: "r2", preset: { $x: 1 } })]), "m7:0");
    expect(tabs.map((t) => t.key)).toEqual(["m1:0", "m7:0", "m3:0", "m4:0", "m5:0", "m6:0"]);
  });
});
