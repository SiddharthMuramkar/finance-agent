import { describe, expect, it } from "vitest";

// Next's webpack CSS loader rejects plugin objects and functions ("Malformed PostCSS Configuration").
describe("postcss.config.mjs", () => {
  it("lists every plugin by name or path with an options object", async () => {
    const path = "../../postcss.config.mjs";
    const { default: config } = (await import(/* @vite-ignore */ path)) as { default: { plugins: Record<string, unknown> } };
    const entries = Object.entries(config.plugins);
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, options] of entries) {
      expect(typeof key).toBe("string");
      expect(typeof options).toBe("object");
      expect(options).not.toBeNull();
    }
  });
});
