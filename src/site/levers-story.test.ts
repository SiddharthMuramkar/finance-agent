import { describe, expect, it } from "vitest";
import { plain } from "./rich";
import { leverSteps } from "./levers-story";

// Signal spec 7.2.3, "Power sentences are generated from the model", and QA row 10 (lever 2: $0 to $102, reaches $84 at 17.5%), on the engine (#18).

describe("the levers story's power sentences", () => {
  const steps = leverSteps();

  it("come in the levers' display order with the spec's story sentences", () => {
    expect(steps.map((s) => s.name)).toEqual(["How big it gets", "What it keeps", "What growth costs", "How risky"]);
    expect(plain(steps[0].story)).toBe("Revenue in year 10: $39bn, against $1.1bn today.");
    expect(plain(steps[3].story)).toBe("Cost of capital while it grows: 12.84% a year.");
  });

  it("match the spec's current outputs", () => {
    expect(plain(steps[0].power)).toBe("On its own it can move his value anywhere from $0 to $81 a share. It cannot reach the $84 price by itself.");
    expect(plain(steps[1].power)).toBe("On its own it can move his value anywhere from $0 to $102 a share. It is the only lever that reaches the $84 price by itself, at 17.5%.");
    expect(plain(steps[2].power)).toBe("On its own it can move his value anywhere from $0 to $45 a share. It cannot reach the $84 price by itself.");
    expect(plain(steps[3].power)).toBe("This lever runs backwards. More risk means less value: from $53 at the safest setting down to $22 at the riskiest.");
  });
});
