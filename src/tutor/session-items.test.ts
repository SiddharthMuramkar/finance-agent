import { describe, expect, it } from "vitest";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { STEP_DIVIDER } from "./session-item-kinds";
import { turnItems, type StoredItem } from "./session-items";

/** Seam 2, the items a turn holds (spec 2026-11-05, E4a): the one rule the one-Widget check and the Companion gate share. */

const text = (seq: number, role: "user" | "assistant", t: string) => ({ seq, role, content: [{ type: "text", text: t }] });
const toolUse = (seq: number) => ({ seq, role: "assistant", content: [{ type: "tool_use", id: "toolu_1", name: "show_widget", input: {} }] });
const toolResult = (seq: number) => ({ seq, role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "ok" }] });
const summary = (seq: number) => ({ seq, role: "assistant", content: [{ type: "compaction", content: "Summary." }] });

const prevWidget: StoredItem = { afterSeq: 1, kind: WIDGET_SHOWN, data: { id: "prev" } };
const divider: StoredItem = { afterSeq: 1, kind: STEP_DIVIDER, data: { step: "concept", number: 2, label: "Concept" } };
const stepWidget: StoredItem = { afterSeq: 1, kind: WIDGET_SHOWN, data: { id: "step" } };
const items = [prevWidget, divider, stepWidget];

describe("turnItems", () => {
  it("takes a Next's items from its divider on, just before the turn's message", () => {
    expect(turnItems(items, [text(0, "user", "Hi"), text(1, "assistant", "Story.")], 2, true)).toEqual([divider, stepWidget]);
  });

  it("still finds them when a refreeze's summary row sits between them and the turn's message", () => {
    const rows = [text(0, "user", "Hi"), text(1, "assistant", "Story."), summary(2)];
    expect(turnItems(items, rows, 3, true)).toEqual([divider, stepWidget]);
  });

  it("still finds them after a cut-off's tool results and a refreeze's summary", () => {
    const rows = [text(0, "user", "Hi"), toolUse(1), toolResult(2), summary(3)];
    expect(turnItems(items, rows, 4, true)).toEqual([divider, stepWidget]);
  });

  it("takes none from before the turn on a turn that is not a Next", () => {
    expect(turnItems(items, [text(0, "user", "Hi"), text(1, "assistant", "Story."), summary(2)], 3, false)).toEqual([]);
  });
});
