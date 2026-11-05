import { CONVERTED_TOPIC_DATA, topicFileOf } from "@/course/lesson-fixture";
import { parseCourseMap, type CourseMap } from "@/course/map";

/** The id of the one wrong choice that carries no Known mistake. */
export const PLAIN_WRONG = "plain";

/**
 * The converted test Topic with a written choice try in front of Check 1's tries. Every number choice is a named mix-up
 * (its value is a Known mistake), so the only way to be wrong with no mix-up to name is a written choice whose wrong
 * option carries none: this one. Tests of "Not quite." and of the follow-up turn that names the slip tap `PLAIN_WRONG`.
 */
export function plainWrongMap(): CourseMap {
  const data = structuredClone(CONVERTED_TOPIC_DATA);
  (data.checks[0] as { quickTries: unknown[] }).quickTries.unshift({
    id: "pct-demo-try-pick",
    skill: "pts-to-bp",
    ask: "A rate goes from 2% to 3%. Which one says the move?",
    kind: "choice",
    answer: "points",
    choices: [
      { id: "points", text: "Up 1 point" },
      { id: PLAIN_WRONG, text: "Up 1" },
    ],
    halfDone: "First step, done for you: the move is 1 point.",
  });
  const { map, errors } = parseCourseMap([topicFileOf(data)]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}
