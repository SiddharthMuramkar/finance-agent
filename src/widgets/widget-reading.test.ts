import { readFileSync } from "node:fs";
import { join } from "node:path";
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

// Value levers (spec 2026-11-12, B3): the Tutor is told the four lever settings, the value, the ticked tasks, and which
// lever has moved the value most so far. The figures are the spec's: revenue $60bn and margin 12.5% is $84.07, margin 10%
// to 12% moves it by $13.47.
describe("what the Tutor is told of Value levers", () => {
  const code = readFileSync(join(process.cwd(), "src/widgets/fixtures/parts/value-levers.openui"), "utf8");
  const tasks = ["Move one lever at a time. Which one moves the value most?", "Find a story worth the $84 price"];

  it("at its opening: each lever, $35 a share, the price, 112% after year 10, and no lever moved yet", () => {
    const reading = readWidget(code, undefined, () => undefined)!;
    expect(reading.sliders.slice(0, 4)).toEqual([
      { label: "Sales in year 10 (how big it gets)", text: "$39bn" },
      { label: "Operating margin once mature (what it keeps)", text: "10%" },
      { label: "Sales for each dollar invested (what growth costs)", text: "$3.00" },
      { label: "Cost of capital while it grows (how risky)", text: "12.84%" },
    ]);
    expect(reading.readouts).toEqual(["Value: $35 a share", "Price on 3 Feb 2000: $84", "Share of the value from after year 10: 112%", "No lever moved yet"]);
    expect(reading.tasks).toEqual(tasks.map((text) => ({ text, ticked: false })));
  });

  it("after the Learner's story: the settings, $84 a share, the ticked tasks and the lever that moved the value most", () => {
    const saved = { values: { $revenue: 60, $margin: 12.5, $moved: 3, $mostLever: 2, $mostBy: 13.47 }, ticked: tasks };
    const reading = readWidget(code, saved, () => undefined)!;
    expect(reading.sliders[0].text).toBe("$60bn");
    expect(reading.sliders[1].text).toBe("12.5%");
    expect(reading.readouts[0]).toBe("Value: $84 a share");
    expect(reading.readouts.at(-1)).toBe("Moved the value most so far: What it keeps (operating margin once mature), by $13.47");
    expect(reading.tasks.every((t) => t.ticked)).toBe(true);
    expect(allTasksTicked(code, tasks)).toBe(true);
    expect(foundText(reading)).toMatch(/^I set the sales in year 10 \(how big it gets\) to \$60bn and the operating margin once mature \(what it keeps\) to 12\.5% and /);
  });
});
