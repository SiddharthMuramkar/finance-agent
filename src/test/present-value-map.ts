import { stringify } from "yaml";
import { parseCourseMap, loadCourseMap, readOutlineText, type CourseMap } from "@/course/map";
import { parseOutline } from "@/course/outline";

/**
 * The real present value Topic alone, as a one-Topic course. Several tests were written when it was
 * the only Topic; the foundation Topics written since would otherwise come first on the default path.
 * Pass `withoutQuiz` to drop its quiz Check as well.
 * Its Connections link to other Topics, which a one-Topic course does not have, so they are dropped
 * unless `withConnections` is set; then the real outline supplies the linked Topics' titles.
 */
export function presentValueOnly(options: { withoutQuiz?: boolean; real?: CourseMap; withConnections?: boolean } = {}): CourseMap {
  const real = options.real ?? loadCourseMap();
  const t = real.topic("present-value")!;
  // Stage, place, prerequisites and Subject belong to the outline, not the Topic file.
  const body = {
    ...t,
    stage: undefined,
    path: undefined,
    prerequisites: undefined,
    subject: undefined,
    ...(options.withoutQuiz ? { checks: t.checks.filter((c) => c.kind !== "quiz"), questions: undefined } : {}),
  };
  if (options.withConnections) {
    const planned = parseOutline(readOutlineText());
    if (!planned.outline) throw new Error(planned.errors.join("\n"));
    const { map, errors } = parseCourseMap([{ name: "present-value.yaml", text: stringify(body) }], planned.outline);
    if (!map) throw new Error(errors.join("\n"));
    return map;
  }
  const text = stringify({ ...body, connections: undefined, stage: t.stage, path: t.path, prerequisites: [] });
  const { map, errors } = parseCourseMap([{ name: "present-value.yaml", text }]);
  if (!map) throw new Error(errors.join("\n"));
  return map;
}
