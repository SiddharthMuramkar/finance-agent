import { describe, expect, it } from "vitest";
import { assertE2eSafe, e2eEnabled } from "./e2e-mode";

describe("e2e mode", () => {
  it("e2e mode refuses production and Vercel", () => {
    expect(e2eEnabled({ E2E: "1", NODE_ENV: "development" })).toBe(true);
    expect(e2eEnabled({ E2E: "1", NODE_ENV: "production" })).toBe(false);
    expect(e2eEnabled({ E2E: "1", NODE_ENV: "development", VERCEL: "1" })).toBe(false);
    expect(e2eEnabled({ NODE_ENV: "development" })).toBe(false);

    expect(() => assertE2eSafe({ E2E: "1", NODE_ENV: "production" })).toThrow(/production/);
    expect(() => assertE2eSafe({ E2E: "1", NODE_ENV: "development", VERCEL: "1" })).toThrow(/VERCEL/);
    expect(() => assertE2eSafe({ E2E: "1", NODE_ENV: "development", E2E_TUTOR: "scripted", ANTHROPIC_API_KEY: "x" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => assertE2eSafe({ NODE_ENV: "production", VERCEL: "1", ANTHROPIC_API_KEY: "x" })).not.toThrow();
    expect(() => assertE2eSafe({ NODE_ENV: "development" })).not.toThrow();
  });
});
