"use client";

import { useMemo, useState } from "react";
import type { WrittenAhead } from "@/course/written-ahead";
import type { MissedQuiz, OpenQuiz } from "@/learner/quiz";
import { shownWidgetOf, WIDGET_SHOWN } from "@/widgets/shown-widget";
import { checkTabName, QuizPanel, type QuizSubmitted } from "./quiz-panel";
import type { WidgetSlot } from "./reply-markdown";
import { widgetsIn, type ThreadLine } from "./thread";
import { holdsKey, updatedInPlace, useExploreAnchor, useWidgetPicker, WidgetChip, WidgetPanel, WidgetRetryContext, withExplore, type WidgetItem } from "./widget-panel";

const NONE: readonly WrittenAhead[] = [];

/**
 * Tags each Widget a Tutor tool drew (a WIDGET_SHOWN item) with its `source` ("recipe", "compose" or "fallback"), so the
 * Widget timing events carry the real lane instead of "fence". Widgets written in a reply keep no source.
 */
export function withSources(widgets: WidgetItem[], messages: ThreadLine[]): WidgetItem[] {
  const sources = new Map<string, string>();
  for (const m of messages) {
    if (m.role === "item" && m.kind === WIDGET_SHOWN) {
      const shown = shownWidgetOf(m.data);
      if (shown) sources.set(`${m.id}:0`, shown.source);
    }
  }
  if (!sources.size) return widgets;
  return widgets.map((w) => (!w.source && sources.has(w.key) ? { ...w, source: sources.get(w.key) } : w));
}

/**
 * The host for the Study Workspace's Widget panel: which Widgets the conversation holds (the Tutor's, plus the
 * Topic's explore Widget), the open quiz's Check tab, which of them the panel shows, and the chip that stands
 * where each Widget belongs in a reply. The left column draws the chips through `slot`; the frame puts
 * `WidgetHost` in the right column.
 *
 * An open quiz is shown on its own tab ("Check 1 of 2"), selected unless the Learner picks a Widget's tab. The
 * tab is kept after the server stops sending the quiz (a pass) until the Learner dismisses the marking. After a miss
 * (`missed`) it shows the last attempt's marking with Try Check <k> again until the Learner presses it.
 */
export type WidgetHostState = ReturnType<typeof useWidgetHost>;

export function useWidgetHost({
  messages,
  running,
  explore,
  quiz = null,
  writtenAhead = NONE,
  missed = null,
  onQuizSubmitted,
  onRetry,
}: {
  messages: ThreadLine[];
  running: boolean;
  explore: { code: string; id: string } | null;
  quiz?: OpenQuiz | null;
  /** The Topic's written-ahead Widgets as the Learner sees them now; those the Tutor opened are drawn. */
  writtenAhead?: readonly WrittenAhead[];
  missed?: MissedQuiz | null;
  /** A quiz was marked: the conversation draws its result card, and after a miss starts the Tutor's follow-up. */
  onQuizSubmitted?: (submitted: QuizSubmitted) => void;
  /** Retry on a Widget that did not arrive: the page draws the reply again (a resume of the last turn). */
  onRetry?: () => void;
}) {
  const tutorWidgets = useMemo(() => widgetsIn(messages, running, writtenAhead), [messages, running, writtenAhead]);
  const exploreAnchor = useExploreAnchor(explore, tutorWidgets.length);
  // In drawing order; a Widget the Tutor draws again under the same title then takes the earlier one's tab.
  const drawn = useMemo(
    () => withExplore(withSources(tutorWidgets, messages), explore, exploreAnchor),
    [tutorWidgets, messages, explore, exploreAnchor],
  );
  const widgets = useMemo(() => updatedInPlace(drawn), [drawn]);

  // The quiz the Check tab holds: the open one, or the last one while its marking is still on screen.
  const [held, setHeld] = useState<OpenQuiz | null>(quiz);
  if (quiz && quiz.attemptId !== held?.attemptId) setHeld(quiz);
  const tab = held ?? missed;
  // What the panel shows: the Check while there is one, unless the Learner picked a Widget; else the picked or newest Widget.
  const picker = useWidgetPicker(widgets, { newest: drawn.at(-1)?.key, check: !!tab });
  const check = tab
    ? {
        name: checkTabName(tab),
        // When the marking is dismissed the tab goes, unless the server has opened the next attempt.
        // Keyed by the held attempt: a Topic's next quiz Check (a judging Check, ADR 0020) opens fresh, never under the
        // last Check's marking.
        body: <QuizPanel key={held?.attemptId ?? "missed"} quiz={quiz} missed={missed} onSubmitted={onQuizSubmitted} onDismiss={() => setHeld(quiz)} />,
      }
    : undefined;

  // Retry on a timed-out Widget draws the reply again; without a page to ask, Retry only waits another 12 seconds.
  const retry = useMemo(() => (onRetry ? () => onRetry() : null), [onRetry]);

  // Where a Widget belongs in a reply: a chip that shows it in the panel. Widgets are never drawn in the chat.
  const slot: WidgetSlot = ({ messageId, index }) => {
    const item = widgets.find((w) => holdsKey(w, `${messageId}:${index}`));
    if (!item) return null;
    const chip = <WidgetChip item={item} active={item.key === picker.view} onPick={picker.pick} />;
    return <WidgetRetryContext.Provider value={retry}>{chip}</WidgetRetryContext.Provider>;
  };

  /** Back to showing the newest Widget (or the open quiz's Check tab), as each turn starts. */
  const showNewest = picker.clear;

  return { widgets, picker, check, slot, showNewest, retry };
}

/** The Widget panel itself, showing what the host picked. */
export function WidgetHost({ host, topicTitle }: { host: WidgetHostState; topicTitle?: string }) {
  const { widgets, picker, check, retry } = host;
  return (
    <WidgetRetryContext.Provider value={retry}>
      <WidgetPanel widgets={widgets} view={picker.view} newestKey={picker.newestKey} picks={picker.picks} onPick={picker.pick} topicTitle={topicTitle} check={check} />
    </WidgetRetryContext.Provider>
  );
}
