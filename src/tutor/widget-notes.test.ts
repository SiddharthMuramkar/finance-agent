import { describe, expect, it } from "vitest";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import type { StoredItem } from "./session-items";
import { widgetNotes } from "./widget-context";

// The "Widget notes" code sends with the Learner's next message (UX audit §7.4, §7.6): the recent archetypes, and
// warnings about the last reply's Widgets, instead of a correction round.

const fence = (code: string) => "```openui-lang\n" + code + "\n```";
const QUICK = 'root = Widget("Which is worth more today?", [q])\n$q = -1\nq = QuickCheck("Which?", ["A", "B"], 0, "Why.", $q)';
const VERSUS = 'root = Widget("Annuity or cash?", [v])\nv = Versus("Annuity", 900, "Cash", 877, "usd")';
const JOINED = 'root = Widget("What is left?", [t])\n$x = 5\nt = TextContent("Left: " + $x)';
const STAT = 'root = Widget("What does it become?", [s])\ns = Stat("Total", 5, "inr")';

const user = (seq: number, text: string) => ({ seq, role: "user", content: text });
const tutor = (seq: number, text: string) => ({ seq, role: "assistant", content: [{ type: "text", text }] });

describe("widgetNotes", () => {
  it("is null before any Widget", () => {
    expect(widgetNotes([user(0, "Hi"), tutor(1, "Hello.")], [], 2)).toBeNull();
  });

  it("lists the last two archetypes, latest last, drawn or shown by code, in Session order", () => {
    const rows = [user(0, "Quiz me"), tutor(1, fence(QUICK)), user(2, "Compare"), tutor(3, "Here.")];
    const shown: StoredItem[] = [{ afterSeq: 2, kind: WIDGET_SHOWN, data: { id: "t1", recipe: "grow_money", params: {}, title: "What does it become?", code: STAT, source: "recipe" } } as StoredItem];
    const notes = widgetNotes([...rows, user(4, "And?"), tutor(5, fence(VERSUS))], shown, 6)!;
    expect(notes).toContain("Recent archetypes, latest last: Grow, Compare.");
  });

  it("carries the warnings about the Widgets of the last reply only, and none at or after the turn", () => {
    const rows = [user(0, "Show me"), tutor(1, fence(JOINED)), user(2, "Again")];
    expect(widgetNotes(rows.slice(0, 2), [], 2)).toMatch(/About "What is left\?": t: a number is joined into text with \+/);
    // The Learner has written since: the old Widget's warnings are not sent again.
    expect(widgetNotes([...rows, tutor(3, "Fine.")], [], 4) ?? "").not.toContain("About");
    expect(widgetNotes(rows.slice(0, 2), [], 1)).toBeNull();
  });
});
