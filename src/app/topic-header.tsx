"use client";

import type { StepSequence } from "@/course/navigator";
import type { ReviewState } from "@/learner/review";
import { STEP_DIVIDER } from "@/tutor/session-item-kinds";
import { ReviewPanel } from "./review-panel";
import type { ThreadLine } from "./thread";
import { exploreItem, PinnedExplore } from "./widget-panel";
import { TopicBar, type Place } from "./workspace-parts";

/**
 * The Topic bar as the Study Workspace draws it (spec 2026-11-12 F3): the Band across the top of the workspace, above both
 * columns, for the shown Topic, or nothing before any Topic. It reads the conversation on screen for the steps whose
 * divider the thread holds, which the step bar scrolls back to.
 */
export function WorkspaceTopicBar({
  messages,
  strip = null,
  place,
}: {
  /** The conversation on screen: the strip marks the steps whose divider it holds. */
  messages: readonly ThreadLine[];
  /** The shown Topic's step sequence (Course Navigator), drawn as the Topic bar's strip. */
  strip?: StepSequence | null;
  place: Place;
}) {
  if (!place) return null;
  // The steps whose divider ("step" items) is in the thread: the strip scrolls back to those.
  const marked = new Set(messages.flatMap((m) => (m.role === "item" && m.kind === STEP_DIVIDER && typeof m.data.number === "number" ? [m.data.number] : [])));
  return <TopicBar topicId={place.topicId} title={place.title} goal={place.goal} strip={strip} marked={marked} />;
}

/**
 * What stands at the top of the Study Workspace's right column, above the Widget panel: the pinned explore Widget and the
 * folded review (the Topic bar moved above both columns, F3). It is capped at two fifths of the column and scrolls inside
 * itself, so nothing up here can squeeze the Widget panel, and it does not move while the Tutor streams in the chat
 * beside it. With nothing to show it takes no room: hidden while no row in it holds anything (G36: the rows' own wrappers
 * are always there, and a laptop draws the explore Widget in the panel, so `:empty` alone never matched).
 */
export function TopicHeader({ review, explore }: { review: ReviewState; explore: { code: string; id: string } | null }) {
  return (
    // Hairline rows, no gaps between them; 4 px of padding keeps room for focus rings inside this scroll box.
    // On a phone (#83) it is in the sheet: it shows only while the sheet holds the explore Widget or the Review, and then
    // fills the sheet with that one; both stay mounted, so the sliders and a picked answer survive the sheet going away.
    <div
      data-testid="above-widgets"
      className="relative flex max-h-[40%] shrink-0 flex-col overflow-y-auto p-1 [&:not(:has(>:not(:empty)))]:hidden max-md:hidden max-md:max-h-none max-md:min-h-0 max-md:flex-1 max-md:group-data-[view=explore]/sheet:flex max-md:group-data-[view=review]/sheet:flex"
    >
      {explore && (
        <div className="max-md:group-data-[view=review]/sheet:hidden">
          <PinnedExplore item={exploreItem(explore.code, undefined, explore.id)} />
        </div>
      )}
      <div className="max-md:group-data-[view=explore]/sheet:hidden">
        <ReviewPanel review={review} />
      </div>
    </div>
  );
}
