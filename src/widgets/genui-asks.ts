/**
 * The live chart asks for `npm run widgets:live` (genui.live.ts): what a Learner says when they want
 * to see something, roughly one per kind of Widget the Tutor should build. Only the Learner's words
 * live here; the probe places the Learner and reads the replies.
 */
export type GenuiAsk = {
  id: string;
  /** The Topic the Learner is placed in: an outline Topic with a written file (course/outline.yaml). */
  topic: string;
  /**
   * Where the Learner stands, always before the reveal: "story" (just started), or "check" (at the
   * Topic's conversation Check, past its explore step, so its Insight is already settled).
   */
  at: "story" | "check";
  /** Sent one after another in the same Session; the last one is the chart ask the probe judges. */
  turns: string[];
  /** What a good Widget for this ask holds, printed in the report for whoever reads it. Code does not grade it. */
  goodWidget: string;
};

export const GENUI_ASKS: GenuiAsk[] = [
  {
    id: "pv-dollar-grows",
    topic: "present-value",
    at: "story",
    turns: ["Show me a chart of how a dollar grows with compounding over 30 years."],
    goodWidget: "A rate Slider and a calculate_range of future_value over years 1 to 30, drawn as an area or line chart.",
  },
  {
    // This graph is present value's Insight (high rates shrink far-off payments), which the Tutor must
    // not show before the explore step settles it; so the Learner asks at the Check after explore.
    id: "pv-rate-curve",
    topic: "present-value",
    at: "check",
    turns: ["Graph how the annuity's present value changes as the discount rate goes from 0% to 10%."],
    goodWidget:
      "A calculate_range of growing_annuity_present_value over ratePercent 0 to 10, drawn as a line chart, or an AnnuityChart with a rate Slider.",
  },
  {
    id: "pv-options-table",
    topic: "present-value",
    at: "story",
    turns: ["Can you show me a table comparing the annuity and the cash option?"],
    goodWidget:
      'A Table of the two sourced figures through Query("case_data") (mega-millions-2018/advertised-annuity and cash-option), perhaps with what the annuity is worth today from annuity_schedule or calculate.',
  },
  {
    // No Topic is about loans yet; an EMI is an annuity, so the present value Topic holds the ask.
    id: "pv-emi-by-length",
    topic: "present-value",
    at: "story",
    turns: ["Graph a 50 lakh home loan's EMI against the loan length at my rate, and let me change the rate."],
    goodWidget: "A rate Slider, a calculate_range of emi over years drawn as a line chart, and a calculate Table of the loan's numbers today.",
  },
  {
    id: "sensex-milestones",
    topic: "num-compounding",
    at: "story",
    turns: ["Chart the Sensex milestones for me."],
    goodWidget:
      'Query("case_data", {dataset: "sensex-1992/sensex-close"}) as a line chart, ideally in Tabs with a Table of dates and closes, or a HistoryChart.',
  },
  {
    // The exact ask that failed live on 2 November 2026 (session 22): the Tutor answered "I don't have
    // a chart type that fits this idea" and drew a table instead.
    id: "fed-chart-2-nov",
    topic: "num-percent-bps",
    at: "story",
    turns: ["Continue.", "can you generate a chart to explain it"],
    goodWidget:
      "A Widget in the second reply: the sourced funds rate (fed-hike-1994/fed-funds-target), or a labelled Illustration of percent against percentage points whose made-up move is not the real 3% to 3.25%.",
  },
  {
    id: "bond-price-yield",
    topic: "bond-pricing",
    at: "story",
    turns: ["Show me how a bond's price moves when its yield changes."],
    goodWidget: "A calculate_range of bond_price over yieldPercent drawn as a line chart, perhaps with a coupon or years Slider.",
  },
  {
    id: "percent-vs-points",
    topic: "num-percent-bps",
    at: "story",
    turns: ["Draw me a picture of the difference between percent and percentage points."],
    goodWidget:
      'An Illustration (title starting "Illustration:") of a made-up move such as 5% to 5.5%, as bars plus a callout, with its arithmetic written as expressions.',
  },
];
