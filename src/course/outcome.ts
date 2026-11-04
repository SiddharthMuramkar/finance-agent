import type { Topic } from "./map";
import { conditionValue, type SavedWork } from "./written-ahead";

/**
 * What the Learner found in a Topic, in a line each (spec: UX audit 11.7 outcomes): the Topic's `found` lines whose
 * condition holds in the Learner's saved Widget state for the Session, in the Topic file's order. `{value}` in a line is the
 * saved number, trimmed to two decimals. Pure: Past Sessions rows and the Topic complete card read it. Nothing the model
 * said goes in, and no figure is typed by hand: the numbers are the Learner's own.
 */
export function foundLines(topic: Pick<Topic, "widgets" | "found">, states: Readonly<Record<string, SavedWork>>): string[] {
  return (topic.found ?? []).flatMap((f) => {
    const value = conditionValue(topic, f.when, states);
    if (value === null) return [];
    return [typeof value === "number" ? f.text.replaceAll("{value}", String(Number(value.toFixed(2)))) : f.text];
  });
}
