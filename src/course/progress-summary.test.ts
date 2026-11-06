import { describe, expect, it } from "vitest";
import type { TopicOverview } from "./navigator";
import { progressSummary } from "./progress-summary";

const topics = (counts: { in_progress: number; passed: number; not_started: number }): Pick<TopicOverview, "status">[] =>
  (["in_progress", "passed", "not_started"] as const).flatMap((status) => Array.from({ length: counts[status] }, () => ({ status })));

describe("summary line", () => {
  const t = topics({ in_progress: 2, passed: 3, not_started: 5 });
  it("counts in progress, passed and to go, then names what comes next", () => {
    expect(progressSummary(t, "Bond prices")).toBe("2 in progress · 3 passed · 5 to go · Next: Bond prices");
  });
  it("leaves Next out when nothing comes next", () => {
    expect(progressSummary(t, null)).toBe("2 in progress · 3 passed · 5 to go");
  });
  it("keeps '0 passed' when no Topic is passed", () => {
    expect(progressSummary(topics({ in_progress: 1, passed: 0, not_started: 4 }), null)).toBe("1 in progress · 0 passed · 4 to go");
  });
});
