import type { CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { ensureTopicStarted, loadProgress, saveCheckResult, saveFinishedStep } from "@/learner/memory";
import type { Db } from "@/db/types";

/** Puts a fresh Learner at the Teaching Step a test question needs, by saving progress directly. */
export async function placeLearner(db: Db, map: CourseMap, at: "story" | "your_turn" | "check") {
  await ensureTopicStarted(db, map);
  for (let i = 0; i < 12; i++) {
    const place = navigate(map, await loadProgress(db));
    if (!place) throw new Error("no place");
    const onConversationCheck = place.step === "check" && place.check?.kind === "conversation";
    if (place.step === at && (at !== "check" || onConversationCheck)) return place;
    if (place.step === "check" && place.check) await saveCheckResult(db, map, { checkId: place.check.id, passed: true });
    else await saveFinishedStep(db, map, place.step);
  }
  throw new Error(`could not place the Learner at ${at}`);
}
