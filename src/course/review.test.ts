import { describe, expect, it } from "vitest";
import { newCard, rate } from "./review";

const day = 86_400_000;
const t0 = new Date("2026-03-01T10:00:00Z");

describe("scheduling quiz questions", () => {
  it("a correct first answer (Good) schedules the question days ahead, not minutes", () => {
    const card = rate(newCard(t0), true, t0);
    expect(card.due.getTime() - t0.getTime()).toBeGreaterThanOrEqual(day);
    expect(card.reps).toBe(1);
  });

  it("an incorrect answer (Again) brings the question back sooner than a correct one", () => {
    const good = rate(newCard(t0), true, t0);
    const again = rate(newCard(t0), false, t0);
    expect(again.due.getTime()).toBeLessThan(good.due.getTime());
  });

  it("a lapse after a good run is counted and shortens the memory strength", () => {
    const first = rate(newCard(t0), true, t0);
    const later = new Date(first.due.getTime());
    const lapsed = rate(first, false, later);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.stability).toBeLessThan(first.stability);
  });
});
