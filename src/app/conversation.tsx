"use client";

import { AssistantRuntimeProvider, ComposerPrimitive, ThreadPrimitive, useExternalStoreRuntime, type AppendMessage } from "@assistant-ui/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { replaceBrokenWidgets } from "@/widgets/check";
import type { TurnRef } from "@/tutor/transcript";
import type { TurnUsage } from "@/tutor/usage";
import type { OpenQuiz } from "@/learner/quiz";
import type { ReviewState } from "@/learner/review";
import { QuizPanel } from "./quiz-panel";
import { ReviewPanel } from "./review-panel";
import type { WidgetSlot } from "./reply-markdown";
import { convertMessage, ThreadMessages, widgetsIn, type Line, type ThreadLine } from "./thread";
import { PrimaryButton, SecondaryButton } from "./ui";
import { exploreItem, PinnedExplore, useExploreAnchor, useWidgetPicker, WidgetChip, WidgetPanel, withExplore } from "./widget-panel";
import { StatusCard, type Place } from "./workspace-parts";

export type { Line };
type Message = ThreadLine;

/**
 * The Study Workspace: the status card, folded review and quiz, and the conversation on the left; the
 * Widget panel on the right. Replies stream in through assistant-ui's external-store runtime; widget
 * blocks are pulled out of the prose as they arrive, and a chip stands where each belongs.
 */
/** The latest turn's saved status, as the page found it. */
export type PendingTurn = { status: "running" | "cut_off" | "failed"; error: string | null } | null;
type Body = { message: string; paste?: string } | { continue: true } | { resume: true };

const NOTICES: Record<string, string> = {
  updated: "The Tutor was updated, so this is a new Session, started from your saved progress.",
  refused: "A new Session started from your saved progress.",
};
/** How many cut-offs in a row the browser resumes on its own, and how long it waits for a turn running elsewhere. */
const MAX_RESUMES = 10;
const BUSY_WAIT_MS = 3000;
const MAX_BUSY_WAITS = 60;

export function Conversation({
  initial,
  summary,
  quiz,
  pending,
  review,
  place = null,
  explore = null,
}: {
  initial: Line[];
  summary: string;
  quiz: OpenQuiz | null;
  pending: PendingTurn;
  review: ReviewState;
  place?: Place;
  /** The Topic's own explore Widget while the Learner has it (see exploreWidgetFor); shown by code, not drawn by the Tutor. */
  explore?: { code: string } | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(() => initial.map((l, i) => ({ ...l, id: `saved-${i}` })));
  const [running, setRunning] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(pending?.status === "failed" ? pending.error : null);
  const [notice, setNotice] = useState<string | null>(pending?.status === "running" ? "A turn is in progress, perhaps on another device." : null);
  const [canRetry, setCanRetry] = useState(pending?.status === "failed");
  const [cutShort, setCutShort] = useState(false);
  const tutorWidgets = useMemo(() => widgetsIn(messages, running), [messages, running]);
  const exploreAnchor = useExploreAnchor(explore, tutorWidgets.length);
  const widgets = useMemo(() => withExplore(tutorWidgets, explore, exploreAnchor), [tutorWidgets, explore, exploreAnchor]);
  const picker = useWidgetPicker(widgets);

  /**
   * Sends a message, Continue, or a resume, and streams the reply. When the stream ends
   * without "done" (the turn was cut off by the time limit or the connection dropped),
   * it resumes on its own from the last saved loop step; the saved text replaces what
   * was on screen.
   */
  async function send(body: Body, userText?: string) {
    // One short spoken status per turn (WCAG 4.1.3), never the streaming text itself.
    let problem: string | null = null;
    const fail = (message: string | null) => {
      if (message) problem = message;
      setError(message);
    };
    fail(null);
    setAnnouncement("Tutor is replying");
    setNotice(null);
    setCanRetry(false);
    setCutShort(false);
    setRunning(true);
    picker.clear();
    const stamp = Date.now();
    const replyId = `a-${stamp}`;
    setMessages((m) => {
      if (userText !== undefined) return [...m, { id: `u-${stamp}`, role: "user", text: userText }, { id: replyId, role: "assistant", text: "" }];
      // A resume continues the reply on screen, or starts one after the Learner's last message.
      const last = m[m.length - 1];
      return last?.role === "assistant" ? [...m.slice(0, -1), { ...last, id: replyId }] : [...m, { id: replyId, role: "assistant", text: "" }];
    });
    const updateReply = (f: (text: string) => string) => setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, text: f(x.text) } : x)));
    let request = body;
    let resumes = 0;
    let busyWaits = 0;
    try {
      for (;;) {
        const res = await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
        if (res.status === 409) {
          const { error: busy } = (await res.json()) as { error: string };
          if (!("resume" in request)) {
            // Nothing was saved: take the message back off the screen.
            setMessages((m) => m.filter((x) => x.id !== `u-${stamp}` && x.id !== replyId));
            fail(busy);
            return;
          }
          // The turn is still running elsewhere (for example, the connection dropped): wait for it.
          if (++busyWaits > MAX_BUSY_WAITS) return window.location.reload();
          setNotice(busy);
          await new Promise((r) => setTimeout(r, BUSY_WAIT_MS));
          continue;
        }
        if (!res.ok || !res.body) throw new Error(`The Tutor could not answer (${res.status}).`);
        let finished = false;
        let failed = false;
        let correction: string | null = null;
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
            else if (event.type === "replay") updateReply(() => event.text);
            else if (event.type === "correction") {
              correction = "";
              setFixing(true);
            } else if (event.type === "done") {
              finished = true;
              if (event.usage) {
                const usage = event.usage as TurnUsage;
                setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, usage } : x)));
              }
              // The finished reply can now be saved to notes.
              if (event.ref) {
                const ref = event.ref as TurnRef;
                setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, ref } : x)));
              }
            } else if (event.type === "session" && NOTICES[event.reason]) setNotice(NOTICES[event.reason]);
            else if (event.type === "refusal") {
              // Only the declined loop step is dropped; what earlier steps saved stays, as a reload shows it.
              updateReply(() => event.text ?? "");
              setNotice(event.message);
            } else if (event.type === "cut_short") setCutShort(true);
            else if (event.type === "save_failed") fail(event.message);
            else if (event.type === "error") {
              failed = true;
              fail(event.message);
              setCanRetry(true);
            }
          }
        }
        // The corrected widget replaces the broken one on screen; history keeps both.
        if (correction !== null) {
          const fix = correction;
          updateReply((t) => replaceBrokenWidgets(t, fix));
        }
        if (finished || failed) return;
        // No "done": the turn was cut off. Resume from the last saved loop step.
        if (++resumes > MAX_RESUMES) {
          fail("The turn keeps being cut off. Press Retry to try again.");
          setCanRetry(true);
          return;
        }
        request = { resume: true };
      }
    } catch (err) {
      fail(err instanceof Error ? err.message : "The turn failed.");
      setCanRetry(true);
    } finally {
      setAnnouncement(problem ?? "Reply ready");
      setRunning(false);
      setFixing(false);
      // Re-reads the summary, since the Tutor may have finished a Teaching Step.
      router.refresh();
    }
  }

  // A turn cut off while the page was closed resumes as soon as the page opens.
  const resumedOnOpen = useRef(false);
  useEffect(() => {
    if (pending?.status !== "cut_off" || resumedOnOpen.current) return;
    resumedOnOpen.current = true;
    void send({ resume: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNew = async (message: AppendMessage) => {
    const text = message.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    if (text) await send({ message: text }, text);
  };
  const runtime = useExternalStoreRuntime({ messages, isRunning: running, convertMessage, onNew });

  // Where a Widget belongs in a reply: a chip that shows it in the panel. Widgets are never drawn in the chat.
  const slot: WidgetSlot = ({ messageId, index }) => {
    const item = widgets.find((w) => w.key === `${messageId}:${index}`);
    return item ? <WidgetChip item={item} active={item.key === picker.shown?.key} onPick={picker.pick} /> : null;
  };

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="grid min-h-0 flex-1 grid-cols-2 grid-rows-[minmax(0,1fr)] items-start gap-6 lg:gap-8">
        <ThreadPrimitive.Root className="flex h-full min-h-0 min-w-0 flex-col">
          <div className="mb-6 flex flex-col gap-3">
            <StatusCard place={place} summary={summary} onContinue={() => void send({ continue: true }, "Continue.")} disabled={running} />
            {explore && <PinnedExplore item={exploreItem(explore.code)} />}
            <ReviewPanel review={review} />
            <QuizPanel quiz={quiz} />
          </div>
          <ThreadPrimitive.Viewport className="min-h-0 flex-1 overflow-y-auto pb-6">
            <div className="flex flex-col gap-4">
              <ThreadMessages lines={messages} slot={slot} />
            </div>
            {fixing && <p className="mt-2 text-xs leading-4 text-[var(--muted)]">Fixing the widget…</p>}
            {notice && (
              <p className="my-3 text-sm leading-5 text-[var(--muted)]" data-testid="turn-notice">
                {notice}
              </p>
            )}
            {error && (
              <p className="my-3 text-sm leading-5 text-[var(--danger)]" data-testid="turn-error">
                {error}
              </p>
            )}
            {(canRetry || cutShort) && !running && (
              <div className="my-2 flex items-center gap-2">
                {canRetry && <SecondaryButton onClick={() => void send({ resume: true })}>Retry</SecondaryButton>}
                {cutShort && (
                  <>
                    <span className="text-sm leading-5 text-[var(--muted)]">The reply was cut short.</span>
                    <SecondaryButton onClick={() => void send({ continue: true }, "Continue.")}>Continue</SecondaryButton>
                  </>
                )}
              </div>
            )}
            <PastePanel disabled={running} onSend={(message, paste) => void send({ message, paste }, `${message}\n\n${pastePreview(paste)}`)} />
          </ThreadPrimitive.Viewport>
          <p role="status" aria-live="polite" className="sr-only" data-testid="turn-status">
            {announcement}
          </p>
          <div className="relative">
            <div aria-hidden className="fade-above pointer-events-none absolute inset-x-0 -top-6 h-6" />
            <ComposerPrimitive.Root className="flex gap-2">
              <ComposerPrimitive.Input
                placeholder="Ask the Tutor"
                aria-label="Message"
                minRows={1}
                maxRows={6}
                className="flex-1 resize-none rounded border border-[var(--border)] bg-[var(--field)] px-3 py-2 text-base leading-6 placeholder:text-[var(--muted)] focus:border-[var(--brand)] focus:outline-hidden focus:ring-1 focus:ring-[var(--brand)]"
              />
              <ComposerPrimitive.Send className="rounded bg-[var(--brand)] px-4 text-base text-[var(--brand-ink)] transition-colors duration-200 hover:bg-[var(--brand-hover)] disabled:opacity-50 disabled:hover:bg-[var(--brand)]">
                Send
              </ComposerPrimitive.Send>
            </ComposerPrimitive.Root>
          </div>
        </ThreadPrimitive.Root>
        {/* Capped at the column, so the panel is never taller than the space under the header. */}
        <aside aria-label="Widget panel" data-testid="widget-pane" className="sticky top-6 max-h-[min(100%,calc(100dvh-48px))] min-w-0 overflow-y-auto">
          <WidgetPanel widgets={widgets} shown={picker.shown} flashing={picker.flashing} onPick={picker.pick} topicTitle={place?.title} />
        </aside>
      </div>
    </AssistantRuntimeProvider>
  );
}

/** How a paste shows in the thread: a short label, as the saved transcript shows it. */
function pastePreview(paste: string): string {
  const words = paste.split(/\s+/).filter(Boolean);
  return `(Pasted passage, ${words.length} words: "${words.slice(0, 6).join(" ")} …")`;
}

/**
 * Pasting the part of a piece being studied (for example a Zitron article read on his own site).
 * The text is saved privately with this Session and given to the Tutor with the message; it is
 * never added to the Library.
 */
function PastePanel({ disabled, onSend }: { disabled: boolean; onSend: (message: string, paste: string) => void }) {
  const [paste, setPaste] = useState("");
  const [note, setNote] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)} className="mt-6 rounded-lg border border-[var(--border)] p-3 text-sm leading-5" data-testid="paste-panel">
      <summary className="cursor-pointer select-none">Paste a passage</summary>
      <p className="mt-2 text-xs leading-4 text-[var(--muted)]">
        Paste the part of the piece you are studying. It is kept privately with this Session and is never added to the Library. The Tutor works only from what you paste.
      </p>
      <textarea
        value={paste}
        onChange={(e) => setPaste(e.target.value)}
        aria-label="Passage to paste"
        rows={6}
        className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--field)] px-3 py-2"
      />
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        aria-label="Message with the passage"
        placeholder="Optional: what you want to ask about it"
        className="mt-2 w-full rounded border border-[var(--border)] bg-[var(--field)] px-3 py-2"
      />
      <PrimaryButton
        disabled={disabled || !paste.trim()}
        onClick={() => {
          onSend(note.trim() || "Here is the passage we are studying.", paste.trim());
          setPaste("");
          setNote("");
          setOpen(false);
        }}
        className="mt-2"
      >
        Send passage
      </PrimaryButton>
    </details>
  );
}
