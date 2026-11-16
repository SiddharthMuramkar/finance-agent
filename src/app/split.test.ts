import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextSplit, parseSplit, shareAtPointer, splitBounds, splitStyle } from "./split";

// The Study Workspace's share (spec 2026-11-11, C2a): the conversation's whole-percent share of the two columns' width,
// saved in the `split` cookie. Expected values are the spec's.
describe("the split share", () => {
  it("a saved share opens as the Learner left it, and anything unreadable opens 45", () => {
    for (const raw of [undefined, "", "abc", "45.5", "-3", "1e2"]) expect(parseSplit(raw), String(raw)).toBe(45);
    expect(parseSplit("45")).toBe(45);
    expect(parseSplit("60")).toBe(60);
    expect(parseSplit("033")).toBe(33);
    expect(parseSplit("10")).toBe(33);
    expect(parseSplit("90")).toBe(67);
    expect(splitStyle(60)).toEqual({ "--split-saved": "60" });
  });

  it("the frame's CSS: the share, the handle's --gap column and two 360 px floors, the saved share from 1024 px up", () => {
    const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
    const rule = css.match(/\.workspace-split \{[^}]*\}/)?.[0] ?? "";
    expect(rule).toContain("--chat-share: 45;");
    expect(rule).toContain("grid-template-columns: minmax(360px, calc((100% - var(--gap)) * var(--chat-share) / 100)) var(--gap) minmax(360px, 1fr);");
    expect(css).toMatch(/\.workspace-split \{\s*@variant lg \{ --chat-share: var\(--split-saved, 45\); \}/);
  });

  it("the limits, the keys and the pointer", () => {
    expect(splitBounds(974.85)).toEqual({ min: 37, max: 63 });
    expect(splitBounds(1218.56)).toEqual({ min: 33, max: 67 });
    expect(splitBounds(1439.42)).toEqual({ min: 33, max: 67 });
    expect(splitBounds(1830.56)).toEqual({ min: 33, max: 67 });
    expect(splitBounds(0)).toEqual({ min: 33, max: 67 });
    const wide = { min: 33, max: 67 };
    expect(nextSplit(45, "ArrowRight", wide)).toBe(47);
    expect(nextSplit(45, "ArrowLeft", wide)).toBe(43);
    expect(nextSplit(45, "Home", wide)).toBe(33);
    expect(nextSplit(45, "End", wide)).toBe(67);
    expect(nextSplit(66, "ArrowRight", wide)).toBe(67);
    expect(nextSplit(45, "Home", { min: 37, max: 63 })).toBe(37);
    expect(nextSplit(45, "Enter", wide)).toBeNull();
    expect(nextSplit(45, "Tab", wide)).toBeNull();
    const frame = { left: 24.19, width: 1463.62 };
    expect(shareAtPointer(899.95, frame, 24.19, wide)).toBe(60);
    expect(shareAtPointer(0, frame, 24.19, wide)).toBe(33);
    expect(shareAtPointer(1511, frame, 24.19, wide)).toBe(67);
  });
});
