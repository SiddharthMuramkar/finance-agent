import { describe, expect, it } from "vitest";
import { isDemoMode } from "./demo-mode";

describe("Demo mode", () => {
  it("is off without the env flag, even with ?demo=1", () => {
    expect(isDemoMode({ demo: "1" }, {})).toBe(false);
    expect(isDemoMode({ demo: "1" }, { WORKSPACE_DEMO: "0" })).toBe(false);
  });
  it("is off without ?demo=1, even with the env flag", () => {
    expect(isDemoMode({}, { WORKSPACE_DEMO: "1" })).toBe(false);
    expect(isDemoMode(undefined, { WORKSPACE_DEMO: "1" })).toBe(false);
  });
  it("is on only with both", () => {
    expect(isDemoMode({ demo: "1" }, { WORKSPACE_DEMO: "1" })).toBe(true);
  });
});
