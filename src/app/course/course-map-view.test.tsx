import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadCourseMap } from "@/course/map";
import { courseOverview, jumpTo, navigate, whatComesNext, type Progress, type TopicOverview } from "@/course/navigator";
import { CourseMapView } from "./course-map-view";

const topic = (t: Partial<TopicOverview> & Pick<TopicOverview, "id" | "title">): TopicOverview => ({
  stage: "foundation",
  subject: "Numbers & time value",
  status: "not_started",
  step: null,
  checks: [{ id: `${t.id}-1`, passed: false, here: false }],
  unmetPrerequisites: [],
  current: false,
  onDefaultPath: false,
  ...t,
});

const topics: TopicOverview[] = [
  topic({ id: "compounding", title: "Compounding", status: "passed", checks: [{ id: "co-1", passed: true, here: false }] }),
  topic({
    id: "pv",
    title: "Present value",
    status: "in_progress",
    step: "concept",
    checks: [
      { id: "pv-1", passed: true, here: false },
      { id: "pv-2", passed: false, here: true },
    ],
    current: true,
    onDefaultPath: true,
  }),
  topic({ id: "statements", title: "Reading a balance sheet", subject: "Financial statements" }),
  topic({ id: "bonds", title: "Bond prices", stage: "follow", subject: null, unmetPrerequisites: ["pv"] }),
  topic({ id: "j", title: "Judge one", stage: "judge", subject: null }),
  topic({ id: "a", title: "Analyse one", stage: "analyse", subject: null }),
];

const recommended = { topicId: "pv", label: "Resume: Present value" };
const render = (over: Partial<Parameters<typeof CourseMapView>[0]> = {}) =>
  renderToStaticMarkup(<CourseMapView topics={topics} recommended={recommended} sessions={{ compounding: 41 }} {...over} />);
/** One Topic row's markup: from its data-topic up to the next row or the end of its list. */
const row = (html: string, id: string) => html.split(`data-topic="${id}"`)[1].split(/data-topic=|<\/ol>/)[0];

describe("the Course Map page", () => {
  it("starts with one Recommended next card that shows What comes next", () => {
    const html = render();
    const card = html.split("data-recommended-next")[1];
    expect(html.indexOf("data-recommended-next")).toBeLessThan(html.indexOf("data-topic="));
    expect(card).toContain("Recommended next");
    expect(card).toContain("Resume: Present value →");
    expect(html.match(/data-recommended-next/g)).toHaveLength(1);
  });

  it("lays the Recommended next card and the off-path card side by side", () => {
    const html = render();
    expect(html).toMatch(/<div class="[^"]*md:grid-cols-2[^"]*"><div data-recommended-next/);
  });

  // ADR 0015: Terrastack's numbered markers, never a dot or a ring that could read as a radio button.
  it("numbers each Topic by its place in its group, accents the current one and checks a passed one", () => {
    const html = render();
    expect(row(html, "statements")).toMatch(/data-marker="todo"[^>]*class="[^"]*text-\[var\(--muted\)\][^"]*"[^>]*>\d{2}<\/span>/);
    expect(row(html, "pv")).toMatch(/data-marker="current"[^>]*class="[^"]*text-\[var\(--accent\)\][^"]*"[^>]*>02<\/span>/);
    expect(row(html, "compounding")).toMatch(/data-marker="passed"[^>]*><svg[^>]*text-\[var\(--success\)\]/);
    expect(html).not.toContain("data-dot");
  });

  it("has one active row: the current Topic, with an accent line, a tint and aria-current=location", () => {
    const html = render();
    expect(html.match(/aria-current="location"/g)).toHaveLength(1);
    expect(row(html, "pv")).toContain('aria-current="location"');
    expect(html).toMatch(/<li data-topic="pv"[^>]*class="[^"]*border-\[var\(--accent-fill\)\][^"]*bg-\[var\(--accent-tint\)\]/);
    expect(html).toMatch(/<li data-topic="statements"[^>]*class="[^"]*\bborder-t\b[^"]*border-\[var\(--rule\)\] hover:bg-\[var\(--wash\)\]/);
  });

  it("draws the group and Coming summaries as hairline rows, with no box, lip or lift", () => {
    const html = render({ coming: [{ id: "x", title: "X", stage: "follow" }] });
    const summaries = [...html.matchAll(/<summary class="([^"]*)"/g)].map((m) => m[1]);
    expect(summaries.length).toBeGreaterThan(1);
    for (const cls of summaries) {
      expect(cls).toContain("border-b border-[var(--rule)]");
      expect(cls).not.toMatch(/shadow-\[0_2px_0|translate|rounded/);
    }
  });

  it("has no Recommended next card once every Topic is passed", () => {
    expect(render({ recommended: null })).not.toContain("data-recommended-next");
  });

  it("groups Foundation Topics by Subject in collapsible sections, with only the current Subject open", () => {
    const html = render();
    const subjects = [...html.matchAll(/<details[^>]*>/g)]
      .map((m) => m[0])
      .filter((tag) => tag.includes("data-subject"))
      .map((tag) => [tag.match(/data-subject="([^"]+)"/)![1], / open=""/.test(tag)]);
    expect(subjects).toEqual([
      ["Numbers &amp; time value", true],
      ["Financial statements", false],
    ]);
    expect(html.split('data-subject="Financial statements"')[1]).toContain('data-topic="statements"');
  });

  it("gives Follow, Judge and Analyse their own sections after the Electives (the Foundation Topics)", () => {
    const html = render();
    expect([...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])).toEqual(["Electives", "Follow", "Judge", "Analyse"]);
    const stops = [...html.matchAll(/data-topic="([^"]+)"/g)].map((m) => m[1]);
    expect(stops).toEqual(["compounding", "pv", "statements", "bonds", "j", "a"]);
  });

  it("makes each Topic row one whole-row link, with no separate per-row button", () => {
    const html = render();
    expect(html).not.toContain("Study this Topic");
    for (const id of ["compounding", "pv", "statements", "bonds"]) {
      expect(row(html, id)).not.toMatch(/<button/);
      expect(row(html, id).match(/<a [^>]*data-row-link/g)).toHaveLength(1);
    }
  });

  it("draws each Topic row's title as a reading-area link, blue and underlined, never ink (spec F4)", () => {
    const links = [...render().matchAll(/<a [^>]*data-row-link="[^"]+"[^>]*>/g)].map((m) => m[0]);
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) {
      expect(a).toMatch(/class="link /);
      expect(a).not.toContain("--ink");
    }
  });

  it("shows prerequisites as Do first links that open that Topic", () => {
    const bonds = row(render(), "bonds");
    expect(bonds).toMatch(/Do first: (<span>)?<a [^>]*data-jump="pv"[^>]*>Present value<\/a>/);
  });

  it("marks the Learner's place", () => {
    expect(render()).toContain("You are here");
  });

  it("shows Passed ✓ on a passed row, which opens the Topic's Session read-only", () => {
    const compounding = row(render(), "compounding");
    expect(compounding).toMatch(/data-tone="success"[^>]*>Passed<\/span>/);
    expect(compounding).toMatch(/<a [^>]*href="\/sessions\/41"/);
    expect(compounding).not.toContain("data-jump");
  });

  it("offers a way back to the default path only when the Learner left it", () => {
    expect(render()).not.toContain("Back to the default path");
    const chose = topics.map((t) => ({ ...t, current: t.id === "bonds" }));
    expect(render({ topics: chose })).toContain("Back to the default path");
  });

  it("renders the same markup every time from the same progress", () => {
    expect(render()).toBe(render());
  });
});

describe("the in-progress status wording", () => {
  it("reads as a phrase, not 'at the your turn step'", () => {
    const html = render({ topics: topics.map((t) => (t.status === "in_progress" ? { ...t, step: "your_turn" as const } : t)) });
    expect(html).toContain("Teaching Step: your turn");
    expect(html).not.toContain("at the");
  });
});

describe("Topics not written yet", () => {
  it("shows them as coming, not as stops the Learner can open", () => {
    const coming = [
      { id: "bond-pricing", title: "Bond basics and pricing", stage: "foundation" as const },
      { id: "fol-erp", title: "Follow: The Price of Risk", stage: "follow" as const },
    ];
    const html = render({ coming });
    expect(html).toContain("Coming");
    expect(html).not.toMatch(/data-jump="bond-pricing"/);
    expect([...html.matchAll(/data-coming="([^"]+)"/g)].map((m) => m[1])).toEqual(["bond-pricing", "fol-erp"]);
  });
});

describe("the Course Map shows progress", () => {
  it("has the title Course Map and a summary of where the Learner stands, with Next from What comes next", () => {
    const html = render();
    expect(html).toMatch(/<h1[^>]*>Course Map<\/h1>/);
    expect(html).toMatch(/data-progress-summary[^>]*>1 in progress · 1 passed · 4 to go · Next: Present value</);
  });

  it("leaves Next out of the summary when nothing comes next", () => {
    const html = render({ recommended: null });
    expect(html).toMatch(/data-progress-summary[^>]*>1 in progress · 1 passed · 4 to go</);
    expect(html).not.toContain("Next:");
  });

  it("shows Checks passed as 'n of m' with one bar segment per Check, passed ones filled", () => {
    const pv = row(render(), "pv");
    expect(pv).toContain("1 of 2");
    expect(pv.match(/data-segment="filled"/g)).toHaveLength(1);
    expect(pv.match(/data-segment="empty"/g)).toHaveLength(1);
    expect(pv).toContain("bg-[var(--accent-fill)]");
    expect(pv).toMatch(/data-here=""[^>]*class="[^"]*bg-\[var\(--accent-fill\)\] opacity-40/);
    const statements = row(render(), "statements");
    expect(statements).toContain("bg-[var(--dim)]");
    const three = topics.map((t) => (t.id === "pv" ? { ...t, checks: [...t.checks, { id: "pv-3", passed: true, here: false }] } : t));
    const html = row(render({ topics: three }), "pv");
    expect(html).toContain("2 of 3");
    expect(html.match(/data-segment="filled"/g)).toHaveLength(2);
  });

  it("shows each Topic's status as a static Tag, never a button", () => {
    const html = render();
    for (const [id, words] of [["compounding", "Passed"], ["pv", "In progress"], ["statements", "Not started"]] as const) {
      expect(row(html, id)).toContain(`<span data-affordance="tag"`);
      expect(row(html, id)).toMatch(new RegExp(`data-affordance="tag"[^>]*>${words}</span>`));
    }
  });

  it("shows 'n of m passed' on a group header", () => {
    const many = Array.from({ length: 6 }, (_, i) => topic({ id: `m${i}`, title: `Topic ${i}`, subject: "Bonds & credit", status: i < 4 ? "passed" : "not_started" }));
    expect(render({ topics: many, recommended: null })).toContain("4 of 6 passed");
  });

  it("lays each group's Topics out as a card grid", () => {
    expect(render()).toMatch(/<ol class="[^"]*card-grid/);
  });

  it("no longer exports the Progress view", async () => {
    const mod: Record<string, unknown> = await import("./course-map-view");
    expect(mod.ProgressView).toBeUndefined();
  });
});

// Spec 2026-11-12 C6 and F2: the Spine first, as one numbered list of fifteen rows with state, length and "You are here";
// then the Electives by Subject, closed by default, each saying which Spine Topic uses its idea; then Follow, Judge, Analyse.
describe("the Spine on the Course Map", () => {
  const spineTopic = (n: number, over: Partial<TopicOverview> = {}) =>
    topic({ id: `spine-${n}`, title: `Spine question ${n}`, stage: "spine", subject: null, spine: n, minutes: n === 1 ? 10 : 12, ...over });
  // Spine Topics 1 and 2 are written (1 passed, 2 where the Learner is); 3 to 15 are Coming.
  const written = [
    spineTopic(1, { status: "passed", checks: [{ id: "s1-1", passed: true, here: false }] }),
    spineTopic(2, { status: "in_progress", step: "story", current: true, onDefaultPath: true }),
    topic({ id: "pct", title: "Percent", usedInSpine: [7] }),
    topic({ id: "dcf", title: "DCF valuation", subject: "Valuation & corporate finance", usedInSpine: [1, 8, 9] }),
    topic({ id: "pv-spine", title: "Present value", usedInSpine: [2, 4] }),
    topic({ id: "tesla", title: "Follow: Tesla", stage: "follow", subject: null, usedInSpine: [1, 5, 14] }),
  ];
  const coming = [
    ...Array.from({ length: 13 }, (_, i) => ({ id: `spine-${i + 3}`, title: `Spine question ${i + 3}`, stage: "spine" as const, spine: i + 3, minutes: i + 3 === 15 ? 15 : 12 })),
    { id: "later", title: "A later Topic", stage: "judge" as const },
  ];
  const html = renderToStaticMarkup(<CourseMapView topics={written} coming={coming} recommended={{ topicId: "spine-2", label: "Resume: Spine question 2" }} />);
  const spine = html.split('data-stage="spine"')[1].split("</section>")[0];

  it("comes first, before the Electives, Follow, Judge and Analyse", () => {
    expect([...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1])).toEqual(["Spine", "Electives", "Follow"]);
  });

  it("lists all fifteen rows in order, written or coming, each numbered in the key-number blue", () => {
    expect([...spine.matchAll(/data-spine-number="(\d+)"/g)].map((m) => Number(m[1]))).toEqual(Array.from({ length: 15 }, (_, i) => i + 1));
    expect(spine.match(/<span aria-hidden="true" data-spine-number="\d+" class="[^"]*text-key-number[^"]*">\d{2}<\/span>/g)).toHaveLength(15);
    expect(spine).toContain(">01</span>");
    expect(spine).toContain(">15</span>");
  });

  it("gives each row its state and length, and marks where the Learner is", () => {
    const rowOf = (id: string) => spine.split(new RegExp(`data-(?:topic|coming)="${id}"`))[1].split(/data-(?:topic|coming)=/)[0];
    expect(rowOf("spine-1")).toMatch(/data-tone="success"[^>]*>Passed<\/span>/);
    expect(rowOf("spine-1")).toContain("10 min");
    expect(rowOf("spine-2")).toMatch(/In progress[\s\S]*12 min[\s\S]*You are here/);
    expect(rowOf("spine-2")).toContain('aria-current="location"');
    expect(rowOf("spine-15")).toMatch(/data-affordance="tag"[^>]*>Coming<\/span>[\s\S]*15 min/);
    expect(html.match(/You are here/g)).toHaveLength(1);
  });

  it("opens written Spine rows like any Topic, and gives a coming one nothing to press", () => {
    expect(spine.match(/data-row-link=/g)).toHaveLength(2);
    expect(spine.split('data-coming="spine-3"')[1].split("</li>")[0]).not.toMatch(/<a |<button/);
  });

  it("shows the Spine's progress in blue: one segment per Spine Topic, passed ones filled", () => {
    const bar = spine.split("data-spine-progress")[1].split("</div>")[0];
    expect(bar.match(/data-segment="filled"[^>]*class="[^"]*bg-\[var\(--accent-fill\)\]/g)).toHaveLength(1);
    expect(bar.match(/data-segment="empty"/g)).toHaveLength(14);
    expect(bar).toContain("1 of 15 passed");
  });

  it("keeps Coming Spine Topics out of the Coming list at the foot of the page", () => {
    expect([...html.matchAll(/data-coming="([^"]+)"/g)].map((m) => m[1]).filter((id) => !id.startsWith("spine-"))).toEqual(["later"]);
    expect(html).toContain("Coming (1 more Topics, in path order)");
  });

  it("closes every Elective group while the Learner is on the Spine", () => {
    const groups = [...html.matchAll(/<details[^>]*data-subject="[^"]*"[^>]*>/g)].map((m) => m[0]);
    expect(groups.length).toBe(2);
    for (const tag of groups) expect(tag).not.toMatch(/ open=""/);
  });

  it("says on each Elective and later row which Spine Topics use its idea", () => {
    expect(row(html, "pct")).toContain("Used in Spine Topic 7");
    expect(row(html, "pv-spine")).toContain("Used in Spine Topics 2 and 4");
    expect(row(html, "dcf")).toContain("Used in Spine Topics 1, 8 and 9");
    expect(row(html, "tesla")).toContain("Used in Spine Topics 1, 5 and 14");
  });

  it("names the recommended Spine Topic by its number and length", () => {
    expect(html.split("data-recommended-next")[1]).toContain("Spine Topic 2 · 12 minutes");
  });
});

// Spec 2026-11-12 C6 "Done when": every one of the 95 Topics written before the Spine still opens from the Course Map. On
// the real course, for a new Learner: each has its row link, and choosing it (what the link does) makes it current.
describe("every Topic written before the Spine, on the real Course Map", () => {
  const map = loadCourseMap();
  const fresh: Progress = { currentTopicId: null, topics: {} };
  const next = whatComesNext(map, fresh);
  const html = renderToStaticMarkup(
    <CourseMapView topics={courseOverview(map, fresh)} coming={map.coming} recommended={next ? { topicId: next.topic.id, label: next.label } : null} />,
  );
  const before = map.topics.filter((t) => t.stage !== "spine");

  it("is all 95 of them", () => {
    expect(before).toHaveLength(95);
  });

  it("has a row link for each, folded groups included", () => {
    const linked = new Set([...html.matchAll(/data-row-link="([^"]+)"/g)].map((m) => m[1]));
    expect(before.map((t) => t.id).filter((id) => !linked.has(id))).toEqual([]);
  });

  it("opens each one: choosing it makes it the Learner's current Topic", () => {
    const failed = before.flatMap((t) => {
      const jump = jumpTo(map, fresh, t.id);
      return jump.ok && navigate(map, jump.progress)?.topic.id === t.id ? [] : [t.id];
    });
    expect(failed).toEqual([]);
  });
});
