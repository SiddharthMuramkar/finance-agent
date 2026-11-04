"use client";

import type { StepSequence } from "@/course/navigator";
import type { ReviewState } from "@/learner/review";
import { STEP_DIVIDER } from "@/tutor/session-item-kinds";
import { ReviewPanel } from "./review-panel";
import type { TurnStream } from "./turn-stream";
import { exploreItem, PinnedExplore } from "./widget-panel";
import { TopicBar, type Place } from "./workspace-parts";

/**
 * What stands at the top of the Study Workspace's right column, above the Widget panel: the Topic bar, the pinned
 * explore Widget and the folded review. It is capped at two fifths of the column and scrolls inside itself, so nothing
 * up here can squeeze the Widget panel, and it does not move while the Tutor streams in the chat beside it.
 */
export function TopicHeader({
  turn,
  strip = null,
  place,
  review,
  explore,
}: {
  turn: TurnStream;
  /** The shown Topic's step sequence (Course Navigator), drawn as the Topic bar's strip. */
  strip?: StepSequence | null;
  place: Place;
  review: ReviewState;
  explore: { code: string; id: string } | null;
}) {
  // The steps whose divider ("step" items) is in the thread: the strip scrolls back to those.
  const marked = new Set(turn.messages.flatMap((m) => (m.role === "item" && m.kind === STEP_DIVIDER && typeof m.data.number === "number" ? [m.data.number] : [])));
  return (
    <div data-testid="above-widgets" className="relative flex max-h-[40%] shrink-0 flex-col gap-3 overflow-y-auto">
      {place && <TopicBar title={place.title} goal={place.goal} strip={strip} marked={marked} />}
      {explore && <PinnedExplore item={exploreItem(explore.code, undefined, explore.id)} />}
      <ReviewPanel review={review} />
    </div>
  );
}
