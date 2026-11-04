import { describe, expect, it } from "vitest";
import { REPLY_WORD_LIMIT, TUTOR_INSTRUCTIONS } from "@/tutor/instructions";
import { longReplies, proseWords, renderReport, type Graded } from "./grading";

/** Replies of 120 words or fewer (UX audit 9.3): the instructions ask for it, and the behaviour report flags longer ones. */

const FENCE = "`".repeat(3);
const words = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");

describe("the reply word limit", () => {
  it("is in the Tutor's instructions, beside asking the open question once", () => {
    expect(TUTOR_INSTRUCTIONS).toContain(`at most about ${REPLY_WORD_LIMIT} words of prose`);
    expect(TUTOR_INSTRUCTIONS).toContain("Ask it once.");
  });

  it("counts prose only: Widgets, the sources fold and citation numbers are left out", () => {
    const widget = `${FENCE}openui-lang\nroot = Card([TextContent("one two three four")])\n${FENCE}`;
    expect(proseWords(`Present value [1] is worth today.\n\n${widget}\n\nThat is all.`)).toBe(8);
    expect(proseWords(`Two words.\n\n${FENCE}openui-lang\nroot = Card([`)).toBe(2);
  });

  it("names each reply of an answer that runs past the limit", () => {
    expect(longReplies(words(120))).toEqual([]);
    expect(longReplies(words(121))).toEqual(["reply 1: 121 words"]);
    expect(longReplies(`[reply 1] ${words(10)}\n\n[reply 2] ${words(200)}`)).toEqual(["reply 2: 200 words"]);
  });

  it("lists long replies in the report", () => {
    const row: Graded = { id: "q1", rule: "forecast", style: "direct", turns: ["Will rates rise?"], answer: words(150), verdict: "pass", reasons: "ok", costUsd: 0 };
    expect(renderReport([row], "2026-11-04")).toContain(`## Replies over ${REPLY_WORD_LIMIT} words\n\n- q1: reply 1: 150 words`);
    expect(renderReport([{ ...row, answer: "Short." }], "2026-11-04")).toContain(`## Replies over ${REPLY_WORD_LIMIT} words\n\nNone.`);
  });
});
