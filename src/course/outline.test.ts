import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCourseMap, parseCourseMap } from "./map";
import { parseOutline, renderCourseMapDoc, SUBJECTS } from "./outline";

function entry(id: string, extra = "", cases = defaultCase(id)) {
  return `  - id: ${id}
    title: Title of ${id}
    stage: foundation
    subject: "Numbers & time value"
${extra}${cases}`;
}

function defaultCase(id: string) {
  return `    cases:
      - title: A case for ${id}
        asOf: 1994-02-03
        outcome: What happened afterwards.
        sources: [https://example.org/${id}]
        verified: true
`;
}

const outlineText = (...entries: string[]) => `topics:\n${entries.join("")}`;

function topicFile(id: string, extra = "") {
  return {
    name: `${id}.yaml`,
    text: `
id: ${id}
title: ${id}
${extra}
cases:
  - id: ${id}-case
    title: A case
    asOf: 2018-10-24
    story: What people knew then.
    reveal: What happened.
concept: The idea.
principle: The lesson.
checks:
  - id: ${id}-check
    kind: conversation
    prompt: Explain it.
    passCriteria: Explains it.
`,
  };
}

describe("Course Map outline", () => {
  it("accepts an outline and numbers the default path in file order", () => {
    const { outline, errors } = parseOutline(outlineText(entry("a"), entry("b", "    prerequisites: [a]\n")));
    expect(errors).toEqual([]);
    expect(outline?.topics.map((t) => [t.id, t.path])).toEqual([["a", 1], ["b", 2]]);
  });

  it("rejects duplicate Topic IDs", () => {
    const { errors } = parseOutline(outlineText(entry("a"), entry("a")));
    expect(errors).toContain('Duplicate Topic ID "a"');
  });

  it("rejects a missing prerequisite", () => {
    const { errors } = parseOutline(outlineText(entry("a", "    prerequisites: [ghost]\n")));
    expect(errors).toEqual(['Topic "a" requires "ghost", which is not in the outline']);
  });

  it("rejects a prerequisite loop", () => {
    const { errors } = parseOutline(
      outlineText(entry("a", "    prerequisites: [c]\n"), entry("b", "    prerequisites: [a]\n"), entry("c", "    prerequisites: [b]\n")),
    );
    expect(errors).toEqual(["Prerequisite loop: a -> c -> b -> a"]);
  });

  it("rejects a default path that puts a Topic before its prerequisite", () => {
    const { errors } = parseOutline(outlineText(entry("b", "    prerequisites: [a]\n"), entry("a")));
    expect(errors).toEqual(['Topic "b" comes before its prerequisite "a" on the default path']);
  });

  it("needs a Case with a source and a known outcome for every Topic", () => {
    const noCase = parseOutline(outlineText(entry("a", "", "    cases: []\n")));
    expect(noCase.errors.join()).toContain("cases");
    const noSource = parseOutline(outlineText(entry("a", "", defaultCase("a").replace("[https://example.org/a]", "[]"))));
    expect(noSource.errors.join()).toContain("sources");
  });

  it("flags a Case whose facts are not yet verified, so the writer checks it before writing the Topic", () => {
    const { outline } = parseOutline(outlineText(entry("a", "", defaultCase("a").replace("verified: true", "verified: false"))));
    expect(outline?.topics[0].cases[0].verified).toBe(false);
  });
});

describe("Course Map written against the outline", () => {
  const outline = parseOutline(outlineText(entry("a"), entry("b", "    prerequisites: [a]\n"), entry("c", "    prerequisites: [b]\n"))).outline!;

  it("takes Stage, place and prerequisites from the outline and lists the Topics not yet written as coming", () => {
    const { map, errors } = parseCourseMap([topicFile("c")], outline);
    expect(errors).toEqual([]);
    expect(map?.topic("c")).toMatchObject({ stage: "foundation", path: 3, prerequisites: [] });
    expect(map?.coming.map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("keeps a prerequisite that is written and drops one that is not", () => {
    const { map } = parseCourseMap([topicFile("b"), topicFile("c")], outline);
    expect(map?.topics.map((t) => [t.id, t.prerequisites])).toEqual([["b", []], ["c", ["b"]]]);
  });

  it("puts written Topics in outline order, whatever their file names", () => {
    const { map } = parseCourseMap([topicFile("c"), topicFile("a")], outline);
    expect(map?.topics.map((t) => t.id)).toEqual(["a", "c"]);
  });

  it("rejects a Topic file that has no entry in the outline", () => {
    const { errors } = parseCourseMap([topicFile("zzz")], outline);
    expect(errors).toEqual(['zzz.yaml: Topic "zzz" is not in the outline']);
  });

  it("rejects a Topic file that sets what the outline owns", () => {
    const { errors } = parseCourseMap([topicFile("a", "stage: judge\nprerequisites: [b]")], outline);
    expect(errors.join("\n")).toContain("belong in the outline");
  });
});

describe("readable Course Map document", () => {
  const outline = parseOutline(outlineText(entry("a"), entry("b", "    prerequisites: [a]\n"))).outline!;

  it("lists every Topic in path order with its Cases, marks written Topics, and is the same every time", () => {
    const doc = renderCourseMapDoc(outline, new Set(["a"]));
    expect(doc.indexOf("Title of a")).toBeLessThan(doc.indexOf("Title of b"));
    expect(doc).toContain("https://example.org/a");
    expect(doc).toContain("Written");
    expect(doc).toContain("Coming");
    expect(renderCourseMapDoc(outline, new Set(["a"]))).toBe(doc);
  });

  it("changes when the outline changes, so a stale copy can be caught", () => {
    const other = parseOutline(outlineText(entry("a"), entry("b", "    prerequisites: [a]\n").replace("Title of b", "Renamed"))).outline!;
    expect(renderCourseMapDoc(other, new Set())).not.toBe(renderCourseMapDoc(outline, new Set()));
  });
});

describe("Subjects", () => {
  it("errors when a Foundation Topic has no Subject", () => {
    const text = outlineText(entry("a").replace('    subject: "Numbers & time value"\n', ""));
    expect(parseOutline(text).errors).toEqual(['Foundation Topic "a" has no Subject']);
  });

  it("errors when a Subject is not one of the nine", () => {
    const text = outlineText(entry("a").replace("Numbers & time value", "Astrology"));
    expect(parseOutline(text).errors.join()).toContain("subject");
  });

  it("errors when a later-Stage Topic has a Subject", () => {
    const text = outlineText(entry("a").replace("stage: foundation", "stage: follow"));
    expect(parseOutline(text).errors).toEqual(['Topic "a" is not Foundation, so it must not have a Subject']);
  });
});

describe("the real outline", () => {
  it("gives every Foundation Topic one of the nine Subjects and later Topics none", () => {
    const { outline } = parseOutline(readFileSync(join(process.cwd(), "course", "outline.yaml"), "utf8"));
    for (const t of outline!.topics) {
      if (t.stage === "foundation") expect(SUBJECTS).toContain(t.subject);
      else expect(t.subject).toBeUndefined();
    }
  });

  const { outline, errors } = parseOutline(readFileSync(join(process.cwd(), "course", "outline.yaml"), "utf8"));
  const pathOf = (id: string) => outline?.topics.find((t) => t.id === id)?.path ?? -1;

  it("is valid", () => {
    expect(errors).toEqual([]);
  });

  it("puts financial statements right after basic maths and beside present value", () => {
    expect(pathOf("num-compounding")).toBeLessThan(pathOf("present-value"));
    expect(pathOf("present-value")).toBeLessThan(pathOf("fs-income"));
    expect(pathOf("fs-income") - pathOf("present-value")).toBe(1);
    expect(pathOf("fs-links")).toBeLessThan(pathOf("eco-money-banking"));
  });

  it("matches the written present value Topic, which takes its place from the outline", () => {
    const map = loadCourseMap();
    expect(map.topic("present-value")).toMatchObject({ stage: "foundation", path: pathOf("present-value") });
    expect(map.coming.length).toBe(outline!.topics.length - map.topics.length);
  });

  it("covers all four Stages and mentions India throughout the foundation block", () => {
    expect(new Set(outline?.topics.map((t) => t.stage))).toEqual(new Set(["foundation", "follow", "judge", "analyse"]));
    const foundation = outline!.topics.filter((t) => t.stage === "foundation");
    const indian = foundation.filter((t) => /india|rbi|sebi|coffee day|satyam|sensex|yes bank|rupee|paytm|il&fs|jio|rs \d/i.test(JSON.stringify(t)));
    expect(indian.length).toBeGreaterThanOrEqual(25);
  });
});
