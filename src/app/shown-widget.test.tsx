import { describe, expect, it } from "vitest";
import { drawnWidgets } from "@/tutor/session-items";
import { recipeById } from "@/widgets/recipes";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { widgetsIn, type ThreadLine } from "./thread";

// A Widget code drew from a recipe (show_widget, ADR 0005) is a Session item carrying its own code: the thread draws it
// where the Tutor called show_widget, like a written-ahead Widget it opened, and it counts as open for the next turn.

const built = recipeById("history_case")!.build({ title: "Gold in rupees", inputs: {}, refs: { dataset: "reference/gold-inr-10g" }, facts: {} });
if (!built.ok) throw new Error(built.error);
const data = { id: "toolu_1", recipe: "history_case", params: {}, title: built.title, code: built.code, source: "recipe" };

describe("shown Widgets", () => {
  it("widgetsIn draws a WIDGET_SHOWN item with the code it carries, under the item's own key", () => {
    const lines: ThreadLine[] = [
      { id: "m0", role: "user", text: "Show me gold" },
      { id: "i1", role: "item", kind: WIDGET_SHOWN, data },
      { id: "m2", role: "assistant", text: "Look at 2008." },
    ];
    const [widget] = widgetsIn(lines);
    expect(widget).toEqual({ key: "i1:0", number: 1, code: built.code, complete: true });
  });

  it("leaves out a broken WIDGET_SHOWN item rather than failing", () => {
    expect(widgetsIn([{ id: "i1", role: "item", kind: WIDGET_SHOWN, data: { title: "x" } }])).toEqual([]);
  });

  it("merges shown Widgets with reply fences in seq order: a later one with the same title updates in place", () => {
    const fence = ["```openui-lang", 'root = Widget("Gold in rupees", [h])', 'h = HistoryChart("reference/gold-usd-oz")', "```"].join("\n");
    const open = drawnWidgets(
      [
        { seq: 1, text: fence },
        { seq: 3, text: "Now in rupees." },
      ],
      [{ afterSeq: 2, kind: WIDGET_SHOWN, data }],
    );
    expect(open).toEqual([{ title: "Gold in rupees", code: built.code }]);
    expect(drawnWidgets([{ seq: 1, text: fence }], [{ afterSeq: 2, kind: WIDGET_SHOWN, data }], 2)[0].code).toContain("gold-usd-oz");
  });
});
