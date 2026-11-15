import { describe, expect, it } from "vitest";
import { ENGINE_INSTRUCTIONS } from "./instructions";

describe("the Widget sentences", () => {
  it("name show_widget and the rate Widget", () => {
    expect(ENGINE_INSTRUCTIONS).toContain("show_widget with recipe rate_move");
    expect(ENGINE_INSTRUCTIONS).toContain("show the rate Widget");
    expect(ENGINE_INSTRUCTIONS).not.toContain("ready-made rate Widget");
  });
});
