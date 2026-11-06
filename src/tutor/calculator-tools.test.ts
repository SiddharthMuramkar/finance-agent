import { describe, expect, it } from "vitest";
import { TUTOR_INSTRUCTIONS, TUTOR_TOOLS } from "./instructions";
import { bindTools } from "./tools";

describe("hosted code execution", () => {
  it("is declared as Anthropic's code execution server tool, beside our own tools", () => {
    expect(TUTOR_TOOLS).toContainEqual({ type: "code_execution_20260521", name: "code_execution" });
  });

  it("is passed to the runner as it is: a server tool has nothing for us to run", () => {
    const bound = bindTools(TUTOR_TOOLS, {
      finish_teaching_step: { run: async () => "", parse: (x) => x },
      record_check_verdict: { run: async () => "", parse: (x) => x },
      record_insight_attempt: { run: async () => "", parse: (x) => x },
      save_learner_rule: { run: async () => "", parse: (x) => x },
      start_again: { run: async () => "", parse: (x) => x },
      search_library: { run: async () => "", parse: (x) => x },
      record_misconception: { run: async () => "", parse: (x) => x },
      open_widget: { run: async () => "", parse: (x) => x },
      calculate: { run: async () => "", parse: (x) => x },
      suggest_choice: { run: async () => "", parse: (x) => x },
    });
    const server = bound.find((t) => t.name === "code_execution");
    expect(server).toEqual({ type: "code_execution_20260521", name: "code_execution" });
    expect(server).not.toHaveProperty("run");
  });

  it("the Tutor is told the result proves the arithmetic ran, not that the formula is right", () => {
    expect(TUTOR_INSTRUCTIONS).toMatch(/proves only that the arithmetic ran/i);
    expect(TUTOR_INSTRUCTIONS).toMatch(/not that the formula is right/i);
  });

  it("the Tutor is told to use the calculate tool first and to give rupee sums in lakh and crore", () => {
    expect(TUTOR_INSTRUCTIONS).toMatch(/calculate tool/i);
    expect(TUTOR_INSTRUCTIONS).toMatch(/lakh/i);
    expect(TUTOR_INSTRUCTIONS).toMatch(/crore/i);
  });
});
