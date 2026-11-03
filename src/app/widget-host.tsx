"use client";

import { useMemo, useState } from "react";
import type { WrittenAhead } from "@/course/written-ahead";
import type { MissedQuiz, OpenQuiz } from "@/learner/quiz";
import { checkTabName, QuizPanel, type QuizSubmitted } from "./quiz-panel";
import type { WidgetSlot } from "./reply-markdown";
import { widgetsIn, type ThreadLine } from "./thread";
import { holdsKey, updatedInPlace, useExploreAnchor, useWidgetPicker, WidgetChip, WidgetPanel, withExplore } from "./widget-panel";

/** The picker's key for the Check tab; no Widget's key looks like it (theirs are `${messageId}:${index}` or "explore"). */
const CHECK_KEY = "check";

const NONE: readonly WrittenAhead[] = [];

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
}: {
  messages: ThreadLine[];
  running: boolean;
  explore: { code: string; id?: string } | null;
  quiz?: OpenQuiz | null;
  /** The Topic's written-ahead Widgets as the Learner sees them now; those the Tutor opened are drawn. */
  writtenAhead?: readonly WrittenAhead[];
  missed?: MissedQuiz | null;
  /** A quiz was marked: the conversation draws its result card, and after a miss starts the Tutor's follow-up. */
  onQuizSubmitted?: (submitted: QuizSubmitted) => void;
}) {
  const tutorWidgets = useMemo(() => widgetsIn(messages, running, writtenAhead), [messages, running, writtenAhead]);
  const exploreAnchor = useExploreAnchor(explore, tutorWidgets.length);
  // In drawing order; a Widget the Tutor draws again under the same title then takes the earlier one's tab.
  const drawn = useMemo(() => withExplore(tutorWidgets, explore, exploreAnchor), [tutorWidgets, explore, exploreAnchor]);
  const widgets = useMemo(() => updatedInPlace(drawn), [drawn]);
  const picker = useWidgetPicker(widgets, drawn.at(-1)?.key);

  // The quiz the Check tab holds: the open one, or the last one while its marking is still on screen.
  const [held, setHeld] = useState<OpenQuiz | null>(quiz);
  if (quiz && quiz.attemptId !== held?.attemptId) setHeld(quiz);
  const tab = held ?? missed;
  const checkSelected = !!tab && (picker.picked === CHECK_KEY || !widgets.some((w) => holdsKey(w, picker.picked)));
  const check = tab
    ? {
        name: checkTabName(tab),
        selected: checkSelected,
        onPick: () => picker.pick(CHECK_KEY),
        // When the marking is dismissed the tab goes, unless the server has opened the next attempt.
        body: <QuizPanel quiz={quiz} missed={missed} onSubmitted={onQuizSubmitted} onDismiss={() => setHeld(quiz)} />,
      }
    : undefined;

  // Where a Widget belongs in a reply: a chip that shows it in the panel. Widgets are never drawn in the chat.
  const slot: WidgetSlot = ({ messageId, index }) => {
    const item = widgets.find((w) => holdsKey(w, `${messageId}:${index}`));
    return item ? <WidgetChip item={item} active={!checkSelected && item.key === picker.shown?.key} onPick={picker.pick} /> : null;
  };

  /** Back to showing the newest Widget (or the open quiz's Check tab), as each turn starts. */
  const showNewest = picker.clear;

  return { widgets, picker, check, slot, showNewest };
}

/** The Widget panel itself, showing what the host picked. */
export function WidgetHost({ host, topicTitle }: { host: WidgetHostState; topicTitle?: string }) {
  const { widgets, picker, check } = host;
  return <WidgetPanel widgets={widgets} shown={picker.shown} flashing={picker.flashing} onPick={picker.pick} topicTitle={topicTitle} check={check} />;
}
