"use client";

import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useAuiState, useExternalStoreRuntime, type ThreadMessageLike } from "@assistant-ui/react";
import { createContext, useContext, type ReactNode } from "react";
import type { TurnUsage } from "@/tutor/usage";
import { splitReply } from "@/widgets/split";
import { ReplyMarkdown, type WidgetSlot } from "./reply-markdown";
import { UnderTheHood } from "./under-the-hood";
import type { WidgetItem } from "./widget-panel";

// How a conversation's messages look, shared by the workspace and the old Session page: the Learner's
// messages as bubbles on the right, the Tutor's replies as plain text with "Under the hood" beneath.

export type Line = { role: "user" | "assistant"; text: string; usage?: TurnUsage };
export type ThreadLine = Line & { id: string };

/** Every Widget in the conversation, numbered in order. Keys match the slot's `${messageId}:${index}`. */
export function widgetsIn(messages: ThreadLine[], running = false): WidgetItem[] {
  const out: WidgetItem[] = [];
  messages.forEach((m, i) => {
    if (m.role !== "assistant") return;
    const streaming = running && i === messages.length - 1;
    let k = 0;
    for (const s of splitReply(m.text, { streaming })) {
      if (s.type === "widget") out.push({ key: `${m.id}:${k++}`, number: out.length + 1, code: s.code, complete: s.complete });
    }
  });
  return out;
}

const ThreadContext = createContext<{ slot: WidgetSlot; usages: Map<string, TurnUsage> }>({ slot: () => null, usages: new Map() });

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
  const usage = useContext(ThreadContext).usages.get(id);
  return (
    <MessagePrimitive.Root className="text-base leading-[26px]" data-testid="assistant-message">
      <MessagePrimitive.Parts components={{ Text: Reply }} />
      {usage && <UnderTheHood usage={usage} />}
    </MessagePrimitive.Root>
  );
}

const MESSAGE_COMPONENTS = { UserMessage, AssistantMessage };

/**
 * The messages of the current assistant-ui thread. `slot` decides what stands where a Widget belongs
 * (a chip in the workspace); `lines` supply the usage behind each reply's "Under the hood" line.
 */
export function ThreadMessages({ lines, slot }: { lines: ThreadLine[]; slot: WidgetSlot }) {
  const usages = new Map(lines.flatMap((m) => (m.usage ? [[m.id, m.usage] as const] : [])));
  return (
    <ThreadContext.Provider value={{ slot, usages }}>
      <ThreadPrimitive.Messages components={MESSAGE_COMPONENTS} />
    </ThreadContext.Provider>
  );
}

export const convertMessage = (m: ThreadLine): ThreadMessageLike => ({ id: m.id, role: m.role, content: [{ type: "text", text: m.text }] });

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
