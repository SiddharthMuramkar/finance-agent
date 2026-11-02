"use client";

import {
  AssistantRuntimeProvider,
  ComposerPrimitive,
  MessagePrimitive,
  ThreadPrimitive,
  useAuiState,
  useExternalStoreRuntime,
  type AppendMessage,
  type TextMessagePartComponent,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { useRouter } from "next/navigation";
import { createContext, useContext, useMemo, useState } from "react";
import { replaceBrokenWidgets } from "@/widgets/check";
import { splitReply, type Segment } from "@/widgets/split";
import type { TurnUsage } from "@/tutor/usage";
import { UnderTheHood } from "./under-the-hood";
import { WidgetView } from "./widget-view";

export type Line = { role: "user" | "assistant"; text: string; usage?: TurnUsage };
type Message = Line & { id: string };
type WidgetRef = { key: string; number: number; code: string; complete: boolean };

/** Splits every reply into prose and widget blocks; widgets are numbered across the conversation. */
function layout(messages: Message[], running: boolean) {
  const segments = new Map<string, (Segment & { key?: string; number?: number })[]>();
  const widgets: WidgetRef[] = [];
  messages.forEach((m, i) => {
    if (m.role !== "assistant") return;
    const streaming = running && i === messages.length - 1;
    let k = 0;
    segments.set(
      m.id,
      splitReply(m.text, { streaming }).map((s) => {
        if (s.type !== "widget") return s;
        const ref = { key: `${m.id}:${k++}`, number: widgets.length + 1, code: s.code, complete: s.complete };
        widgets.push(ref);
        return { ...s, key: ref.key, number: ref.number };
      }),
    );
  });
  return { segments, widgets };
}

type Layout = ReturnType<typeof layout> & { shown?: string; show(key: string): void; usages: Map<string, TurnUsage> };
const LayoutContext = createContext<Layout | null>(null);

/** A reply's prose, with a small marker where each widget belongs. On a phone the widget sits in the conversation. */
const ReplyText: TextMessagePartComponent = ({ text }) => {
  const ctx = useContext(LayoutContext)!;
  const id = useAuiState((s) => s.message.id);
  const segments = ctx.segments.get(id) ?? [{ type: "prose", text }];
  return (
    <div className="whitespace-pre-wrap leading-relaxed">
      {segments.map((s, i) =>
        s.type === "prose" ? (
          <span key={i}>{s.text}</span>
        ) : (
          <span key={i} className="my-2 block">
            <button
              onClick={() => ctx.show(s.key!)}
              data-testid="widget-marker"
              className={`hidden rounded border px-2 py-0.5 text-xs lg:inline-block ${
                ctx.shown === s.key ? "border-teal-700 text-teal-800 dark:border-teal-400 dark:text-teal-300" : "border-stone-300 text-stone-500 dark:border-stone-700"
              }`}
            >
              Widget {s.number} {s.complete ? "→" : "(drawing…)"}
            </button>
            <span className="block lg:hidden">
              <WidgetView code={s.code} complete={s.complete} />
            </span>
          </span>
        ),
      )}
    </div>
  );
};

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
  const ctx = useContext(LayoutContext)!;
  const id = useAuiState((s) => s.message.id);
  const usage = ctx.usages.get(id);
  return (
    <MessagePrimitive.Root className="max-w-[95%]" data-testid="assistant-message">
      <MessagePrimitive.Parts components={{ Text: ReplyText }} />
      {usage && <UnderTheHood usage={usage} />}
    </MessagePrimitive.Root>
  );
}

const convertMessage = (m: Message): ThreadMessageLike => ({ id: m.id, role: m.role, content: [{ type: "text", text: m.text }] });

/**
 * The Study Workspace: the conversation on the left and the latest generated
 * widget on the right, under a plain-text summary and one Continue button.
 * Replies stream in through assistant-ui's external-store runtime; widget
 * blocks are pulled out of the prose as they arrive.
 */
export function Conversation({ initial, summary }: { initial: Line[]; summary: string }) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(() => initial.map((l, i) => ({ ...l, id: `saved-${i}` })));
  const [running, setRunning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<string>();

  async function send(body: { message: string } | { continue: true }, shown: string) {
    setError(null);
    setRunning(true);
    setShown(undefined);
    const stamp = Date.now();
    setMessages((m) => [...m, { id: `u-${stamp}`, role: "user", text: shown }, { id: `a-${stamp}`, role: "assistant", text: "" }]);
    const updateReply = (f: (text: string) => string) =>
      setMessages((m) => [...m.slice(0, -1), { ...m[m.length - 1], text: f(m[m.length - 1].text) }]);
    let correction: string | null = null;
    try {
      const res = await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok || !res.body) throw new Error(`The Tutor could not answer (${res.status}).`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const part of parts) {
          if (!part) continue;
          const event = JSON.parse(part);
          if (event.type === "text" && correction === null) updateReply((t) => t + event.text);
          else if (event.type === "text") correction += event.text;
          else if (event.type === "correction") {
            correction = "";
            setFixing(true);
          } else if (event.type === "done" && event.usage) {
            const usage = event.usage as TurnUsage;
            setMessages((m) => m.map((x) => (x.id === `a-${stamp}` ? { ...x, usage } : x)));
          } else if (event.type === "error") setError(event.message);
        }
      }
      // The corrected widget replaces the broken one on screen; history keeps both.
      if (correction !== null) {
        const fix = correction;
        updateReply((t) => replaceBrokenWidgets(t, fix));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The turn failed.");
    } finally {
      setRunning(false);
      setFixing(false);
      // Re-reads the summary, since the Tutor may have finished a Teaching Step.
      router.refresh();
    }
  }

  const onNew = async (message: AppendMessage) => {
    const text = message.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    if (text) await send({ message: text }, text);
  };
  const runtime = useExternalStoreRuntime({ messages, isRunning: running, convertMessage, onNew });

  const laidOut = useMemo(() => layout(messages, running), [messages, running]);
  const current = laidOut.widgets.find((w) => w.key === shown) ?? laidOut.widgets.at(-1);
  const usages = useMemo(() => new Map(messages.flatMap((m) => (m.usage ? [[m.id, m.usage] as const] : []))), [messages]);
  const ctx: Layout = { ...laidOut, shown: current?.key, show: setShown, usages };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <LayoutContext.Provider value={ctx}>
        <div className="grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col">
            <section aria-label="Where you stand" className="mb-6 rounded-lg border border-stone-300 p-4 dark:border-stone-700">
              <p className="whitespace-pre-line text-sm leading-relaxed">{summary}</p>
              <button
                onClick={() => void send({ continue: true }, "Continue.")}
                disabled={running}
                className="mt-3 rounded bg-stone-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900"
              >
                Continue
              </button>
            </section>
            <ThreadPrimitive.Root className="flex flex-1 flex-col">
              <ThreadPrimitive.Viewport className="flex flex-1 flex-col gap-4">
                <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
              </ThreadPrimitive.Viewport>
              {fixing && <p className="mt-2 text-xs text-stone-500">Fixing the widget…</p>}
              {error && <p className="my-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
              <ComposerPrimitive.Root className="sticky bottom-0 mt-6 flex gap-2 bg-stone-50 py-3 dark:bg-stone-950">
                <ComposerPrimitive.Input
                  placeholder="Ask the Tutor"
                  aria-label="Message"
                  rows={1}
                  className="flex-1 resize-none rounded border border-stone-300 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-900"
                />
                <ComposerPrimitive.Send className="rounded bg-stone-900 px-4 py-2 text-white disabled:opacity-50 dark:bg-stone-100 dark:text-stone-900">
                  Send
                </ComposerPrimitive.Send>
              </ComposerPrimitive.Root>
            </ThreadPrimitive.Root>
          </div>
          <aside aria-label="Widgets" data-testid="widget-pane" className="hidden lg:block">
            <div className="sticky top-6">
              {current ? (
                <WidgetView key={current.key} code={current.code} complete={current.complete} />
              ) : (
                <p className="text-sm text-stone-500 dark:text-stone-400">Charts and calculators the Tutor makes appear here.</p>
              )}
            </div>
          </aside>
        </div>
      </LayoutContext.Provider>
    </AssistantRuntimeProvider>
  );
}
