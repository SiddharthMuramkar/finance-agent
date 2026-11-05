import { describe, expect, it } from "vitest";
import { moveReadings, markReading } from "./rate-move-marking";

const byText = (set: ReturnType<typeof moveReadings>) => Object.fromEntries(set.choices.map((c) => [c.text, c.mistake?.tag ?? "right"]));

describe("the readings offered for a rate move (ADR 0009: a tap, never a typed number)", () => {
  it("4% to 5% offers the right reading, the x10 slip and the percent mix-up", () => {
    const set = moveReadings(4, 5, "s1");
    expect(byText(set)).toEqual({ "Up 1 point, or 100 bps": "right", "Up 10 bps": "used_x10", "Up 1%": "mixed_percent_points" });
  });

  it("7.5% to 7.2% offers a fall in the same three ways", () => {
    const set = moveReadings(7.5, 7.2, "s1");
    expect(byText(set)).toEqual({ "Down 0.3 points, or 30 bps": "right", "Down 3 bps": "used_x10", "Down 0.3%": "mixed_percent_points" });
  });

  it("keeps the same order for the same seed", () => {
    expect(moveReadings(4, 5, "a").choices.map((c) => c.id)).toEqual(moveReadings(4, 5, "a").choices.map((c) => c.id));
  });

  it("still offers two or more readings when the rate does not move", () => {
    const set = moveReadings(4, 4, "s1");
    expect(set.choices.length).toBeGreaterThanOrEqual(2);
    expect(set.choices.filter((c) => c.id === set.answer)).toHaveLength(1);
    expect(set.choices.find((c) => c.id === set.answer)!.text).toBe("No change, 0 bps");
  });
});

describe("marking a tapped reading", () => {
  it("marks the right reading right, by id, whatever the order", () => {
    const set = moveReadings(5, 5.2, "s1");
    expect(markReading(set, set.answer)).toEqual({ status: "right", fix: null });
  });

  it("marks the x10 slip a Known mistake with its one-line fix", () => {
    const set = moveReadings(5, 5.2, "s1");
    const slip = set.choices.find((c) => c.mistake?.tag === "used_x10")!;
    const mark = markReading(set, slip.id);
    expect(mark.status).toBe("wrong");
    expect(mark.fix).toMatch(/multiply by 100, not 10/);
  });

  it("marks the percent mix-up a Known mistake", () => {
    const set = moveReadings(5, 5.2, "s1");
    const mix = set.choices.find((c) => c.mistake?.tag === "mixed_percent_points")!;
    expect(markReading(set, mix.id).status).toBe("wrong");
    expect(markReading(set, mix.id).fix).toMatch(/percent/i);
  });
});
