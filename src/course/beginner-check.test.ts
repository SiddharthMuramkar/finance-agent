import { describe, expect, it } from "vitest";
import { BEGINNER_LISTS, BEGINNER_STARTED_WITH, beginnerCheckErrors, type BeginnerLists } from "./beginner-check";
import { loadCourseMap, type Topic } from "./map";
import { spineData, spineTopic } from "./spine-fixture";

// The beginner rules in the course check (spec #68): a Spine Topic brings at most four new words, no Spine Check asks for
// the Learner's own story, no "your story" wording, and every Spine Topic has a daily-life line. Each rule starts with a
// list of the Topics that fail it today, and the list can only shrink.

const ID = "spine-01-worth";
const none: BeginnerLists = { newWords: [], ownStory: [], yourStory: [], dailyLife: [] };
const all: BeginnerLists = { newWords: [ID], ownStory: [ID], yourStory: [ID], dailyLife: [ID] };

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

const check = (topic: Topic, lists: BeginnerLists) => beginnerCheckErrors([topic], { lists, startedWith: all });

describe("the beginner rules in the course check (spec #68)", () => {
  it("passes the real Course Map with each rule's list of known failures", () => {
    expect(beginnerCheckErrors(loadCourseMap().topics)).toEqual([]);
  });

  it("passes a Topic that breaks every rule while it is on every list", () => {
    expect(check(breaksAll(), all)).toEqual([]);
  });

  it("passes a Topic that follows every rule and is on no list", () => {
    expect(check(followsAll(), none)).toEqual([]);
  });

  it("fails a Topic taken off the new-words list until it brings at most four new words", () => {
    expect(check(breaksAll(), { ...all, newWords: [] })).toEqual([
      'Spine Topic "spine-01-worth" brings 5 new words (price, value, revenue, operating margin, cost of capital); a Spine Topic brings at most 4: move the rest to Go deeper or an Elective (spec #68)',
    ]);
  });

  it("fails a Topic taken off the own-story list until no Check asks for the Learner's own story", () => {
    expect(check(breaksAll(), { ...all, ownStory: [] })).toEqual([
      'Spine Topic "spine-01-worth" has a Check "worth-talk" that asks for the Learner\'s own story ("Tell Amazon\'s story"); a Spine Check judges a Story instead (spec #68)',
    ]);
  });

  it('fails a Topic taken off the "your story" list until it no longer says "your story"', () => {
    expect(check(breaksAll(), { ...all, yourStory: [] })).toEqual([
      'Spine Topic "spine-01-worth" says "your story" at explore.workbench.title; name whose Story it is instead (spec #68)',
    ]);
  });

  it("fails a Topic taken off the daily-life list until it has a daily-life line", () => {
    expect(check(breaksAll(), { ...all, dailyLife: [] })).toEqual([
      'Spine Topic "spine-01-worth" has no daily-life line; give it a dailyLife line from a beginner\'s day (spec #68)',
    ]);
  });

  it("fails a listed Topic that follows the rule, so the list only shrinks", () => {
    expect(check(followsAll(), all)).toEqual([
      'List: Topic "spine-01-worth" follows the new-words rule: remove it from NEW_WORDS_NOT_YET in src/course/beginner-check.ts',
      'List: Topic "spine-01-worth" follows the own-story rule: remove it from OWN_STORY_NOT_YET in src/course/beginner-check.ts',
      'List: Topic "spine-01-worth" follows the "your story" rule: remove it from YOUR_STORY_NOT_YET in src/course/beginner-check.ts',
      'List: Topic "spine-01-worth" follows the daily-life rule: remove it from DAILY_LIFE_NOT_YET in src/course/beginner-check.ts',
    ]);
  });

  it("fails a Topic added to a list it did not start on, even one that breaks the rule", () => {
    const errors = beginnerCheckErrors([breaksAll()], { lists: all, startedWith: { ...all, newWords: [] } });
    expect(errors).toEqual([
      'List: Topic "spine-01-worth" was added to NEW_WORDS_NOT_YET, which only shrinks: make the Topic follow the rule instead (src/course/beginner-check.ts)',
    ]);
  });

  it("fails a Spine Topic added to a real list, since the lists it started with are frozen, not copied from the live ones", () => {
    const map = loadCourseMap();
    const added = "spine-02-money-later";
    expect(BEGINNER_STARTED_WITH.yourStory).not.toContain(added);
    const errors = beginnerCheckErrors(map.topics, { lists: { ...BEGINNER_LISTS, yourStory: [...BEGINNER_LISTS.yourStory, added].sort() } });
    expect(errors).toContain(
      `List: Topic "${added}" was added to YOUR_STORY_NOT_YET, which only shrinks: make the Topic follow the rule instead (src/course/beginner-check.ts)`,
    );
  });

  it("keeps the lists #87 started with as literals, not copies of the live lists", () => {
    // Topic 1 came off the new-words list (#88), so a copy of the live list would no longer hold it.
    expect(BEGINNER_LISTS.newWords).not.toContain("spine-01-worth");
    expect(BEGINNER_STARTED_WITH.newWords).toContain("spine-01-worth");
  });

  it("keeps every live list inside the list it started with", () => {
    for (const rule of Object.keys(BEGINNER_LISTS) as (keyof BeginnerLists)[]) {
      for (const id of BEGINNER_LISTS[rule]) expect(BEGINNER_STARTED_WITH[rule]).toContain(id);
    }
  });

  it("fails an id on a list that is not a Spine Topic", () => {
    const errors = check(breaksAll(), { ...all, dailyLife: [ID, "spine-99-gone"] });
    expect(errors).toEqual(['List: "spine-99-gone" is on DAILY_LIFE_NOT_YET but is not a Spine Topic: remove it from src/course/beginner-check.ts']);
  });

  it("keeps each list sorted with one id each, so tickets that delete ids merge cleanly", () => {
    for (const ids of [...Object.values(BEGINNER_LISTS), ...Object.values(BEGINNER_STARTED_WITH)]) {
      expect(ids).toEqual([...new Set(ids)].sort());
    }
  });

  it("reads Spine Topics only", () => {
    expect(beginnerCheckErrors([{ ...breaksAll(), stage: "foundation" } as Topic], { lists: none, startedWith: none })).toEqual([]);
  });
});
