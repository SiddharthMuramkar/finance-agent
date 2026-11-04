import { describe, expect, it } from "vitest";
import { PASTE_MESSAGE } from "./pasted";
import { turnBody, turnInputOf } from "./turn-body";

/** The /api/turn body: one kind of turn per request, read into the Tutor Turn's input. */
const input = (body: unknown) => {
  const parsed = turnBody.safeParse(body);
  return parsed.success ? turnInputOf(parsed.data) : "refused";
};

describe("a turn request's body", () => {
  it("reads each kind, beside what the page shows and its Widgets", () => {
    const beside = { shown: { sessionId: 3 }, widgets: {} };
    expect(input({ message: " Hi ", ...beside })).toBe("Hi");
    expect(input({ message: "Read this", paste: " Some words. " })).toEqual({ message: "Read this", paste: "Some words." });
    expect(input({ paste: "Some words." })).toEqual({ message: PASTE_MESSAGE, paste: "Some words." });
    expect(input({ finish: true, ...beside })).toEqual({ finish: true });
    expect(input({ opener: true })).toEqual({ opener: true });
    expect(input({ next: "concept" })).toEqual({ next: "concept" });
    expect(input({ next: "complete" })).toEqual({ next: "complete" });
    expect(input({ widgetReport: "explore" })).toEqual({ widgetReport: "explore" });
    expect(input({ quizFollowUp: true })).toEqual({ quizFollowUp: true });
    expect(input({ resume: true })).toEqual({ resume: true });
  });

  it("reads an old tab's continue as Finish this reply", () => {
    expect(input({ continue: true })).toEqual({ finish: true });
  });

  it("refuses two kinds at once, an unknown Next or an empty report; an empty message has no input", () => {
    expect(input({ resume: true, message: "Hi" })).toBe("refused");
    expect(input({ opener: true, next: "concept" })).toBe("refused");
    expect(input({ next: "lunch" })).toBe("refused");
    expect(input({ widgetReport: "  " })).toBe("refused");
    expect(input({ message: "   " })).toBeUndefined();
    expect(input({})).toBeUndefined();
    expect(input(null)).toBe("refused");
  });
});
