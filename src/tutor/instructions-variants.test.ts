import { describe, expect, it } from "vitest";
import { ENGINE_INSTRUCTIONS, TUTOR_INSTRUCTIONS } from "./instructions";

describe("the Widget sentences per variant", () => {
  it("name show_widget and the rate Widget only for an engine-on Session", () => {
    expect(ENGINE_INSTRUCTIONS).toContain("show_widget with recipe rate_move");
    expect(ENGINE_INSTRUCTIONS).toContain("show the rate Widget");
    expect(TUTOR_INSTRUCTIONS).not.toContain("recipe rate_move");
    expect(TUTOR_INSTRUCTIONS).not.toContain("show the rate Widget");
    expect(TUTOR_INSTRUCTIONS).toContain("ready-made rate Widget");
  });
});
