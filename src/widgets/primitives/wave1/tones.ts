// Thin marks: a drawn object is a line in its tone's ink, with no fill. Mint is what the Learner set, sunflower is
// sourced from the record, grey is worked out by code. Never used for buttons or links.

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
  you: { fill: "none", line: "var(--you)" },
  src: { fill: "none", line: "var(--src)" },
  neutral: { fill: "none", line: "var(--muted)" },
};
