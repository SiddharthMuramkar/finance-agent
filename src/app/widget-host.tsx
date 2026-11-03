"use client";

import { useMemo, useState } from "react";
import type { OpenQuiz } from "@/learner/quiz";
import { checkTabName, QuizPanel } from "./quiz-panel";
import type { WidgetSlot } from "./reply-markdown";
import { widgetsIn, type ThreadLine } from "./thread";
import { useExploreAnchor, useWidgetPicker, WidgetChip, WidgetPanel, withExplore } from "./widget-panel";

/** The picker's key for the Check tab; no Widget's key looks like it (theirs are `${messageId}:${index}` or "explore"). */
const CHECK_KEY = "check";

/**
 * The host for the Study Workspace's Widget panel: which Widgets the conversation holds (the Tutor's, plus the
 * Topic's explore Widget), the open quiz's Check tab, which of them the panel shows, and the chip that stands
 * where each Widget belongs in a reply. The left column draws the chips through `slot`; the frame puts
 * `WidgetHost` in the right column.
 *
 * An open quiz is shown on its own tab ("Check 1 of 2"), selected unless the Learner picks a Widget's tab. The
 * tab is kept after the server stops sending the quiz (a pass) until the Learner dismisses the marking.
 */
export type WidgetHostState = ReturnType<typeof useWidgetHost>;

export function useWidgetHost({ messages, running, explore, quiz = null }: { messages: ThreadLine[]; running: boolean; explore: { code: string } | null; quiz?: OpenQuiz | null }) {
  const tutorWidgets = useMemo(() => widgetsIn(messages, running), [messages, running]);
  const exploreAnchor = useExploreAnchor(explore, tutorWidgets.length);
  const widgets = useMemo(() => withExplore(tutorWidgets, explore, exploreAnchor), [tutorWidgets, explore, exploreAnchor]);
  const picker = useWidgetPicker(widgets);

  // The quiz the Check tab holds: the open one, or the last one while its marking is still on screen.
  const [held, setHeld] = useState<OpenQuiz | null>(quiz);
  if (quiz && quiz.attemptId !== held?.attemptId) setHeld(quiz);
  const checkSelected = !!held && (picker.picked === CHECK_KEY || !widgets.some((w) => w.key === picker.picked));
  const check = held
    ? {
        name: checkTabName(held),
        selected: checkSelected,
        onPick: () => picker.pick(CHECK_KEY),
        // When the marking is dismissed the tab goes, unless the server has opened the next attempt.
        body: <QuizPanel quiz={quiz} onDismiss={() => setHeld(quiz)} />,
      }
    : undefined;

  // Where a Widget belongs in a reply: a chip that shows it in the panel. Widgets are never drawn in the chat.
  const slot: WidgetSlot = ({ messageId, index }) => {
    const item = widgets.find((w) => w.key === `${messageId}:${index}`);
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
