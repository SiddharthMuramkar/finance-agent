"use client";

import Link from "next/link";
import { useMemo } from "react";
import type { WidgetSlot } from "./reply-markdown";
import { DeveloperDetails, readOnlyLines, ReadOnlyThread, widgetsIn, withNextStepDividers, type Line } from "./thread";
import type { WrittenAhead } from "@/course/written-ahead";
import { CaseDataProvider } from "@/widgets/case-data-provider";
import { primaryButtonClass } from "./ui";
import { exploreItem, holdsKey, PinnedExplore, updatedInPlace, useWidgetPicker, WidgetChip, WidgetPanel, withExplore } from "./widget-panel";

export type OldLine = Line;

/**
 * An old Session, read-only, in the workspace's two columns: the conversation with "Open: <title> →" chips on the left,
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
  developerDetails = false,
  inPlace = false,
}: {
  lines: OldLine[];
  topicTitle?: string;
  explore?: { code: string; id: string } | null;
  /** The Topic's written-ahead Widgets (loadWrittenAhead): one the Tutor opened in this Session is drawn from these. */
  writtenAhead?: readonly WrittenAhead[];
  /** The Cases whose reveal the Learner has seen, for the page's shared Case Data cache. */
  revealed?: readonly string[];
  /** The Learner's Show developer details choice (Settings): "Under the hood" under each Tutor reply only when on. */
  developerDetails?: boolean;
  /**
   * A Topic Session: its Widgets are updated in place as in the Study Workspace (updatedInPlace), so a Widget the Tutor
   * drew again under the same title, or the explore Widget it reopened, keeps one tab. Older sessions draw as before.
   */
  inPlace?: boolean;
}) {
  const lines = useMemo(() => withNextStepDividers(stored), [stored]);
  const tutorWidgets = useMemo(() => widgetsIn(readOnlyLines(lines), false, writtenAhead), [lines, writtenAhead]);
  const sessionId = lines.flatMap((l) => (l.role !== "item" && l.ref ? [l.ref.sessionId] : []))[0];
  const drawn = useMemo(() => withExplore(tutorWidgets, explore, tutorWidgets.length, sessionId), [tutorWidgets, explore, sessionId]);
  const widgets = useMemo(() => (inPlace ? updatedInPlace(drawn) : drawn), [drawn, inPlace]);
  const picker = useWidgetPicker(widgets);
  const slot: WidgetSlot = ({ messageId, index }) => {
    const item = widgets.find((w) => holdsKey(w, `${messageId}:${index}`));
    return item ? <WidgetChip item={item} active={item.key === picker.shown?.key} onPick={picker.pick} /> : null;
  };
  return (
    <CaseDataProvider revealed={revealed}>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)] items-start gap-6 lg:gap-8" data-testid="old-session">
        <div className="flex min-h-0 min-w-0 flex-col gap-4">
          {explore && <PinnedExplore item={exploreItem(explore.code, sessionId, explore.id)} />}
          <div className="relative min-h-0 flex-1 overflow-y-auto">
            <DeveloperDetails on={developerDetails}>
              <ReadOnlyThread lines={lines} slot={slot} />
            </DeveloperDetails>
          </div>
          <Link href="/study" className={`${primaryButtonClass} self-start`}>
            Back to the workspace
          </Link>
        </div>
        <aside aria-label="Widget panel" data-testid="widget-pane" className="sticky top-6 max-h-[min(100%,calc(100dvh-48px))] min-w-0 overflow-y-auto">
          <WidgetPanel widgets={widgets} shown={picker.shown} flashing={picker.flashing} onPick={picker.pick} topicTitle={topicTitle} />
        </aside>
      </div>
    </CaseDataProvider>
  );
}
