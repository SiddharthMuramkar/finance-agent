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

  it("the src/app allowlist is empty and the raw-button allowlist is empty", async () => {
    // @ts-expect-error plain .mjs config without types
    const { RAW_BUTTON_ALLOWLIST } = (await import("../../../eslint.config.mjs")) as { RAW_BUTTON_ALLOWLIST: string[] };
    // Widget files allowed a raw button: none since A3b, A5, A7b and A8 (spec 2026-11-11); the list stays empty.
    const widgets: string[] = [];
    const list = RAW_BUTTON_ALLOWLIST as string[];
    expect(list.filter((f) => f.startsWith("src/widgets/")).sort()).toEqual([...widgets].sort());
    expect(list.filter((f) => f.startsWith("src/app/"))).toEqual([]);
    expect(list).toEqual([]);
  });
});
