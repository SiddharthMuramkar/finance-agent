import { loadCourseMap, type CourseMap } from "@/course/map";
import { whatComesNext, type Progress } from "@/course/navigator";
import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";

// The member's Continue button (Signal spec §4.2, §7.1): what its sub-line says and which Topic it opens. Moved from
// the old Home (src/app/_landing/landing.tsx, decision #7) with its rule unchanged.

/**
 * The signed-in Learner's main button: what it says and, for Resume, Start and What comes next, which Topic it
 * opens (through /api/open, the Learner's current Topic); every one lands on /study.
 */
export type HomeButton = { kind: "resume" | "start"; topic: string } | { kind: "next"; label: string } | { kind: "open" };

/**
 * The button rule: What comes next, from the Course Navigator. The chosen Topic not yet passed is Resume (Start
 * if not begun); else a Due Check ("New in <Topic>: Check N →" or "New in <Topic>: Explore →"); else the next
 * Topic on the default path ("Next Topic: <title> →"), which is Start for a Learner who has begun nothing. With
 * every Topic passed and nothing due it opens the workspace. A passed Topic is never Resume.
 */
export function homeButton(map: CourseMap, progress: Progress): HomeButton {
  const next = whatComesNext(map, progress);
  if (!next) return { kind: "open" };
  const begun = progress.topics[next.topic.id] !== undefined;
  if (next.kind === "chosen") return { kind: begun ? "resume" : "start", topic: next.topic.title };
  if (next.kind === "next_topic" && Object.keys(progress.topics).length === 0) return { kind: "start", topic: next.topic.title };
  return { kind: "next", label: `${next.label} →` };
}

/**
 * The signed-in Learner's button, from saved progress (`learnerId`, or the request's Learner). Read-only; if progress
 * can't be loaded it logs and falls back to Open.
 */
export async function loadHomeButton(learnerId?: number): Promise<HomeButton> {
  try {
    return homeButton(loadCourseMap(), await loadProgress(getDb(), learnerId ?? (await currentLearnerId())));
  } catch (error) {
    console.error("The site could not load the Learner's place", error);
    return { kind: "open" };
  }
}

/** The Continue button's sub-line: the Topic it opens, What comes next, or the Study Workspace. */
export function continueLine(button: HomeButton, fallback: string): string {
  if (button.kind === "resume" || button.kind === "start") return button.topic;
  if (button.kind === "next") return button.label;
  return fallback;
}
