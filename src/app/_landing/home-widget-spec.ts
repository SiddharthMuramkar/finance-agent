import { copy } from "./copy.ts";

// Which written-ahead Widget Home shows and the one Guided Task it gives it (spec #119, "Widgets › Home's copy").
// No "@/" imports and nothing but copy.ts, so the course check (scripts/check-course.mjs, plain Node) can check
// Home's copy of the Widget as well.

/** Present value's annuity Widget, with its tasks swapped for Home's one: drag the rate to 0%. */
export const HOME_WIDGET = {
  topic: "present-value",
  widget: "annuity-worth-today",
  task: { text: copy.widget.task, done: "$rate == 0" },
};
