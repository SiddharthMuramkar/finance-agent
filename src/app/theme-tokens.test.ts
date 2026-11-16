import { describe, expect, it } from "vitest";
import { darkTokens, lightTokens } from "./theme-tokens";

describe("the theme tokens, read from globals.css", () => {
  it("gives the share cards the Light colours, never the Dark ones", () => {
    expect(lightTokens()).toMatchObject({ ink: "#0b0d12", "ink-2": "#30353f", blue: "#1f3fae", "on-blue": "#ffffff", wash: "#f5f7fb", rule: "#e2e5ea" });
    expect(darkTokens()).toMatchObject({ paper: "#0e1117", ink: "#f2f4f8", blue: "#8aa4ff" });
  });

  it("reads only its own block, comments left out", () => {
    const css = ':root {\n  /* --ink: #123456; */\n  --ink: #000000;\n  --raised: var(--paper);\n}\n@media screen {\n  :root[data-theme="dark"] {\n    --ink: #ffffff;\n  }\n}\n:root[data-theme="dark"] .x {\n  color: red;\n}';
    expect(lightTokens(css)).toEqual({ ink: "#000000", raised: "var(--paper)" });
    expect(darkTokens(css)).toEqual({ ink: "#ffffff" });
  });
});
