import type { Topic } from "./map.ts";

// The course check for Connections (spec #57). A Topic with an Insight is part of the insight-led
// pilot, so it must give the Tutor two or three Connections for the principle step. (The Topic file
// schema already rejects exactly one, or more than three.) No "@/" imports, so
// `scripts/check-course.mjs` can run it under plain Node.

export function connectionsCheckErrors(topics: Pick<Topic, "id" | "insight" | "connections">[]): string[] {
  return topics.flatMap((t) => {
    const n = t.connections.length;
    return t.insight && (n < 2 || n > 3) ? [`Topic "${t.id}" has an Insight, so it needs two or three Connections (it has ${n})`] : [];
  });
}
