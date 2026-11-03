import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { navigate, type TeachingStep } from "@/course/navigator";
import { stepContext } from "./context";

const map = loadCourseMap();

function contextAt(step: TeachingStep): string {
  const place = navigate(map, {
    currentTopicId: "present-value",
    topics: { "present-value": { step, passedChecks: [], revealShown: false, status: "in_progress" } },
  });
  return stepContext(place);
}

describe("the Tutor's context for a Topic with formula markers", () => {
  it("shows the Concept's marker as plain words plus the computed result, never the raw marker", () => {
    const context = contextAt("concept");
    expect(context).not.toContain("{{");
    expect(context).not.toContain("formula:");
    expect(context).not.toContain("ratePercent=");
    expect(context).toContain("Present value of one future payment, worked out by code");
    expect(context).toContain("Amount you receive later $1,000.00");
    expect(context).toContain("Years until the payment arrives 5 years");
    // 1,000 in five years at 10% is worth 620.92 today (the registry example, checked in formulas.test.ts).
    expect(context).toContain("Worth today (present value) $620.92");
  });

  it("holds no typed formula at any Teaching Step", () => {
    for (const step of ["story", "concept", "your_turn", "check", "reveal", "principle"] as const) {
      const context = contextAt(step);
      expect(context, step).not.toContain("{{");
      expect(context, step).not.toMatch(/\(1 \+ r\)/);
    }
  });
});
