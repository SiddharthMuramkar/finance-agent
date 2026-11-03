"use client";

import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useAuiState, useExternalStoreRuntime, type ThreadMessageLike } from "@assistant-ui/react";
import { createContext, useContext, type ReactNode } from "react";
import { WIDGET_OPENED, type WrittenAhead } from "@/course/written-ahead";
import type { TurnRef } from "@/tutor/transcript";
import type { TurnUsage } from "@/tutor/usage";
import { SaveToNotes } from "./save-to-notes";
import { splitReply } from "@/widgets/split";
import { ReplyMarkdown, type WidgetSlot } from "./reply-markdown";
import { SessionItemView, type SessionItemData } from "./session-item-view";
import { UnderTheHood } from "./under-the-hood";
import type { WidgetItem } from "./widget-panel";

// How a conversation's messages look, shared by the workspace and the old Session page: the Learner's
// messages as bubbles on the right, the Tutor's replies as plain text under a small navy "Tutor" label,
// with "Under the hood" beneath when the Learner has turned on Show developer details (Settings).

export type MessageLine = {
  role: "user" | "assistant";
  text: string;
  usage?: TurnUsage;
  /** Where a finished reply sits in its Session; it is what "Save to notes" keys on. */
  ref?: TurnRef;
  /** The reply goes on after a Session item, in the next reply line: Save to notes and the Widget count carry on there. */
  more?: true;
};
/** A display-only Session item between messages (a step divider), drawn by its kind; never a message. */
export type ItemLine = { role: "item" } & SessionItemData;
export type Line = MessageLine | ItemLine;
export type ThreadLine = Line & { id: string };

/**
 * Every Widget in the conversation, numbered in order. Keys match the slot's `${messageId}:${index}`. A written-ahead
 * Widget the Tutor opened (a WIDGET_OPENED item) is drawn with its code from `writtenAhead`, under the item's own key
 * (`${itemId}:0`); one the Topic no longer has is left out.
 */
export function widgetsIn(messages: ThreadLine[], running = false, writtenAhead: readonly WrittenAhead[] = []): WidgetItem[] {
  const out: WidgetItem[] = [];
  // A reply cut by a Session item counts its Widgets on across its parts, as the saved reply numbers them for Save to notes.
  let inReply = 0;
  let continues = false;
  messages.forEach((m, i) => {
    if (m.role === "item" && m.kind === WIDGET_OPENED) {
      const widget = writtenAhead.find((w) => w.id === m.data.id);
      if (widget) out.push({ key: `${m.id}:0`, number: out.length + 1, code: widget.code, complete: true, writtenAhead: widget.id });
      return;
    }
    if (m.role !== "assistant") return;
    const streaming = running && i === messages.length - 1;
    if (!continues) inReply = 0;
    continues = m.more === true;
    // The slot key counts within this line, as its Markdown finds each fence.
    let k = 0;
    for (const s of splitReply(m.text, { streaming })) {
      if (s.type === "widget") {
        const widgetIndex = inReply++;
        out.push({
          key: `${m.id}:${k++}`,
          number: out.length + 1,
          code: s.code,
          complete: s.complete,
          ...(m.ref && !streaming && { save: { kind: "widget" as const, ...m.ref, widgetIndex } }),
        });
      }
    }
  });
  return out;
}

/** Settings > Show developer details: whether each Tutor reply shows its "Under the hood" line. Off unless a page turns it on. */
const DeveloperDetailsContext = createContext(false);

/** Shows "Under the hood" under the Tutor replies inside it when `on` (the Learner's Show developer details choice). */
export function DeveloperDetails({ on, children }: { on: boolean; children: ReactNode }) {
  return <DeveloperDetailsContext.Provider value={on}>{children}</DeveloperDetailsContext.Provider>;
}

const ThreadContext = createContext<{ slot: WidgetSlot; usages: Map<string, TurnUsage>; refs: Map<string, TurnRef>; items: Map<string, SessionItemData> }>({
  slot: () => null,
  usages: new Map(),
  refs: new Map(),
  items: new Map(),
});

/** A Session item, which assistant-ui carries as a system message: drawn by its kind, with no label or bubble. */
function ItemMessage() {
  const id = useAuiState((s) => s.message.id);
  const { items, slot } = useContext(ThreadContext);
  const item = items.get(id);
  // A written-ahead Widget the Tutor opened stands where it was opened as its chip, as a Widget in a reply does.
  if (item?.kind === WIDGET_OPENED) return slot({ messageId: id, index: 0, code: "", complete: true });
  return item ? <SessionItemView item={item} /> : null;
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-[var(--bubble)] px-3 py-2 text-base leading-6">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

const Reply = () => <ReplyMarkdown slot={useContext(ThreadContext).slot} />;

function AssistantMessage() {
  const id = useAuiState((s) => s.message.id);
  const { usages, refs } = useContext(ThreadContext);
  const usage = useContext(DeveloperDetailsContext) ? usages.get(id) : undefined;
  const ref = refs.get(id);
  return (
    <MessagePrimitive.Root className="text-base leading-[26px]" data-testid="assistant-message">
      <p data-testid="tutor-label" className="mb-1 text-xs font-semibold leading-4 text-[var(--brand)]">Tutor</p>
      <MessagePrimitive.Parts components={{ Text: Reply }} />
      {ref && (
        <div className="mt-2">
          <SaveToNotes target={{ kind: "reply", ...ref }} what="reply" />
        </div>
      )}
      {usage && <UnderTheHood usage={usage} />}
    </MessagePrimitive.Root>
  );
}

const MESSAGE_COMPONENTS = { UserMessage, AssistantMessage, SystemMessage: ItemMessage };

/**
 * The messages of the current assistant-ui thread. `slot` decides what stands where a Widget belongs
 * (a chip in the workspace); `lines` supply the usage behind each reply's "Under the hood" line, and the
 * Session items drawn between messages.
 */
export function ThreadMessages({ lines, slot }: { lines: ThreadLine[]; slot: WidgetSlot }) {
  const usages = new Map(lines.flatMap((m) => (m.role !== "item" && m.usage ? [[m.id, m.usage] as const] : [])));
  // Save to notes saves a whole reply, so a reply cut by an item offers it once, after its last part.
  const refs = new Map(lines.flatMap((m) => (m.role === "assistant" && m.ref && !m.more ? [[m.id, m.ref] as const] : [])));
  const items = new Map(lines.flatMap((m) => (m.role === "item" ? [[m.id, { kind: m.kind, data: m.data }] as const] : [])));
  return (
    <ThreadContext.Provider value={{ slot, usages, refs, items }}>
      <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />
    </ThreadContext.Provider>
  );
}

// A Session item travels as a system message, which assistant-ui keeps in place and never sends anywhere: nothing here talks to the model.
export const convertMessage = (m: ThreadLine): ThreadMessageLike =>
  m.role === "item" ? { id: m.id, role: "system", content: [{ type: "text", text: m.kind }] } : { id: m.id, role: m.role, content: [{ type: "text", text: m.text }] };

/** A saved conversation, read-only: no composer and no model call. Ids are `line-<n>`, so Widget keys are `line-<n>:<k>`. */
export function ReadOnlyThread({ lines, slot, className = "flex flex-col gap-4", children }: { lines: Line[]; slot: WidgetSlot; className?: string; children?: ReactNode }) {
  const messages = lines.map((l, i) => ({ ...l, id: `line-${i}` }));
  const runtime = useExternalStoreRuntime({ messages, isRunning: false, convertMessage, onNew: async () => {} });
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root>
        <ThreadPrimitive.Viewport className={className}>
          <ThreadMessages lines={messages} slot={slot} />
        </ThreadPrimitive.Viewport>
      </ThreadPrimitive.Root>
      {children}
    </AssistantRuntimeProvider>
  );
}

/** The read-only Widget keys for `ReadOnlyThread`'s lines. */
export const readOnlyLines = (lines: Line[]): ThreadLine[] => lines.map((l, i) => ({ ...l, id: `line-${i}` }));
