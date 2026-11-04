// The provenance colours, as the app's tokens: teal is what the Learner set, amber is sourced from the record,
// neutral is worked out by code. Never used for buttons or links.

export type Tone = "you" | "src" | "neutral";

export const TONES = ["you", "src", "neutral"] as const;

/** A rule colour (the left rule on a Stat, a tick on a track). */
export const toneRule: Record<Tone, string> = {
  you: "var(--you-line)",
  src: "var(--src-line)",
  neutral: "var(--border)",
};

/** Fill and outline for a drawn object in each tone. */
export const toneInk: Record<Tone, { fill: string; line: string }> = {
  you: { fill: "var(--you-tag)", line: "var(--you)" },
  src: { fill: "var(--src-tag)", line: "var(--src)" },
  neutral: { fill: "var(--data)", line: "var(--muted)" },
};
