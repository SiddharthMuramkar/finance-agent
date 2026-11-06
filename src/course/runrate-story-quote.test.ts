import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

// #489: the WeWork beat must match the S-1, where "just six months" is the
// step from $2 billion to $3 billion of run-rate revenue, after more than
// seven years to the first $1 billion.
type Beat = { who: string; says: string };
type Scene = { id: string; inputs?: { beats?: Beat[] } };

function weworkBeats(): string[] {
  const text = readFileSync(join(process.cwd(), "course/topics/fs-revenue-runrate.yaml"), "utf8");
  const doc = parse(text) as { scenes: Scene[] };
  const scene = doc.scenes.find((s) => s.id === "runrate-story");
  return (scene?.inputs?.beats ?? []).filter((b) => b.who === "wework").map((b) => b.says);
}

describe("runrate-story WeWork beat (#489)", () => {
  it("has a WeWork beat", () => {
    expect(weworkBeats().length).toBeGreaterThan(0);
  });

  it("does not claim $3 billion was reached in just six months from the start", () => {
    for (const says of weworkBeats()) {
      expect(says).not.toMatch(/reached \$3 billion[^.!?]*in just six months/i);
    }
  });

  it("puts the six months on the $2 billion to $3 billion step", () => {
    const says = weworkBeats().join(" ");
    expect(says).toMatch(/six months from \$2 billion to \$3 billion/i);
    expect(says).toMatch(/seven years/i);
  });
});
