import { describe, expect, it } from "vitest";
import { presentValueOnly } from "@/test/present-value-map";
import { allTasksTicked, foundText, readWidget, type SourcedLookup } from "./widget-reading";

// What code tells the Tutor a Widget shows, and the message Tell the Tutor what I found posts (spec #119). The
// expected figures come from the spec's present value maths, not from the code.

const pv = presentValueOnly({ withoutQuiz: true }).topic("present-value")!;
const explore = pv.widgets.find((w) => w.id === pv.explore!.widget)!.code;
const cashOption: SourcedLookup = (ref) => (ref === "mega-millions-2018/cash-option" ? { label: "Cash option", value: 877_800_000, unit: "USD", date: "2018-10-23" } : undefined);

describe("Tell the Tutor what I found's message", () => {
  it("says the rate set and what the annuity is worth today beside the cash option, with the spec's present value figure (3.33% → $884.1M)", () => {
    const reading = readWidget(explore, { values: { $rate: 3.33 }, ticked: [] }, cashOption, true)!;
    expect(foundText(reading)).toBe(
      "I set the interest rate (discount rate) to 3.33%. Sum of payments: $1.537 billion; Worth today at 3.33%: $884.1 million; Cash option: $877.8 million (sourced, 2018-10-23).",
    );
  });

  it("leaves out a sourced figure the as-of rule withholds", () => {
    const reading = readWidget(explore, { values: { $rate: 3.25 }, ticked: [] }, () => undefined)!;
    expect(foundText(reading)).toBe("I set the interest rate (discount rate) to 3.25%. Sum of payments: $1.537 billion; Worth today at 3.25%: $894.9 million.");
  });
});

describe("whether every Guided Task is ticked", () => {
  it("needs each task's text among the ticks, and a Widget with no tasks never counts", () => {
    const texts = ["Set the rate to 0%: the payments are worth the advertised $1.537B", "Find the rate where the annuity is worth the same as the cash"];
    expect(allTasksTicked(explore, texts.slice(0, 1))).toBe(false);
    expect(allTasksTicked(explore, texts)).toBe(true);
    expect(allTasksTicked('root = Widget("No tasks", [])', [])).toBe(false);
  });
});
