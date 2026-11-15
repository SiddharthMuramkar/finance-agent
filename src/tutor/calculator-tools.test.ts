import { describe, expect, it } from "vitest";
import { ENGINE_INSTRUCTIONS, ENGINE_TOOLS } from "./instructions";
import { bindTools } from "./tools";

describe("hosted code execution", () => {
  it("is not offered: every tool is an OpenAI function tool with our code bound to it (ADR 0007)", () => {
    expect(ENGINE_TOOLS.every((t) => t.type === "function" && t.strict === false)).toBe(true);
    expect(ENGINE_TOOLS.map((t) => t.name)).not.toContain("code_execution");
    const bound = bindTools(ENGINE_TOOLS, {
      finish_teaching_step: { run: async () => "", parse: (x) => x },
      record_check_verdict: { run: async () => "", parse: (x) => x },
      record_insight_attempt: { run: async () => "", parse: (x) => x },
      save_learner_rule: { run: async () => "", parse: (x) => x },
      start_again: { run: async () => "", parse: (x) => x },
      search_library: { run: async () => "", parse: (x) => x },
      record_misconception: { run: async () => "", parse: (x) => x },
      open_widget: { run: async () => "", parse: (x) => x },
      show_widget: { run: async () => "", parse: (x) => x },
      update_widget: { run: async () => "", parse: (x) => x },
      calculate: { run: async () => "", parse: (x) => x },
      suggest_choice: { run: async () => "", parse: (x) => x },
    });
    expect(bound.every((t) => typeof t.run === "function")).toBe(true);
  });

  it("no instruction mentions code execution", () => {
    expect(ENGINE_INSTRUCTIONS).not.toMatch(/code execution/i);
  });

  it("the Tutor is told to use the calculate tool first and to give rupee sums in lakh and crore", () => {
    expect(ENGINE_INSTRUCTIONS).toMatch(/calculate tool/i);
    expect(ENGINE_INSTRUCTIONS).toMatch(/lakh/i);
    expect(ENGINE_INSTRUCTIONS).toMatch(/crore/i);
  });
});
