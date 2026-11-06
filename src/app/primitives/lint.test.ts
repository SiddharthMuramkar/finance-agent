// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint();
async function messages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages.filter((m) => m.ruleId === "no-restricted-syntax");
}

describe("raw buttons", () => {
  it("raw button is an error outside primitives", async () => {
    const bad = await messages('export const A = () => <button className="x" />;\n', "src/app/foo.tsx");
    expect(bad).toHaveLength(1);
    expect(bad[0].message).toContain("Use Button, IconButton or Chip from src/app/primitives");
    expect(await messages('export const A = () => <button className="x" />;\n', "src/app/primitives/x.tsx")).toEqual([]);
    expect(await messages('export const A = () => <div role="button" />;\n', "src/app/foo.tsx")).toHaveLength(1);
  });

  it("the src/app allowlist is empty and the widget allowlist can only shrink", async () => {
    // @ts-expect-error plain .mjs config without types
    const { RAW_BUTTON_ALLOWLIST } = (await import("../../../eslint.config.mjs")) as { RAW_BUTTON_ALLOWLIST: string[] };
    // Widget files that have raw buttons today (spec A3a test 2); a later ticket may remove names, never add.
    const widgets = [
      "src/widgets/primitives/wave2/step-through.tsx",
      "src/widgets/primitives/wave2/rank.tsx",
      "src/widgets/primitives/wave1/quick-check.tsx",
      "src/widgets/primitives/wave2/rate-move.tsx",
      "src/widgets/primitives/wave2/draw-the-line.tsx",
      "src/widgets/primitives/wave1/waffle.tsx",
      "src/widgets/primitives/wave1/predict.tsx",
      "src/widgets/library.tsx",
      "src/widgets/history-plot.tsx",
    ];
    const list = RAW_BUTTON_ALLOWLIST as string[];
    expect(list.filter((f) => f.startsWith("src/widgets/")).sort()).toEqual([...widgets].sort());
    // The A3b sweep emptied the src/app side: only the 9 Widget files are left, and they can only be removed.
    expect(list.filter((f) => f.startsWith("src/app/"))).toEqual([]);
    expect(list).toHaveLength(9);
  });
});
