import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { EMOJI, EMOJI_NAMES, emojiFor } from "./registry";

const DIR = join(process.cwd(), "public", "emoji");

/** Width and height from a WebP header: VP8 (lossy), VP8L (lossless) or VP8X (extended). */
function webpSize(b: Buffer): { width: number; height: number } {
  const kind = b.toString("ascii", 12, 16);
  if (kind === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  if (kind === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8X") return { width: b.readUIntLE(24, 3) + 1, height: b.readUIntLE(27, 3) + 1 };
  throw new Error(`not a WebP chunk: ${kind}`);
}

describe("the emoji registry and the vendored files (E1)", () => {
  it("has 140 to 180 unique kebab-case names", () => {
    expect(new Set(EMOJI_NAMES).size).toBe(EMOJI_NAMES.length);
    expect(EMOJI_NAMES.length).toBeGreaterThanOrEqual(140);
    expect(EMOJI_NAMES.length).toBeLessThanOrEqual(180);
    for (const n of EMOJI_NAMES) expect(n).toMatch(/^[a-z]+(-[a-z]+)*$/);
  });

  it("has a 160 x 160 WebP file for every name, each at most 12 KB, and at most 1.6 MB in all", () => {
    let total = 0;
    for (const name of EMOJI_NAMES) {
      const e = EMOJI[name];
      const path = join(DIR, e.file);
      expect(existsSync(path), `${name}: ${e.file} is missing`).toBe(true);
      const b = readFileSync(path);
      expect(b.toString("ascii", 0, 4), name).toBe("RIFF");
      expect(b.toString("ascii", 8, 12), name).toBe("WEBP");
      expect(webpSize(b), name).toEqual({ width: 160, height: 160 });
      expect(b.length, `${name} is ${b.length} bytes`).toBeLessThanOrEqual(12288);
      total += b.length;
    }
    expect(total).toBeLessThanOrEqual(1_600_000);
  });

  it("has an alt of 1 to 40 characters and 1 to 4 plain words, and a file named by its unicode", () => {
    for (const name of EMOJI_NAMES) {
      const e = EMOJI[name];
      expect(e.alt.length, name).toBeGreaterThanOrEqual(1);
      expect(e.alt.length, name).toBeLessThanOrEqual(40);
      expect(e.alt.split(/\s+/).length, `${name}: "${e.alt}"`).toBeLessThanOrEqual(4);
      expect(e.file).toBe(`${e.unicode}.webp`);
      expect(e.keywords.length, name).toBeGreaterThan(0);
    }
  });

  it("leaves no stray file in public/emoji/", () => {
    const wanted = new Set(EMOJI_NAMES.map((n) => EMOJI[n].file));
    const strays = readdirSync(DIR).filter((f) => f.endsWith(".webp") && !wanted.has(f));
    expect(strays).toEqual([]);
    expect(statSync(DIR).isDirectory()).toBe(true);
  });

  it("ships the MIT licence and lists every file in SOURCES.md", () => {
    expect(readFileSync(join(DIR, "LICENSE-fluent-emoji.txt"), "utf8")).toContain("Copyright (c) Microsoft Corporation");
    const sources = readFileSync(join(DIR, "SOURCES.md"), "utf8");
    for (const name of EMOJI_NAMES) {
      expect(sources, name).toContain(EMOJI[name].file);
      expect(sources, name).toContain(name);
    }
    expect(sources).toMatch(/\b[0-9a-f]{40}\b/);
  });

  it("finds the best match by keyword", () => {
    expect(emojiFor("money")).toBe("money-bag");
    expect(emojiFor("a speech")).toBe("speech-balloon");
    expect(emojiFor("qqqzzz xyzzy")).toBeNull();
  });
});
