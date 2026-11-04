import type { CourseMap } from "@/course/map";
import { navigate } from "@/course/navigator";
import { insightAttempts } from "@/db/schema";
import { ensureTopicStarted, loadProgress, saveCheckResult, saveFinishedStep } from "@/learner/memory";
import type { Db } from "@/db/types";

/**
 * Puts a fresh Learner at the Teaching Step a test question needs, by saving progress directly. The comparison
 * and behaviour runs pass the tools Learner (`freshToolsLearner`), so they never place anyone else.
 */
export async function placeLearner(db: Db, map: CourseMap, at: "story" | "explore" | "your_turn" | "check", learnerId: number) {
  await ensureTopicStarted(db, map, new Date(), learnerId);
  for (let i = 0; i < 20; i++) {
    const place = navigate(map, await loadProgress(db, learnerId));
    if (!place) throw new Error("no place");
    const onConversationCheck = place.step === "check" && place.check?.kind === "conversation";
    if (place.step === at && (at !== "check" || onConversationCheck)) return place;
    if (place.step === "check" && place.check) await saveCheckResult(db, map, { checkId: place.check.id, passed: true }, new Date(), learnerId);
    else {
      // Explore only finishes once the Insight is settled, so walking past it records it as told.
      if (place.step === "explore") {
        await db.insert(insightAttempts).values({ learnerId, topicId: place.topic.id, reported: "asked_to_be_told", released: "told", words: "", toolCallId: `placement-${place.topic.id}-${learnerId}` });
      }
      await saveFinishedStep(db, map, place.step, new Date(), learnerId);
    }
  }
  throw new Error(`could not place the Learner at ${at}`);
}
