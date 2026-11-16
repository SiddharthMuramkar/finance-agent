import { describe, expect, it } from "vitest";
import { beginnerCheckErrors } from "./beginner-check";
import { loadCourseMap, type Topic } from "./map";
import { spineData, spineTopic } from "./spine-fixture";

// The beginner rules in the course check (spec #68): a Spine Topic brings at most four new words, no Spine Check asks for
// the Learner's own story, no "your story" wording, and every Spine Topic has a daily-life line. Every Spine Topic
// follows every rule; there are no lists of known failures. A converted Elective (one with Skills) needs its daily-life line too.

/** The fixture with "your story" in its Workbench title: it then breaks all four rules. */
const breaksAll = (): Topic =>
  spineTopic(spineData((d) => void ((d.explore.workbench as { title?: string }).title = "Amazon, February 2000: your story")));

/** The fixture changed to follow all four rules. */
const followsAll = (): Topic =>
  spineTopic(
    spineData((d) => {
      d.terms = d.terms.slice(0, 4);
      const talk = d.checks.find((c) => c.kind === "conversation") as { prompt: string };
      talk.prompt = "The professor's story came to $35 against the $84 price. Which lever of his story would you argue about first, and why?";
      (d as { dailyLife?: string }).dailyLife = "A house is worth what its rent will bring in, not what the last buyer paid.";
    }),
  );

describe("the beginner rules in the course check (spec #68)", () => {
  it("passes the whole Spine of the real Course Map", () => {
    expect(beginnerCheckErrors(loadCourseMap().topics)).toEqual([]);
  });

  it("passes a Topic that follows every rule", () => {
    expect(beginnerCheckErrors([followsAll()])).toEqual([]);
  });

  it("reports every rule a Spine Topic breaks", () => {
    expect(beginnerCheckErrors([breaksAll()])).toEqual([
      'Spine Topic "spine-01-worth" brings 5 new words (price, value, revenue, operating margin, cost of capital); a Spine Topic brings at most 4: move the rest to Go deeper or an Elective (spec #68)',
      'Spine Topic "spine-01-worth" has a Check "worth-talk" that asks for the Learner\'s own story ("Tell Amazon\'s story"); a Spine Check judges a Story instead (spec #68)',
      'Spine Topic "spine-01-worth" says "your story" at explore.workbench.title; name whose Story it is instead (spec #68)',
      'Spine Topic "spine-01-worth" has no daily-life line; give it a dailyLife line from a beginner\'s day (spec #68)',
    ]);
  });

  it("takes no lists of known failures", () => {
    expect(beginnerCheckErrors.length).toBe(1);
  });

  it("reads Spine Topics only, apart from the daily-life line on a converted Elective", () => {
    expect(beginnerCheckErrors([{ ...breaksAll(), stage: "foundation", skills: [] } as Topic])).toEqual([]);
    expect(beginnerCheckErrors([{ ...breaksAll(), stage: "foundation", dailyLife: "A sale sign says 20% off." } as Topic])).toEqual([]);
  });

  it("fails a converted Elective (one with Skills) that has no daily-life line (spec story 57, review 2 G32)", () => {
    expect(beginnerCheckErrors([{ ...breaksAll(), id: "num-percent-bps", stage: "foundation" } as Topic])).toEqual([
      'Elective "num-percent-bps" has Skills (a converted Topic) but no daily-life line; give it a dailyLife line from a beginner\'s day (spec #68 story 57)',
    ]);
  });

  it("gives every converted Elective on the real Course Map a daily-life line", () => {
    const electives = loadCourseMap().topics.filter((t) => t.stage !== "spine" && t.skills.length > 0);
    expect(electives.map((t) => t.id).sort()).toEqual(["num-compounding", "num-percent-bps"]);
    for (const t of electives) expect(t.dailyLife, t.id).toBeTruthy();
  });
});
