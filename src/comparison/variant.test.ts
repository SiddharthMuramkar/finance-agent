import { describe, expect, it } from "vitest";
import { parseVariant, parseVariants, variantLabel } from "./variant";

describe("comparison variants", () => {
  it("names the model and its reasoning effort, medium when left out", () => {
    expect(parseVariant("gpt-6.1-sol@high")).toEqual({ model: "gpt-6.1-sol", effort: "high" });
    expect(parseVariant("gpt-6.1-sol")).toEqual({ model: "gpt-6.1-sol", effort: "medium" });
    expect(variantLabel({ model: "gpt-6.1-sol", effort: "low" })).toBe("gpt-6.1-sol@low");
  });

  it("refuses an unknown effort and a model with no price", () => {
    expect(() => parseVariant("gpt-6.1-sol@huge")).toThrow(/effort/);
    expect(() => parseVariant("gpt-6.1-sol@low@high")).toThrow(/not a variant/);
    expect(() => parseVariant("gpt-nope-1@low")).toThrow(/no price/);
  });

  it("reads COMPARE_MODELS, or the fallback when it is empty", () => {
    expect(parseVariants(" gpt-6.1-sol@low , gpt-6.1-sol@high ", ["x"])).toEqual(["gpt-6.1-sol@low", "gpt-6.1-sol@high"]);
    expect(parseVariants(undefined, ["gpt-6.1-sol@low", "gpt-6.1-sol@medium"])).toEqual(["gpt-6.1-sol@low", "gpt-6.1-sol@medium"]);
    expect(parseVariants("", ["gpt-6.1-sol@low"])).toEqual(["gpt-6.1-sol@low"]);
  });
});
