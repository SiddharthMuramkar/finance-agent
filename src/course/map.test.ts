import { describe, expect, it } from "vitest";
import { loadCourseMap, parseCourseMap } from "./map";

/** A minimal valid Topic file; tests override pieces of it. */
function topic(id: string, extra = "", checks = defaultChecks(id)) {
  return {
    name: `${id}.yaml`,
    text: `
id: ${id}
title: ${id}
stage: foundation
path: 1
${extra}
cases:
  - id: ${id}-case
    title: A case
    asOf: 2018-10-24
    story: What people knew then.
    reveal: What happened.
concept: The idea.
principle: The lesson.
${checks}
`,
  };
}

function defaultChecks(id: string) {
  return `checks:
  - id: ${id}-check
    kind: conversation
    prompt: Explain it.
    passCriteria: Explains it.`;
}

describe("Course Map validator", () => {
  it("accepts a valid map and lets Topics and Checks be found by ID", () => {
    const { map, errors } = parseCourseMap([topic("a"), topic("b", "prerequisites: [a]")]);
    expect(errors).toEqual([]);
    expect(map?.topic("b")?.prerequisites).toEqual(["a"]);
    expect(map?.check("a-check")?.topicId).toBe("a");
  });

  it("rejects a missing prerequisite", () => {
    const { errors } = parseCourseMap([topic("a", "prerequisites: [ghost]")]);
    expect(errors).toEqual(['Topic "a" requires "ghost", which is not on the Course Map']);
  });

  it("rejects a prerequisite loop", () => {
    const { errors } = parseCourseMap([
      topic("a", "prerequisites: [c]"),
      topic("b", "prerequisites: [a]"),
      topic("c", "prerequisites: [b]"),
    ]);
    expect(errors).toEqual(["Prerequisite loop: a -> c -> b -> a"]);
  });

  it("rejects duplicate IDs across Topics, Cases and Checks", () => {
    const dupCheck = `checks:
  - id: a-check
    kind: conversation
    prompt: Again.
    passCriteria: Again.`;
    const { errors } = parseCourseMap([topic("a"), topic("a"), topic("b", "", dupCheck)]);
    expect(errors).toEqual(['Duplicate ID "a"', 'Duplicate ID "a-case"', 'Duplicate ID "a-check"', 'Duplicate ID "a-check"']);
  });

  it("rejects a Topic without Checks", () => {
    const { errors } = parseCourseMap([topic("a", "", "checks: []")]);
    expect(errors).toEqual(['Topic "a" has no Checks']);
  });

  it("rejects a malformed file with its name", () => {
    const { errors } = parseCourseMap([{ name: "bad.yaml", text: "id: bad\nstage: someday\n" }]);
    expect(errors[0]).toMatch(/^bad\.yaml: /);
  });

  it("passes on the real Topic files", () => {
    const map = loadCourseMap();
    const pv = map.topic("present-value");
    expect(pv?.stage).toBe("foundation");
    expect(pv?.checks.length).toBeGreaterThanOrEqual(1);
    expect(pv?.cases[0].asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
