import { stringify } from "yaml";
import { parseCourseMap, loadCourseMap, type CourseMap } from "@/course/map";

/**
 * The real present value Topic alone, as a one-Topic course. Several tests were written when it was
 * the only Topic; the foundation Topics written since would otherwise come first on the default path.
 * Pass `withoutQuiz` to drop its quiz Check as well.
 */
export function presentValueOnly(options: { withoutQuiz?: boolean; real?: CourseMap } = {}): CourseMap {
  const real = options.real ?? loadCourseMap();
  const t = real.topic("present-value")!;
  const text = stringify({
    ...t,
    prerequisites: [],
    ...(options.withoutQuiz ? { checks: t.checks.filter((c) => c.kind !== "quiz"), questions: undefined } : {}),
  });
  const { map, errors } = parseCourseMap([{ name: "present-value.yaml", text }]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}
