"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { WidgetSlot } from "./reply-markdown";
import { DeveloperDetails, readOnlyLines, ReadOnlyThread, widgetsIn, withNextStepDividers, type Line } from "./thread";
import type { WrittenAhead } from "@/course/written-ahead";
import { CaseDataProvider } from "@/widgets/case-data-provider";
import { SPLIT_DEFAULT, splitStyle } from "./split";
import { SplitHandle } from "./split-handle";
import { secondaryButtonClass } from "./ui";
import { exploreItem, holdsKey, PinnedExplore, updatedInPlace, useWidgetPicker, WidgetChip, WidgetPanel, withExplore } from "./widget-panel";

export type OldLine = Line;

/**
 * An old Session, read-only, in the workspace's two columns (at the same split as the workspace): the conversation with "Open: <title> →" chips on the left,
 * the Widget panel on the right (controls at their starting values). A Session that reached the explore step shows the Topic's Explore Widget too. Where the composer would be there is a link
 * back to the workspace. No composer and no model call.
 */
const NO_WRITTEN_AHEAD: readonly WrittenAhead[] = [];

export function OldSession({
  lines: stored,
  topicTitle,
  explore = null,
  writtenAhead = NO_WRITTEN_AHEAD,
  revealed = [],
  referenceClip,
  developerDetails = false,
  inPlace = false,
  split = SPLIT_DEFAULT,
}: {
  lines: OldLine[];
  topicTitle?: string;
  explore?: { code: string; id: string } | null;
  /** The Topic's written-ahead Widgets (loadWrittenAhead): one the Tutor opened in this Session is drawn from these. */
  writtenAhead?: readonly WrittenAhead[];
  /** The Cases whose reveal the Learner has seen, for the page's shared Case Data cache. */
  revealed?: readonly string[];
  /** The date the reference Case is clipped to (referenceClip in case-data.ts): a later close is never drawn. */
  referenceClip?: string | null;
  /** The Learner's Show developer details choice (Settings): "Under the hood" under each Tutor reply only when on. */
  developerDetails?: boolean;
  /**
   * A Topic Session: its Widgets are updated in place as in the Study Workspace (updatedInPlace), so a Widget the Tutor
   * drew again under the same title, or the explore Widget it reopened, keeps one tab. Older sessions draw as before.
   */
  inPlace?: boolean;
  /** The conversation's share of the two columns' width (readSplit, the `split` cookie), as in the Study Workspace. */
  split?: number;
}) {
  const lines = useMemo(() => withNextStepDividers(stored), [stored]);
  const tutorWidgets = useMemo(() => widgetsIn(readOnlyLines(lines), false, writtenAhead), [lines, writtenAhead]);
  const sessionId = lines.flatMap((l) => (l.role !== "item" && l.ref ? [l.ref.sessionId] : []))[0];
  const drawn = useMemo(() => withExplore(tutorWidgets, explore, tutorWidgets.length, sessionId), [tutorWidgets, explore, sessionId]);
  const widgets = useMemo(() => (inPlace ? updatedInPlace(drawn) : drawn), [drawn, inPlace]);
  // The newest drawing shows, as in the Study Workspace, even when it updated an earlier tab in place.
  const picker = useWidgetPicker(widgets, { newest: drawn.at(-1)?.key });
  const slot: WidgetSlot = ({ messageId, index }) => {
    const item = widgets.find((w) => holdsKey(w, `${messageId}:${index}`));
    return item ? <WidgetChip item={item} active={item.key === picker.view} onPick={picker.pick} /> : null;
  };
  return (
    <CaseDataProvider revealed={revealed} referenceClip={referenceClip}>
      {/* The workspace's split (spec 2026-11-11, C2a): the conversation, the Split handle's place, the Widget panel. */}
      <div className="workspace-split min-h-0 flex-1 items-start" data-testid="old-session" data-split-frame style={splitStyle(split)}>
        <div id="conversation-column" className="@container/chat flex min-h-0 min-w-0 flex-col gap-4">
          {explore && <PinnedExplore item={exploreItem(explore.code, sessionId, explore.id)} />}
          <div className="relative min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable_both-edges]">
            <DeveloperDetails on={developerDetails}>
              <div data-testid="reading-block" className="reading-block">
                <ReadOnlyThread lines={lines} slot={slot} />
              </div>
            </DeveloperDetails>
          </div>
          {/* Secondary: the page's one primary is the header's Resume this Topic (ADR 0018). */}
          <div data-testid="composer-block" className="reading-block">
            <Link href="/study" data-affordance="button" className={`${secondaryButtonClass} self-start`}>
              Back to the workspace
            </Link>
          </div>
        </div>
        <SplitHandle initial={split ?? SPLIT_DEFAULT} />
        {/* px-1 pt-1: room for a control's 2px focus ring inside the scroller (WP6's workspace aside does the same). */}
        <aside id="widget-column" aria-label="Widget panel" data-testid="widget-pane" className="quiet-scroll sticky top-6 max-h-[min(100%,calc(100dvh-48px))] min-w-0 overflow-y-auto overflow-x-clip overscroll-contain px-1 pt-1 [scrollbar-gutter:stable]">
          <WidgetPanel widgets={widgets} view={picker.view} newestKey={picker.newestKey} picks={picker.picks} onPick={picker.pick} topicTitle={topicTitle} />
        </aside>
      </div>
    </CaseDataProvider>
  );
}
