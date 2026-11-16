import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// #74 and the glossary: a Story is someone's claim to judge, so no screen says "your story". Some of these lines only show
// after a drag (the win line, the lab's reading), so the files' words are read here, comments left out.
const FILES = ["src/site/copy.ts", "src/site/examples.ts", "src/components/signal/LeversWidget.tsx", "src/finance/signal/levers.ts", "src/site/levers-story.ts"];
const code = (file: string) =>
  readFileSync(join(process.cwd(), file), "utf8")
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join("\n");

describe("the public site's words", () => {
  it.each(FILES)("%s never says 'your story' or 'his story'", (file) => {
    expect(code(file)).not.toMatch(/\b(your|his) story\b/i);
  });
});
