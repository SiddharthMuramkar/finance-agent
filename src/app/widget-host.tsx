"use client";

import { useMemo } from "react";
import type { WidgetSlot } from "./reply-markdown";
import { widgetsIn, type ThreadLine } from "./thread";
import { useExploreAnchor, useWidgetPicker, WidgetChip, WidgetPanel, withExplore } from "./widget-panel";

/**
 * The host for the Study Workspace's Widget panel: which Widgets the conversation holds (the Tutor's, plus the
 * Topic's explore Widget), which one the panel shows, and the chip that stands where each belongs in a reply.
 * The left column draws the chips through `slot`; the frame puts `WidgetHost` in the right column.
 */
export type WidgetHostState = ReturnType<typeof useWidgetHost>;

export function useWidgetHost({ messages, running, explore }: { messages: ThreadLine[]; running: boolean; explore: { code: string } | null }) {
  const tutorWidgets = useMemo(() => widgetsIn(messages, running), [messages, running]);
  const exploreAnchor = useExploreAnchor(explore, tutorWidgets.length);
  const widgets = useMemo(() => withExplore(tutorWidgets, explore, exploreAnchor), [tutorWidgets, explore, exploreAnchor]);
  const picker = useWidgetPicker(widgets);

  // Where a Widget belongs in a reply: a chip that shows it in the panel. Widgets are never drawn in the chat.
  const slot: WidgetSlot = ({ messageId, index }) => {
    const item = widgets.find((w) => w.key === `${messageId}:${index}`);
    return item ? <WidgetChip item={item} active={item.key === picker.shown?.key} onPick={picker.pick} /> : null;
  };

  /** Back to showing the newest Widget, as each turn starts. */
  const showNewest = picker.clear;

  return { widgets, picker, slot, showNewest };
}

/** The Widget panel itself, showing what the host picked. */
export function WidgetHost({ host, topicTitle }: { host: WidgetHostState; topicTitle?: string }) {
  const { widgets, picker } = host;
  return <WidgetPanel widgets={widgets} shown={picker.shown} flashing={picker.flashing} onPick={picker.pick} topicTitle={topicTitle} />;
}
