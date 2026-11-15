import { describe, expect, it } from "vitest";
import { TOPIC_START } from "@/course/topic-start";
import { REPLY_CHOICES, STEP_DIVIDER, STOPPED } from "@/tutor/session-item-kinds";
import type { TurnUsage } from "@/tutor/usage";
import { WIDGET_SHOWN } from "@/widgets/shown-widget";
import { addText, finishReply, placeItem, replayReply, replyCursor, startReply, stopReply, takeBack, type Placed, type ReplyCursor } from "./reply-lines";
import type { ThreadLine } from "./thread";

// Where a streamed reply's lines go in the thread, as plain functions of the lines (no React): the same thread the
// server's loadThread draws from the saved Session.

const step = (n: number) => ({ kind: STEP_DIVIDER, data: { number: n, label: `Step ${n}` } });
/** Each line as a short tag: the Learner's "u:text", the Tutor's "a:text" (with "+" when the reply goes on), an item's "[kind]". */
const tags = (lines: ThreadLine[]) => lines.map((l) => (l.role === "item" ? `[${l.kind}]` : `${l.role[0]}:${l.text}${l.more ? "+" : ""}`));
const asked: ThreadLine[] = [{ id: "u-1", role: "user", text: "Why discount?" }];

/** Runs placements in order, as one burst of events does before the page renders: each sees the cursor the last one left. */
function run(lines: ThreadLine[], c: ReplyCursor, ...steps: ((c: ReplyCursor) => Placed | ((l: ThreadLine[]) => ThreadLine[]))[]) {
  const updates: ((l: ThreadLine[]) => ThreadLine[])[] = [];
  for (const s of steps) {
    const out = s(c);
    if (typeof out === "function") updates.push(out);
    else {
      c = out.cursor;
      updates.push(out.update);
    }
  }
  return { lines: updates.reduce((l, u) => u(l), lines), cursor: c };
}

describe("startReply", () => {
  it("draws the Learner's message and an empty reply under it", () => {
    expect(tags(startReply([], "a-1", { user: { id: "u-1", text: "Hi" } }))).toEqual(["u:Hi", "a:"]);
  });

  it("carries on the reply on screen for a resume, under the new id", () => {
    const lines = startReply([...asked, { id: "saved-1", role: "assistant", text: "A rupee" }], "a-2", { resume: true });
    expect(lines.at(-1)).toEqual({ id: "a-2", role: "assistant", text: "A rupee" });
    expect(lines).toHaveLength(2);
  });

  it("starts a reply after the Learner's last message for a resume, and below everything for a Next or the opener", () => {
    expect(tags(startReply(asked, "a-2", { resume: true }))).toEqual(["u:Why discount?", "a:"]);
    const card: ThreadLine[] = [{ id: "saved-0", role: "item", kind: TOPIC_START, data: {} }];
    expect(tags(startReply(card, "a-1", {}))).toEqual([`[${TOPIC_START}]`, "a:"]);
  });
});

describe("placeItem", () => {
  it("puts an item that comes before any words in front of the reply, which carries on after it", () => {
    const { lines, cursor } = run(startReply(asked, "a-1", {}), replyCursor("a-1"), (c) => placeItem(c, step(2)), (c) => addText(c, "Now Explore."));
    expect(tags(lines)).toEqual(["u:Why discount?", "[step]", "a:Now Explore."]);
    expect(cursor.current).toBe("a-1-1");
  });

  it("cuts the reply in two at an item that comes after words; every part but the last goes on", () => {
    const { lines } = run(
      startReply(asked, "a-1", {}),
      replyCursor("a-1"),
      (c) => addText(c, "That is the Concept."),
      (c) => addText(c, " Well done."),
      (c) => placeItem(c, step(3)),
      (c) => addText(c, "Now move the slider."),
    );
    expect(tags(lines)).toEqual(["u:Why discount?", "a:That is the Concept. Well done.+", "[step]", "a:Now move the slider."]);
  });

  it("stands the reply's Choices after it without starting a new part", () => {
    const choices = { kind: REPLY_CHOICES, data: { choices: [] } };
    const { lines, cursor } = run(startReply(asked, "a-1", {}), replyCursor("a-1"), (c) => addText(c, "Done."), (c) => placeItem(c, choices, true));
    expect(tags(lines)).toEqual(["u:Why discount?", "a:Done.", `[${REPLY_CHOICES}]`]);
    expect(cursor.current).toBe("a-1");
  });

  it("gives every item of the reply its own id", () => {
    const { lines } = run(startReply(asked, "a-1", {}), replyCursor("a-1"), (c) => addText(c, "One."), (c) => placeItem(c, step(1)), (c) => addText(c, "Two."), (c) => placeItem(c, step(2)));
    const ids = lines.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("replayReply", () => {
  it("replaces every part of the reply and the items between them with the saved text, as one part", () => {
    const streamed = run(startReply(asked, "a-1", {}), replyCursor("a-1"), (c) => addText(c, "One."), (c) => placeItem(c, step(2)), (c) => addText(c, "Tw"));
    const { lines, cursor } = run(streamed.lines, streamed.cursor, (c) => replayReply(c, "One. Two."));
    expect(tags(lines)).toEqual(["u:Why discount?", "a:One. Two."]);
    expect(cursor).toEqual(replyCursor("a-1"));
  });

  it("on a resume, takes away parts the page loaded before it, but never the Topic Start card", () => {
    const loaded: ThreadLine[] = [
      { id: "saved-0", role: "item", kind: TOPIC_START, data: {} },
      { id: "saved-1", role: "assistant", text: "Part one.", more: true },
      { id: "saved-2", role: "item", ...step(1) },
      { id: "saved-3", role: "assistant", text: "Part tw" },
    ];
    const { lines } = run(startReply(loaded, "a-1", { resume: true }), replyCursor("a-1"), (c) => replayReply(c, "Part one. Part two."));
    expect(tags(lines)).toEqual([`[${TOPIC_START}]`, "a:Part one. Part two."]);
  });
});

describe("stopReply", () => {
  it("drops the reply in progress, words a streamed reply showed included (ADR 0006), and leaves the Stopped note", () => {
    const streamed = run(startReply(asked, "a-1", {}), replyCursor("a-1"), (c) => addText(c, "A basis point is small. "), (c) => stopReply(c));
    expect(tags(streamed.lines)).toEqual(["u:Why discount?", `[${STOPPED}]`]);
    const empty = run(startReply(asked, "a-1", {}), replyCursor("a-1"), (c) => stopReply(c));
    expect(tags(empty.lines)).toEqual(["u:Why discount?", `[${STOPPED}]`]);
  });

  it("keeps the items the turn showed, as they are saved, and drops every part of the words around them", () => {
    const { lines } = run(startReply(asked, "a-1", {}), replyCursor("a-1"), (c) => addText(c, "One."), (c) => placeItem(c, step(2)), (c) => addText(c, "Two."), (c) => stopReply(c));
    expect(tags(lines)).toEqual(["u:Why discount?", "[step]", `[${STOPPED}]`]);
  });
});

describe("finishReply", () => {
  it("puts the usage on the part the reply ended in and the Session ref on every part", () => {
    const streamed = run(startReply(asked, "a-1", {}), replyCursor("a-1"), (c) => addText(c, "One."), (c) => placeItem(c, step(2)), (c) => addText(c, "Two."));
    const usage: TurnUsage = { model: "m", inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, thinkingTokens: null, durationMs: 1, costUsd: 0.01, tools: [], steps: [] };
    const lines = finishReply(streamed.cursor, { usage, ref: { sessionId: 4, turnSeq: 7 } })(streamed.lines);
    const replies = lines.flatMap((l) => (l.role === "assistant" ? [l] : []));
    expect(replies.map((l) => l.ref)).toEqual([{ sessionId: 4, turnSeq: 7 }, { sessionId: 4, turnSeq: 7 }]);
    expect(replies.map((l) => l.usage)).toEqual([undefined, usage]);
    expect(lines[0]).toBe(asked[0]);
  });

  it("puts the Session ref on a Widget code showed in the reply, drawn before it, and on no other item", () => {
    // A Next: its step divider and step Widget come before the reply's first words (reply-items.ts: both are the Next's).
    const shown = { kind: WIDGET_SHOWN, data: { id: "t1", recipe: "grow_money", params: {}, title: "Rates", code: "x", source: "recipe" } };
    const earlier: ThreadLine = { id: "s-0", role: "item", ...shown };
    const streamed = run(startReply([earlier], "a-1", {}), replyCursor("a-1"), (c) => placeItem(c, step(2)), (c) => placeItem(c, shown), (c) => addText(c, "A basis point."));
    const ref = { sessionId: 4, turnSeq: 7 };
    const lines = finishReply(streamed.cursor, { ref })(streamed.lines);
    expect(lines.map((l) => [l.role === "item" ? l.kind : l.role, l.ref])).toEqual([[WIDGET_SHOWN, undefined], [STEP_DIVIDER, undefined], [WIDGET_SHOWN, ref], ["assistant", ref]]);
    expect(lines[0]).toBe(earlier);
  });
});

describe("takeBack", () => {
  it("takes the Learner's message and the empty reply back off the screen", () => {
    const lines = startReply(asked, "a-2", { user: { id: "u-2", text: "Again?" } });
    expect(tags(takeBack(replyCursor("a-2"), "u-2")(lines))).toEqual(["u:Why discount?"]);
  });
});
