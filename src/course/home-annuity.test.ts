import { describe, expect, it } from "vitest";
import { loadCourseMap } from "./map";
import { parsedChildren } from "@/widgets/check";
import { readHomeAnnuity as readWith } from "./home-annuity";

const readHomeAnnuity = (code: string) => readWith(code, parsedChildren(code));

// Home's Explorable draws Present value's annuity by code, with the numbers read from the Topic file's annuity Widget
// (course/topics/present-value.yaml), so Home and the Topic never disagree. Expected values are copied from that file.

const widget = (lines: string[]) => lines.join("\n");
const PRESENT_VALUE = widget([
  'root = Widget("What the annuity is worth today", [rate, chart])',
  "$rate = 5",
  'rate = Slider("rate", "Interest rate (discount rate)", 0, 10, 0.01, $rate, "percent", [{value: 0}])',
  'chart = AnnuityChart(1537000000, 30, 5, $rate, "mega-millions-2018/cash-option", 2018)',
]);

describe("readHomeAnnuity", () => {
  it("reads the annuity, its rate slider and the figure it is set against", () => {
    expect(readHomeAnnuity(PRESENT_VALUE)).toEqual({
      ok: true,
      annuity: {
        total: 1_537_000_000,
        payments: 30,
        growthPercent: 5,
        firstYear: 2018,
        compareTo: "mega-millions-2018/cash-option",
        rate: { label: "Interest rate (discount rate)", min: 0, max: 10, step: 0.01, start: 5 },
      },
    });
  });

  it("reads Present value's annuity Widget as the Topic file writes it", () => {
    const pv = loadCourseMap().topic("present-value")!;
    const code = pv.widgets.find((w) => w.id === "annuity-worth-today")!.code;
    const read = readHomeAnnuity(code);
    expect(read.ok && read.annuity.total).toBe(1_537_000_000);
    expect(read.ok && read.annuity.compareTo).toBe("mega-millions-2018/cash-option");
  });

  it("names what is missing when there is no annuity chart", () => {
    expect(readHomeAnnuity(widget(['root = Widget("x", [rate])', "$rate = 5", 'rate = Slider("rate", "Rate", 0, 10, 0.01, $rate)']))).toEqual({
      ok: false,
      problems: ["has no AnnuityChart"],
    });
  });

  it("needs written numbers, a sourced figure and a first year on the chart", () => {
    const read = readHomeAnnuity(PRESENT_VALUE.replace(', "mega-millions-2018/cash-option", 2018)', ")"));
    expect(read).toEqual({ ok: false, problems: ["its AnnuityChart has no compareTo figure", "its AnnuityChart has no firstYear"] });
  });

  it("needs a Slider for the chart's rate, with a starting number", () => {
    const noSlider = readHomeAnnuity(PRESENT_VALUE.replace(/^rate = Slider.*$/m, 'rate = Slider("other", "Other", 0, 10, 0.01, $other)'));
    expect(noSlider).toEqual({ ok: false, problems: ["has no Slider for the AnnuityChart's rate ($rate)"] });
    const noStart = readHomeAnnuity(PRESENT_VALUE.replace("$rate = 5\n", ""));
    expect(noStart.ok).toBe(false);
  });
});
