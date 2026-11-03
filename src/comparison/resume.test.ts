import { describe, expect, it } from "vitest";
import type { TurnEvent, TurnInput } from "@/tutor/turn";
import { takeWholeTurn } from "./resume";

const usage = (cost: number) => ({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 1, cacheWriteTokens: 2, costUsd: cost, durationMs: 100 }) as never;
const done = (cost: number, stopReason = "end_turn"): TurnEvent => ({ type: "done", stopReason, usage: usage(cost), ref: { sessionId: 1, turnSeq: 1 }, shown: { sessionId: 1 } });

/** A scripted Tutor: each call to run() plays the next list of events and records its input. */
function scripted(script: TurnEvent[][]) {
  const inputs: TurnInput[] = [];
  return {
    inputs,
    run: async function* (input: TurnInput) {
      inputs.push(input);
      for (const e of script[inputs.length - 1] ?? []) yield e;
    },
  };
}

describe("taking a whole Tutor turn", () => {
  it("returns the reply and sums usage when the turn finishes at once", async () => {
    const s = scripted([[{ type: "text", text: "Hello " }, { type: "text", text: "there" }, done(0.02)]]);
    const r = await takeWholeTurn(s.run, "hi");
    expect(r.text).toBe("Hello there");
    expect(r.usage.costUsd).toBeCloseTo(0.02, 6);
    expect(r.resumes).toBe(0);
    expect(r.failed).toBe("");
  });

  it("resumes a turn cut off at its time limit, using the replayed text, and adds both parts' cost", async () => {
    const s = scripted([
      [{ type: "text", text: "Half an ans" }, { type: "cut_off" }],
      [{ type: "replay", text: "Half an answer" }, { type: "text", text: " and the rest." }, done(0.03)],
    ]);
    const r = await takeWholeTurn(s.run, "hi");
    expect(s.inputs).toEqual(["hi", { resume: true }]);
    expect(r.text).toBe("Half an answer and the rest.");
    expect(r.resumes).toBe(1);
  });

  it("continues a reply cut short at max_tokens and joins the parts", async () => {
    const s = scripted([
      [{ type: "text", text: "Part one." }, { type: "cut_short", message: "m" }, done(0.01, "max_tokens")],
      [{ type: "text", text: " Part two." }, done(0.02)],
    ]);
    const r = await takeWholeTurn(s.run, "hi");
    expect(s.inputs).toEqual(["hi", { continue: true }]);
    expect(r.text).toBe("Part one.\n\n Part two.");
    expect(r.usage.costUsd).toBeCloseTo(0.03, 6);
  });

  it("gives up after the resume limit and reports the turn as incomplete", async () => {
    const cut: TurnEvent[] = [{ type: "cut_off" }];
    const s = scripted([cut, cut, cut, cut, cut]);
    const r = await takeWholeTurn(s.run, "hi", 2);
    expect(r.resumes).toBe(2);
    expect(r.failed).toMatch(/still cut off/);
  });

  it("reports an error or refusal as a failure", async () => {
    const e = await takeWholeTurn(scripted([[{ type: "error", kind: "api" as never, message: "boom" }]]).run, "hi");
    expect(e.failed).toContain("boom");
    const f = await takeWholeTurn(scripted([[{ type: "refusal", message: "no", text: "" }]]).run, "hi");
    expect(f.failed).toContain("refusal");
  });
});
