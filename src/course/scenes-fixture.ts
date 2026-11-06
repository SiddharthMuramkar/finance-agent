import { parseCourseMap, type Topic } from "./map";

/**
 * The fixture Topic for the scene tooling (E3): a small three-Check Topic about the February 1994 rate move,
 * with one of each story recipe, complete terms and a Running-example scene. It is never on the Course Map:
 * scenes.test.ts, /dev/scenes and e2e/dev-scenes.spec.ts draw it, and the real Topics follow in E6a to E6c.
 */

export const SCENE_FIXTURE_TOPIC_ID = "scene-fixture";

const FIXTURE_YAML = `
id: scene-fixture
title: The day rates moved
stage: foundation
path: 1
cases:
  - id: fed-1994
    title: The Fed meets, February 1994
    asOf: 1994-02-03
    story: >
      In early February 1994 bond traders expected the US central bank to leave its rate where it was.
      The bank's committee was about to meet, and nobody in the story yet knows what it will do.
    reveal: The bank raised its rate the next day, and bond prices fell as traders rethought old bonds.
concept: When a central bank moves its rate, older bonds are judged against the new ones.
principle: A rate move reprices everything that was lent at the old rate.
terms:
  - term: yield
    means: The income you get for lending your money, compared with what you paid.
    pro: A bond's yield is the income it pays each year.
    example: Rent on a flat, compared with the price of the flat.
    emoji: house
    inStory: In the story, bond prices fell, so the yield rose.
  - term: basis point
    means: One hundredth of a point, the small step traders count rate moves in.
    pro: The rate rose by twenty-five basis points at the meeting.
    example: One paisa next to a rupee is one hundredth too.
    emoji: coin
    inStory: Traders in the story counted the move in basis points.
runningExample:
  text: A savings rate goes from a small rate to a bigger one.
  numbers: [4, 5]
  scene:
    cast:
      - { id: asha, emoji: woman, name: Asha }
      - { id: bank, emoji: bank, name: The bank }
    beats:
      - { who: narrator, says: Asha keeps her savings at the bank. }
      - { who: bank, says: We now pay a little more each year. }
      - { who: asha, says: My jar will fill a little faster now. }
scenes:
  - id: opening-story
    step: story
    recipe: story_scene
    title: The day the bond market panicked
    inputs:
      cast:
        - { id: fed, emoji: bank, name: The central bank, role: sets the rate }
        - { id: saver, emoji: woman, name: Asha, role: owns bonds }
      beats:
        - { who: narrator, says: "It is February, and everyone expects calm.", emoji: calendar }
        - { who: fed, says: "We are raising the rate, a little." }
        - { who: saver, says: "My old bonds just got less attractive!", emoji: worried-face }
      caption: A small rate move, a big surprise
      date: "1994-02-03"
  - id: yield-word
    step: concept
    check: fixture-check-1
    recipe: lingo_card
    inputs:
      term: Yield
      pro: A bond's yield is the income it pays each year.
      means: The income you get for lending your money, compared with what you paid.
      example: Rent on a flat, compared with the price of the flat.
      emoji: house
      inStory: In the story, bond prices fell, so the yield rose.
  - id: two-choices
    step: concept
    check: fixture-check-2
    recipe: two_paths
    inputs:
      question: What happens to two people who chose differently?
      left:
        emoji: woman
        name: Asha
        choice: Kept her bonds
        outcome: [chart-decreasing, worried-face]
        outcomeLine: Her bonds lost value for a while.
      right:
        emoji: man
        name: Ravi
        choice: Waited with cash
        outcome: [money-bag, slightly-smiling-face]
        outcomeLine: He bought later at better prices.
  - id: who-pays
    step: concept
    check: fixture-check-3
    recipe: who_pays_whom
    inputs:
      actors:
        - { id: bank, emoji: bank, name: The bank }
        - { id: saver, emoji: woman, name: The saver }
      flows:
        - { from: saver, to: bank, what: a deposit, emoji: coin }
        - { from: bank, to: saver, what: interest, emoji: money-bag }
  - id: savings-jar
    step: explore
    recipe: money_jar
    inputs:
      label: Asha's savings
      start: 3
      end: 6
      unit: coin
      each: each coin is ₹1 lakh
      words: about twice as full
  - id: pick-why
    step: your_turn
    recipe: choice_cards
    inputs:
      question: Why did older bonds lose value when the bank raised rates?
      choices:
        - { id: a, text: New bonds paid more, emoji: chart-increasing }
        - { id: b, text: Nobody wanted any bond, emoji: worried-face, fix: People still bought bonds. They wanted the better ones. }
        - { id: c, text: The bank printed the old ones, emoji: bank, fix: Old bonds did not change. The new ones did. }
      answer: a
  - id: myth-cards
    step: check
    recipe: myth_or_fact
    inputs:
      cards:
        - claim: When interest rates rise, older bonds lose value.
          isFact: true
          why: New bonds pay more, so old ones look less attractive.
          emoji: chart-decreasing
        - claim: Prices of safe bonds never move.
          isFact: false
          why: Even safe bonds change price when rates move.
          emoji: locked
  - id: fed-front-page
    step: reveal
    recipe: headline
    title: The day the bond market fell
    inputs:
      paper: The Daily Ledger
      date: "1994-02-04"
      headline: Central bank lifts rates for the first time in five years
      deck: Bond traders were caught off guard by the move.
      source: https://www.federalreserve.gov/monetarypolicy/fomchronology.htm
  - id: the-year-unfolds
    step: principle
    recipe: timeline
    title: How the story unfolded
    inputs:
      beats:
        - { date: "1993-12-01", label: Calm markets, emoji: sun }
        - { date: "1994-02-03", label: The story opens, emoji: calendar }
        - { date: "1994-05-09", label: Prices keep falling, emoji: chart-decreasing }
checks:
  - id: fixture-check-1
    kind: conversation
    prompt: Say what a yield is, in your own words.
    passCriteria: Links the income to the price paid.
  - id: fixture-check-2
    kind: conversation
    prompt: Why did the old bonds lose value?
    passCriteria: New bonds paid more, so old ones looked worse.
  - id: fixture-check-3
    kind: conversation
    prompt: Who pays whom on a savings account?
    passCriteria: The saver deposits and the bank pays interest.
`;

let cached: Topic | undefined;

/** The fixture Topic, parsed through the real Course Map validator so it can never drift from the file shape. */
export function sceneFixtureTopic(): Topic {
  if (cached) return cached;
  const { map, errors } = parseCourseMap([{ name: "scene-fixture.yaml", text: FIXTURE_YAML }]);
  if (!map) throw new Error(`The scene fixture Topic is invalid:\n${errors.join("\n")}`);
  cached = map.topic(SCENE_FIXTURE_TOPIC_ID)!;
  return cached;
}
