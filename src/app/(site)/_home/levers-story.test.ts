import { describe, expect, it } from "vitest";
import { PRESETS, REFERENCE } from "@/finance/signal/levers";
import { leverSteps } from "@/site/levers-story";
import { activeStep, stageAt, STORY_START, storyReducer, YOUR_TURN, type StoryAction, type StoryState } from "./levers-story";

// Home's levers scroll story (Signal spec 7.2.3): the scroll spy and the step rules that drive the lever lab.

const run = (...actions: StoryAction[]): StoryState => actions.reduce(storyReducer, STORY_START);

describe("the levers story's scroll spy", () => {
  it("picks the last step whose top is above the line", () => {
    expect(activeStep([0, 300, 900], 500)).toBe(1);
    expect(activeStep([600, 900], 500)).toBe(0);
    expect(activeStep([-800, -200, 100], 500)).toBe(2);
  });
});

describe("the levers story's stage", () => {
  const steps = leverSteps();

  it("shows his story with no lever live at step 0, one lever live and banded at steps 1 to 4, and all four at step 5", () => {
    expect(STORY_START.values).toEqual(REFERENCE);
    expect(stageAt(0, steps)).toEqual({ live: false, focus: null });
    expect([1, 2, 3, 4].map((step) => stageAt(step, steps).focus)).toEqual(["rev", "margin", "s2c", "wacc"]);
    expect(stageAt(YOUR_TURN, steps)).toEqual({ live: true, focus: null });
  });

  it("resets to his story on entering a lever step, even after a drag in the step before", () => {
    const state = run({ type: "step", step: 1 }, { type: "move", key: "rev", value: 60 }, { type: "step", step: 2 });
    expect(state.values).toEqual(REFERENCE);
  });

  it("saves the learner's story on leaving step 5 and restores it on coming back", () => {
    const mine = run({ type: "step", step: YOUR_TURN }, { type: "move", key: "margin", value: 14 });
    const away = storyReducer(mine, { type: "step", step: 3 });
    expect(away.values).toEqual(REFERENCE);
    const back = storyReducer(away, { type: "step", step: YOUR_TURN });
    expect(back.values).toEqual({ ...REFERENCE, margin: 14 });
  });

  it("switches to step 5 first when a preset is tapped, whatever the step, then applies the preset", () => {
    const state = run({ type: "step", step: 2 }, { type: "preset", key: "price" });
    expect(state.step).toBe(YOUR_TURN);
    expect(state.values).toEqual(PRESETS.price.levers);
  });
});
