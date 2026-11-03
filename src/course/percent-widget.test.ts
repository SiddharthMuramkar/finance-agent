import { createParser, evaluate, type LibraryJSONSchema } from "@openuidev/lang-core";
import { describe, expect, it } from "vitest";
import frozen from "@/widgets/frozen.generated.json";
import { parsedTasks } from "@/widgets/guided-tasks";
import { loadCourseMap } from "./map";

// Percent's written-ahead Widget, "One rate change, said three ways" (spec #119): its practice moves are made up, so
// none of its Guided Tasks ticks on a Percent quiz question's move or on the Case's outcome.

const parser = createParser(frozen.schema as unknown as LibraryJSONSchema, "Widget");
const widget = loadCourseMap().topic("num-percent-bps")!.widgets.find((w) => w.id === "rate-change-three-ways")!;
const tasks = parsedTasks(parser.parse(widget.code).root!.props.children);
const ticks = (old: number, next: number) =>
  tasks.filter((t) => evaluate(t.condition as never, { getState: (name) => ({ $old: old, $new: next })[name], resolveRef: () => undefined }) === true).map((t) => t.text);

describe("Percent's written-ahead Widget", () => {
  it("has made-up practice moves", () => {
    expect(tasks.map((t) => t.text)).toHaveLength(3);
    expect(ticks(6, 6.4)).toEqual(["Set a rise from 6% to 6.4%"]);
  });

  it("ticks no task on a move a Percent quiz question asks about", () => {
    // From the quiz in course/topics/num-percent-bps.yaml, read by hand: 4.00% to 4.50%, 4% to 6%, 7.50% to 7.20%, 2% to 3%.
    for (const [old, next] of [[4, 4.5], [4, 6], [7.5, 7.2], [2, 3]]) expect(ticks(old, next)).toEqual([]);
  });

  it("ticks no task on the Case's outcome: the funds rate from 3% to 3.25%, and on to 3.75% by May", () => {
    for (const [old, next] of [[3, 3.25], [3, 3.75], [5.81, 7.49], [5.81, 5.94]]) expect(ticks(old, next)).toEqual([]);
  });
});
