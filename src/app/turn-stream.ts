"use client";

import { useExternalStoreRuntime, type AppendMessage } from "@assistant-ui/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { TOPIC_START } from "@/course/topic-start";
import type { NextName } from "@/tutor/next";
import { replaceBrokenWidgets, withoutLeftOut } from "@/widgets/check";
import type { Shown } from "@/tutor/session-log";
import type { TurnRef } from "@/tutor/transcript";
import type { TurnUsage } from "@/tutor/usage";
import type { SessionItemData } from "./session-item-view";
import { convertMessage, type Line, type ThreadLine } from "./thread";

/** How an attached passage shows in the thread: a short label, as the saved transcript shows it. */
export function pastePreview(paste: string): string {
  const words = paste.split(/\s+/).filter(Boolean);
  return `(Pasted passage, ${words.length} words: "${words.slice(0, 6).join(" ")} …")`;
}

/**
 * Turn streaming for the Study Workspace: the conversation on screen and the state of the turn being
 * run (running, notices, errors, Retry, cut short). It sends a turn to /api/turn, streams the reply in,
 * resumes cut-off turns on its own, and gives assistant-ui its external-store runtime. It draws nothing:
 * the left column shows its state, and the Widget host reads its messages.
 */

/** The latest turn's saved status, as the page found it. */
export type PendingTurn = { status: "running" | "cut_off" | "failed"; error: string | null } | null;
/**
 * What a turn request carries: a message (with an optional pasted passage), Continue (the cut-off reply's), the
 * opener, the Learner's Next (naming the step on its chip, or "complete"), or a resume.
 */
export type TurnBody = { message: string; paste?: string } | { continue: true } | { opener: true } | { next: NextName } | { resume: true };

/** How long "Tutor is writing…" shows before it changes to "Still working on it…". */
export const SLOW_AFTER_MS = 8000;
/** What the writing indicator says while a turn waits for its first words: "writing", then "slow" after 8 seconds. */
export type Waiting = "writing" | "slow" | null;

/** How many cut-offs in a row the browser resumes on its own, and how long it waits for a turn running elsewhere. */
const MAX_RESUMES = 10;
const BUSY_WAIT_MS = 3000;
const MAX_BUSY_WAITS = 60;

export type TurnStream = ReturnType<typeof useTurnStream>;

/**
 * The conversation and its turn state. `onTurnStart` runs as each turn starts (the Widget host uses it to
 * go back to showing the newest Widget). `shown` is what the page shows (its Topic's Session, or the Topic
 * before its first turn): every turn request carries it, so a tab left on another Topic is refused, and
 * each finished turn says what the next request should carry. With `opener`, a page whose Session has no
 * messages (and no unfinished turn) starts the opener by itself: a Tutor turn with no Learner bubble.
 */
export function useTurnStream({
  initial,
  pending,
  onTurnStart,
  shown,
  opener = false,
}: {
  initial: Line[];
  pending: PendingTurn;
  onTurnStart: () => void;
  shown?: Shown;
  opener?: boolean;
}) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const shownRef = useRef(shown);
  const [messages, setMessages] = useState<ThreadLine[]>(() => initial.map((l, i) => ({ ...l, id: `saved-${i}` })));
  const [running, setRunning] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [fixing, setFixing] = useState(false);
  const [error, setError] = useState<string | null>(pending?.status === "failed" ? pending.error : null);
  const [notice, setNotice] = useState<string | null>(pending?.status === "running" ? "A turn is in progress, perhaps on another device." : null);
  const [canRetry, setCanRetry] = useState(pending?.status === "failed");
  const [cutShort, setCutShort] = useState(false);
  const [waiting, setWaiting] = useState<Waiting>(null);
  // The passage attached to the next message: null while the Attach a passage box is closed.
  const [passage, setPassage] = useState<string | null>(null);

  /**
   * Sends a message, Continue, or a resume, and streams the reply. When the stream ends
   * without "done" (the turn was cut off by the time limit or the connection dropped),
   * it resumes on its own from the last saved loop step; the saved text replaces what
   * was on screen.
   */
  async function send(body: TurnBody, userText?: string) {
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
    setWaiting("writing");
    // A slow turn never looks frozen: after 8 seconds with no words, the indicator says so.
    const slow = setTimeout(() => setWaiting((w) => (w === "writing" ? "slow" : w)), SLOW_AFTER_MS);
    onTurnStart();
    const stamp = Date.now();
    const firstId = `a-${stamp}`;
    // The reply part text streams into: a Session item (a step divider) arriving mid-reply starts a new part after it.
    let replyId = firstId;
    const partIds = [firstId];
    setMessages((m) => {
      if (userText !== undefined) return [...m, { id: `u-${stamp}`, role: "user", text: userText }, { id: firstId, role: "assistant", text: "" }];
      // A resume continues the reply on screen, or starts one after the Learner's last message.
      const last = m[m.length - 1];
      if ("resume" in body && last?.role === "assistant") return [...m.slice(0, -1), { ...last, id: firstId }];
      // A Next (or the opener) is a new turn with no Learner bubble: its reply starts below what is on screen.
      return [...m, { id: firstId, role: "assistant", text: "" }];
    });
    const updateReply = (f: (text: string) => string) => setMessages((m) => m.map((x) => (x.id === replyId && x.role !== "item" ? { ...x, text: f(x.text) } : x)));
    /**
     * Draws a Session item where the reply has got to: before the reply if it has no text yet, else between two parts of
     * it. `after`: straight after the reply part, which carries on unsplit (a correction's item; its text never shows).
     */
    const addItem = (item: SessionItemData, after = false) => {
      const at = replyId;
      const part = `${firstId}-${partIds.length}`;
      const itemLine: ThreadLine = { id: `${part}-item`, role: "item", ...item };
      if (after) {
        partIds.push(part);
        setMessages((m) => {
          const i = m.findIndex((x) => x.id === at);
          return i < 0 ? [...m, itemLine] : [...m.slice(0, i + 1), itemLine, ...m.slice(i + 1)];
        });
        return;
      }
      setMessages((m) => {
        const i = m.findIndex((x) => x.id === at);
        const current = m[i];
        if (!current || current.role === "item") return [...m, itemLine, { id: part, role: "assistant", text: "" }];
        // Nothing written yet: the item goes before the reply, which carries on as the new part.
        if (!current.text) return [...m.slice(0, i), itemLine, { ...current, id: part }, ...m.slice(i + 1)];
        return [...m.slice(0, i), { ...current, more: true }, itemLine, { id: part, role: "assistant", text: "" }, ...m.slice(i + 1)];
      });
      replyId = part;
      partIds.push(part);
    };
    /** Every line this send drew: the reply's parts and the items between them. */
    const ours = (x: ThreadLine) => x.id === firstId || x.id.startsWith(`${firstId}-`);
    /**
     * A replay (a resume, or a refusal) sends the whole reply's saved text: it replaces every part of the reply and the
     * items between them (a reload draws those again from what was saved).
     */
    const replaceReply = (text: string) => {
      replyId = firstId;
      partIds.splice(1);
      setMessages((m) => {
        const first = m.findIndex(ours);
        if (first < 0) return m;
        // Parts of this reply the page loaded before a resume, with their items, go too; never the Topic Start card,
        // which opens the conversation and is drawn by the page, not saved with the reply.
        let start = first;
        const earlierPart = (x: ThreadLine) => (x.role === "item" && x.kind !== TOPIC_START) || (x.role === "assistant" && x.more === true);
        while (start > 0 && earlierPart(m[start - 1])) start--;
        return [...m.slice(0, start), { id: firstId, role: "assistant", text }, ...m.slice(first).filter((x) => !ours(x))];
      });
    };
    let request = body;
    let resumes = 0;
    let busyWaits = 0;
    try {
      for (;;) {
        const res = await fetch("/api/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...request, ...(shownRef.current && { shown: shownRef.current }) }),
        });
        if (res.status === 409) {
          const { error: busy, stale } = (await res.json()) as { error: string; stale?: boolean };
          if (stale && "resume" in request) {
            // This tab shows a Topic the Learner has left in another tab: nothing ran, and a reload shows the current one.
            fail(busy);
            return;
          }
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
        // Which of the reply's widgets the correction replaces, as the server named them.
        let flagged: number[] | undefined;
        // False when the correction only leaves widgets out: no corrected block replaces anything then.
        let replaces = true;
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
            // The first words of the reply end the writing indicator.
            if ((event.type === "text" || event.type === "replay") && event.text) setWaiting(null);
            if (event.type === "text" && correction === null) updateReply((t) => t + event.text);
            else if (event.type === "text") correction += event.text;
            else if (event.type === "replay") replaceReply(event.text);
            // An item the correction stores (a written-ahead Widget opened instead) stands after the reply it corrects.
            else if (event.type === "item" && event.item) addItem(event.item as SessionItemData, correction !== null);
            else if (event.type === "correction") {
              correction = "";
              const named = Array.isArray(event.widgets) ? (event.widgets as number[]) : undefined;
              const leaveOut = Array.isArray(event.leaveOut) ? (event.leaveOut as number[]) : [];
              // Widgets a written-ahead Widget covers leave the reply now; the corrected block replaces the others.
              const after = withoutLeftOut("", named ?? [], leaveOut);
              flagged = named && after.flagged;
              replaces = after.left;
              if (leaveOut.length) updateReply((t) => withoutLeftOut(t, named ?? [], leaveOut).text);
              setFixing(true);
            } else if (event.type === "done") {
              finished = true;
              if (event.usage) {
                const usage = event.usage as TurnUsage;
                setMessages((m) => m.map((x) => (x.id === replyId ? { ...x, usage } : x)));
              }
              // What the next turn request says the page shows.
              if (event.shown) shownRef.current = event.shown as Shown;
              // The finished reply can now be saved to notes (every part of it: its Widgets are saved by the whole reply's count).
              if (event.ref) {
                const ref = event.ref as TurnRef;
                setMessages((m) => m.map((x) => (partIds.includes(x.id) && x.role === "assistant" ? { ...x, ref } : x)));
              }
            } else if (event.type === "refusal") {
              // Only the declined loop step is dropped; what earlier steps saved stays, as a reload shows it.
              replaceReply(event.text ?? "");
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
        if (correction !== null && replaces) {
          const fix = correction;
          updateReply((t) => replaceBrokenWidgets(t, fix, flagged));
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
      clearTimeout(slow);
      setWaiting(null);
      setRunning(false);
      setFixing(false);
      // Re-reads the strip and the Next on offer, since the Tutor may have finished a Teaching Step; `refreshing`
      // stays true until the page has them, so a Next chip from before the turn is never offered.
      startRefresh(() => router.refresh());
    }
  }

  // A turn cut off while the page was closed resumes as soon as the page opens; an empty Session starts its opener.
  const resumedOnOpen = useRef(false);
  useEffect(() => {
    const start: TurnBody | null =
      pending?.status === "cut_off" ? { resume: true } : opener && shown && pending === null && initial.every((l) => l.role === "item") ? { opener: true } : null;
    if (!start || resumedOnOpen.current) return;
    resumedOnOpen.current = true;
    void send(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onNew = async (message: AppendMessage) => {
    const text = message.content.map((c) => (c.type === "text" ? c.text : "")).join("").trim();
    if (!text) return;
    // The one Send carries the attached passage too; the thread shows it as its short label.
    const paste = passage?.trim();
    if (!paste) return send({ message: text }, text);
    setPassage(null);
    await send({ message: text, paste }, `${text}\n\n${pastePreview(paste)}`);
  };
  const runtime = useExternalStoreRuntime({ messages, isRunning: running, convertMessage, onNew });

  return { messages, running, refreshing, announcement, fixing, error, notice, canRetry, cutShort, waiting, passage, setPassage, send, runtime };
}
