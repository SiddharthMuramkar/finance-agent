import type { CourseMap } from "@/course/map";

/**
 * The Topic section 2's "Open this Topic →" opens, signed in (spec 2026-11-12 E4): Spine Topic 1 (course/outline.yaml).
 * It lives in a plain module, not in the client component, because a "use client" file's exports reach a Server
 * Component as client references, not as values, and Home's server page needs the id itself.
 */
export const HOME_TOPIC_ID = "spine-01-worth";

/**
 * Whether section 2 can open its Topic: Spine Topic 1 has a Topic file. An outline Topic with no file is only `coming`,
 * and /api/open cannot open it (it would land on /study at whatever Topic is current, with no word why).
 */
export function homeTopicWritten(map: Pick<CourseMap, "topic">): boolean {
  return !!map.topic(HOME_TOPIC_ID);
}
