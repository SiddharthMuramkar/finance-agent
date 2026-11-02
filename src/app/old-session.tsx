"use client";

import { AssistantRuntimeProvider, MessagePrimitive, ThreadPrimitive, useAuiState, useExternalStoreRuntime, type ThreadMessageLike } from "@assistant-ui/react";
import { createContext, useContext } from "react";
import type { TurnUsage } from "@/tutor/usage";
import { ReplyMarkdown, type WidgetSlot } from "./reply-markdown";
import { UnderTheHood } from "./under-the-hood";
import { WidgetView } from "./widget-view";

export type OldLine = { role: "user" | "assistant"; text: string; usage?: TurnUsage };

const UsageContext = createContext<Map<string, TurnUsage>>(new Map());

/** In an old Session each widget is rebuilt where it stood, with controls at their starting values. */
const inlineWidget: WidgetSlot = ({ code, complete }) => (
  <div className="my-3" data-testid="inline-widget">
    <WidgetView code={code} complete={complete} />
  </div>
);

const Reply = () => <ReplyMarkdown slot={inlineWidget} />;

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] whitespace-pre-wrap rounded-lg bg-stone-200 px-3 py-2 dark:bg-stone-800">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  const id = useAuiState((s) => s.message.id);
  const usage = useContext(UsageContext).get(id);
  return (
    <MessagePrimitive.Root data-testid="assistant-message">
      <MessagePrimitive.Parts components={{ Text: Reply }} />
      {usage && <UnderTheHood usage={usage} />}
    </MessagePrimitive.Root>
  );
}

const convertMessage = (m: OldLine & { id: string }): ThreadMessageLike => ({ id: m.id, role: m.role, content: [{ type: "text", text: m.text }] });

/** An old Session, read-only: the same Markdown rendering as the workspace, with no composer and no model call. */
export function OldSession({ lines }: { lines: OldLine[] }) {
  const messages = lines.map((l, i) => ({ ...l, id: `old-${i}` }));
  const runtime = useExternalStoreRuntime({ messages, isRunning: false, convertMessage, onNew: async () => {} });
  const usages = new Map(messages.flatMap((m) => (m.usage ? [[m.id, m.usage] as const] : [])));
  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <UsageContext.Provider value={usages}>
        <ThreadPrimitive.Root>
          <ThreadPrimitive.Viewport className="flex flex-col gap-4">
            <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          </ThreadPrimitive.Viewport>
        </ThreadPrimitive.Root>
      </UsageContext.Provider>
    </AssistantRuntimeProvider>
  );
}
