import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadCourseMap, parseCourseMap } from "./map";
import { isElective, parseOutline, renderCourseMapDoc, SPINE_LENGTH, spineCountProblems, spineTopics, SUBJECTS, usedInSpine } from "./outline";

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

/** A Spine entry (spec C1, C4): a number, a length and the Topics it draws on, with no Subject and no prerequisites. */
function spineEntry(id: string, spine: number, extra = "    minutes: 12\n", cases = defaultCase(id)) {
  return `  - id: ${id}
    title: Title of ${id}
    stage: spine
    spine: ${spine}
${extra}${cases}`;
}

const later = (id: string, stage = "follow") => entry(id).replace("stage: foundation", `stage: ${stage}`).replace('    subject: "Numbers & time value"\n', "");

describe("the Spine on the outline", () => {
  // Spine 2 sits first in the file and draws on a Topic placed after it: drawsOn is not a prerequisite, so neither matters.
  const text = outlineText(
    spineEntry("s-two", 2, "    minutes: 15\n    drawsOn: [b, c]\n"),
    spineEntry("s-one", 1, "    minutes: 10\n    drawsOn: [a, b]\n"),
    entry("a"),
    entry("b", "    prerequisites: [a]\n"),
    later("c"),
  );
  const { outline, errors } = parseOutline(text);

  it("accepts Spine entries with a number, a length and the Topics they draw on", () => {
    expect(errors).toEqual([]);
    expect(outline?.topics.find((t) => t.id === "s-one")).toMatchObject({ stage: "spine", spine: 1, minutes: 10, drawsOn: ["a", "b"], prerequisites: [] });
  });

  it("lists the Spine in its own order, whatever the file order", () => {
    expect(spineTopics(outline!).map((t) => t.id)).toEqual(["s-one", "s-two"]);
    expect(spineTopics(parseOutline(outlineText(entry("a"))).outline!)).toEqual([]);
  });

  it("calls a Foundation Topic an Elective, and nothing else", () => {
    expect(outline!.topics.filter(isElective).map((t) => t.id)).toEqual(["a", "b"]);
  });

  it("says which Spine Topics use each Topic's idea, lowest first", () => {
    expect([...usedInSpine(outline!)]).toEqual([
      ["a", [1]],
      ["b", [1, 2]],
      ["c", [2]],
    ]);
  });

  const problems = (...entries: string[]) => parseOutline(outlineText(...entries, entry("a"))).errors;

  it("rejects two Spine Topics with one number, and a Spine with a number left out", () => {
    expect(problems(spineEntry("s1", 1), spineEntry("s1b", 1))).toEqual(['Spine Topics "s1" and "s1b" both have Spine number 1']);
    expect(problems(spineEntry("s1", 1), spineEntry("s3", 3))).toEqual(["The Spine skips number 2: Spine numbers run from 1 with none left out"]);
    expect(problems(spineEntry("s3", 3))).toEqual(["The Spine skips numbers 1, 2: Spine numbers run from 1 with none left out"]);
  });

  it("rejects a Spine Topic with prerequisites, since what it builds on goes under drawsOn", () => {
    expect(problems(spineEntry("s1", 1, "    minutes: 12\n    prerequisites: [a]\n"))).toEqual([
      'Spine Topic "s1" lists prerequisites; a Spine Topic has none, and names what it builds on under drawsOn',
    ]);
  });

  it("rejects a Spine Topic with a Subject, no number, no length or one over fifteen minutes", () => {
    expect(problems(spineEntry("s1", 1, '    minutes: 12\n    subject: "Numbers & time value"\n'))).toEqual(['Topic "s1" is not Foundation, so it must not have a Subject']);
    expect(problems(spineEntry("s1", 1).replace("    spine: 1\n", ""))).toEqual(['Spine Topic "s1" has no Spine number']);
    expect(problems(spineEntry("s1", 1, ""))).toEqual(['Spine Topic "s1" does not say how many minutes it takes']);
    expect(problems(spineEntry("s1", 1, "    minutes: 20\n"))).toEqual(['Spine Topic "s1" takes 20 minutes; a Spine Topic takes 15 or fewer']);
  });

  it("holds SPINE_LENGTH Spine Topics (18 once the splits land) and rejects a Spine number past it (ADR 0020)", () => {
    const full = Array.from({ length: SPINE_LENGTH }, (_, i) => spineEntry(`s${i + 1}`, i + 1));
    expect(problems(...full)).toEqual([]);
    expect(problems(...full, spineEntry(`s${SPINE_LENGTH + 1}`, SPINE_LENGTH + 1)).join()).toContain("spine");
  });

  it("the course check requires exactly SPINE_LENGTH Spine Topics, no fewer (#93, ADR 0020)", () => {
    const spineOf = (n: number) => parseOutline(outlineText(...Array.from({ length: n }, (_, i) => spineEntry(`s${i + 1}`, i + 1)), entry("a"))).outline!;
    expect(spineCountProblems(spineOf(SPINE_LENGTH))).toEqual([]);
    expect(spineCountProblems(spineOf(SPINE_LENGTH - 1))).toEqual([
      `The Spine has ${SPINE_LENGTH - 1} Topics; it needs exactly ${SPINE_LENGTH}, numbered 1 to ${SPINE_LENGTH} (ADR 0020)`,
    ]);
  });

  it("rejects drawsOn that names a Topic not in the outline, a Spine Topic, or one Topic twice", () => {
    expect(problems(spineEntry("s1", 1, "    minutes: 12\n    drawsOn: [ghost]\n"))).toEqual(['Spine Topic "s1" draws on "ghost", which is not in the outline']);
    expect(problems(spineEntry("s1", 1), spineEntry("s2", 2, "    minutes: 12\n    drawsOn: [s1]\n"))).toEqual([
      'Spine Topic "s2" draws on "s1", which is a Spine Topic; drawsOn names the Topics outside the Spine it is built from',
    ]);
    expect(problems(spineEntry("s1", 1, "    minutes: 12\n    drawsOn: [a, a]\n"))).toEqual(['Spine Topic "s1" lists a Topic twice under drawsOn']);
  });

  it("keeps Spine numbers and drawsOn to Spine Topics", () => {
    expect(problems(entry("x", "    spine: 1\n    drawsOn: [a]\n"))).toEqual([
      'Topic "x" is not a Spine Topic, so it must not have a Spine number',
      'Topic "x" is not a Spine Topic, so it must not list drawsOn',
    ]);
  });

  it("lets a later Topic require a Spine Topic placed before it", () => {
    expect(parseOutline(outlineText(spineEntry("s1", 1), later("f").replace("    cases:", "    prerequisites: [s1]\n    cases:"))).errors).toEqual([]);
  });

  it("gives the Spine Topics' place, length and drawsOn to their written files", () => {
    const { map, errors: mapErrors } = parseCourseMap([topicFile("s-one"), topicFile("a")], outline);
    expect(mapErrors).toEqual([]);
    expect(map?.topic("s-one")).toMatchObject({ stage: "spine", spine: 1, minutes: 10, drawsOn: ["a", "b"], prerequisites: [] });
    expect(map?.topic("a")?.spine).toBeUndefined();
  });

  it("rejects a Topic file whose length disagrees with its outline entry", () => {
    const { errors: mapErrors } = parseCourseMap([topicFile("s-one", "minutes: 14")], outline);
    expect(mapErrors).toEqual(["s-one.yaml: the Topic file says it takes 14 minutes and the outline says 10; give one length"]);
  });

  it("puts the Spine first in the readable Course Map, numbered and timed, with what each draws on", () => {
    const doc = renderCourseMapDoc(outline!, new Set(["s-one"]));
    expect(doc).toContain("5 Topics (2 Spine, 2 Foundation, 1 Follow, 0 Judge, 0 Analyse)");
    expect(doc.indexOf("## Spine")).toBeLessThan(doc.indexOf("## Foundation"));
    expect(doc.indexOf("Title of s-one")).toBeLessThan(doc.indexOf("Title of s-two"));
    expect(doc).toContain("- ID: `s-one` · Written · Spine 1 · 10 minutes");
    expect(doc).toContain("- Draws on: Title of a, Title of b");
  });

  it("leaves the readable Course Map as it was while the outline has no Spine", () => {
    const doc = renderCourseMapDoc(parseOutline(outlineText(entry("a"))).outline!, new Set());
    expect(doc).toContain("1 Topics (1 Foundation, 0 Follow, 0 Judge, 0 Analyse)");
    expect(doc).not.toContain("Spine");
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

  it("covers all five Stages, the Spine first, and mentions India throughout the foundation block", () => {
    expect(new Set(outline?.topics.map((t) => t.stage))).toEqual(new Set(["spine", "foundation", "follow", "judge", "analyse"]));
    expect(outline?.topics.slice(0, 15).every((t) => t.stage === "spine")).toBe(true);
    const foundation = outline!.topics.filter((t) => t.stage === "foundation");
    const indian = foundation.filter((t) => /india|rbi|sebi|coffee day|satyam|sensex|yes bank|rupee|paytm|il&fs|jio|rs \d/i.test(JSON.stringify(t)));
    expect(indian.length).toBeGreaterThanOrEqual(25);
  });

  // Spec 2026-11-12 C4 and Appendix D: fifteen Spine Topics, each titled by the question it answers, built from the Topics
  // Appendix D names, on the Cases C4 names. Expected values are the spec's tables, not the outline read back.
  describe("the Spine", () => {
    const spine = spineTopics(outline!);
    const byNumber = (n: number) => spine.find((t) => t.spine === n)!;

    it("has the fifteen Topics in C4's order, each titled by its question", () => {
      expect(spine.map((t) => [t.spine, t.id])).toEqual([
        [1, "spine-01-worth"],
        [2, "spine-02-money-later"],
        [3, "spine-03-cash"],
        [4, "spine-04-growth"],
        [5, "spine-05-margins"],
        [6, "spine-06-growth-cost"],
        [7, "spine-07-risk"],
        [8, "spine-08-far-future"],
        [9, "spine-09-to-one-share"],
        [10, "spine-10-survival"],
        [11, "spine-11-story-to-numbers"],
        [12, "spine-12-price-or-value"],
        [13, "spine-13-price-assumes"],
        [14, "spine-14-being-wrong"],
        [15, "spine-15-value-yourself"],
        [16, "spine-annual-report"],
      ]);
      expect(byNumber(1).title).toBe("What is a business worth? Price against value, and the four levers");
      expect(byNumber(2).title).toBe("Why is money later worth less?");
      expect(byNumber(13).title).toBe("What does the price assume?");
      expect(byNumber(15).title).toBe("Value one yourself, as of a past date");
      expect(byNumber(16).title).toBe("Where are a valuation's numbers in an annual report?");
    });

    // #93: the Spine ends on finding a valuation's numbers in an annual report, which leads into the Assignments. This branch
    // holds 16 Spine Topics; with #90's and #91's splits the Spine is 18, and the merger sets SPINE_LENGTH and this to 18.
    it("ends on the annual report Topic, and the course check holds the Spine to its length", () => {
      expect(spine.at(-1)?.id).toBe("spine-annual-report");
      expect(spine.length).toBe(16);
      expect(spineCountProblems(outline!)).toEqual([]);
    });

    it("finds the numbers in one annual report from each of the US, India, Japan, Korea and Europe, from the filings themselves (#93, #94)", () => {
      const cases = byNumber(16).cases;
      expect(cases.map((c) => c.asOf)).toEqual(["2001-03-23", "2022-08-05", "2025-05-08", "2025-03-11", "2025-03-25"]);
      expect(cases[0].sources).toContain("https://www.sec.gov/Archives/edgar/data/1018724/000103221001500087/d10k405.txt");
      expect(cases[1].sources).toContain("https://www.bseindia.com/bseplus/AnnualReport/543320/74160543320.pdf");
      expect(cases[2].sources).toContain("https://www.nintendo.co.jp/ir/pdf/2025/250508e.pdf");
      expect(cases[3].sources).toContain("https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20250311001085");
      expect(cases[4].sources).toContain("https://lvmh-com.cdn.prismic.io/lvmh-com/Z-PY3HdAxsiBv6wN_UniversalRegistrationDocument2024.pdf");
      expect(cases.every((c) => c.verified)).toBe(true);
    });

    it("says how long each takes: ten minutes for the first, fifteen for the last, none over fifteen (C2, C5)", () => {
      expect(byNumber(1).minutes).toBe(10);
      expect(byNumber(15).minutes).toBe(15);
      for (const t of spine.slice(1, 14)) expect(t.minutes).toBeGreaterThanOrEqual(12);
      for (const t of spine) expect(t.minutes).toBeLessThanOrEqual(15);
    });

    it("draws on the Topics Appendix D names", () => {
      expect(byNumber(1).drawsOn).toEqual(["val-dcf", "fol-tesla-2020", "fol-twitter-ipo"]);
      expect(byNumber(7).drawsOn).toEqual(["risk-capm", "cf-wacc", "risk-portfolio", "bond-credit-spreads", "num-percent-bps"]);
      expect(byNumber(15).drawsOn).toEqual(["ana-build-valuation", "val-india"]);
      expect(usedInSpine(outline!).get("val-dcf")).toEqual([1, 8, 9]);
    });

    it("runs Amazon in February 2000 through Topics 1, 7, 8, 9, 13 and one choice in 15", () => {
      const amazon = spine.filter((t) => t.cases.some((c) => /amazon/i.test(c.title) && c.asOf === "2000-02-01")).map((t) => t.spine);
      expect(amazon).toEqual([1, 7, 8, 9, 13, 15]);
    });

    it("copies each Case it reuses from its Elective entry, sources and all", () => {
      const elective = (id: string) => outline!.topics.find((t) => t.id === id)!.cases;
      // The Spine copies title, as-of date, outcome, sources and verified; the Elective keeps its research note.
      expect(byNumber(1).cases).toEqual(elective("val-dcf").map((c) => ({ title: c.title, asOf: c.asOf, outcome: c.outcome, sources: c.sources, verified: c.verified })));
      expect(byNumber(2).cases[0].title).toBe("The $1.537 billion Mega Millions jackpot");
      expect(byNumber(10).cases[0].title).toBe("Coffee Day Enterprises in July 2019");
    });

    it("offers Zomato's IPO in Topic 15, verified from its research, beside Coffee Day in rupees", () => {
      const cases = byNumber(15).cases;
      expect(cases.map((c) => c.title)).toEqual(["Build your own value for Amazon.com", "Coffee Day's IPO, in rupees and in dollars", "Zomato's IPO, valued in rupees"]);
      // Damodaran's Rs 40.79 against the Rs 76 offer: docs/research/verify-zomato-2021.json reproduces it from sources, so it is verified.
      expect(cases[2]).toMatchObject({ asOf: "2021-07-21", verified: true });
      expect(cases[2].sources).toContain("https://aswathdamodaran.blogspot.com/2021/07/the-zomato-ipo-bet-on-big-markets-and.html");
      expect(cases[2].outcome).toContain("Rs 40.79");
      expect(spine.flatMap((t) => t.cases).filter((c) => !c.verified).map((c) => c.title)).toEqual([]);
    });
  });

  // Issue #498: the fs-links story says investors forced the Maytas call-off in December 2008, so its sources must hold
  // a dated December 2008 report of that, not only the Raju letter and the SEC release.
  it("cites a dated December 2008 Maytas source for the fs-links Case", () => {
    const sources = outline!.topics.find((t) => t.id === "fs-links")?.cases.flatMap((c) => c.sources) ?? [];
    expect(sources).toContain("https://www.indiatoday.in/latest-headlines/story/satyam-calls-off-16-bn-maytas-deal-35355-2008-12-17");
    expect(sources).toContain("https://www.reuters.com/article/marketsNews/idINN1628370020081216/");
  });
});
