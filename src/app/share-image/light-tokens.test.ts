import { describe, expect, it } from "vitest";
import { lightTokens } from "./light-tokens";

describe("the share cards' colours", () => {
  it("are the Light tokens of globals.css, never the Dark ones", () => {
    const light = lightTokens();
    expect(light).toMatchObject({ ink: "#0b0d12", "ink-2": "#30353f", blue: "#1f3fae", "on-blue": "#ffffff", wash: "#f5f7fb", rule: "#e2e5ea" });
  });

  it("read only the first :root block, its comments left out", () => {
    const css = ':root {\n  /* --ink: #123456; */\n  --ink: #000000;\n  --raised: var(--paper);\n}\n:root[data-theme="dark"] {\n  --ink: #ffffff;\n}';
    expect(lightTokens(css)).toEqual({ ink: "#000000", raised: "var(--paper)" });
  });
});
