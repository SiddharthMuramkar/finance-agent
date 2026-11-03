"use client";

import { useExternalStoreRuntime, type AppendMessage } from "@assistant-ui/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { replaceBrokenWidgets } from "@/widgets/check";
import type { TurnRef } from "@/tutor/transcript";
import type { TurnUsage } from "@/tutor/usage";
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
/** What a turn request carries: a message (with an optional pasted passage), Continue, or a resume. */
export type TurnBody = { message: string; paste?: string } | { continue: true } | { resume: true };

const NOTICES: Record<string, string> = {
  updated: "The Tutor was updated, so this is a new Session, started from your saved progress.",
  refused: "A new Session started from your saved progress.",
};
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
 * go back to showing the newest Widget).
 */
export function useTurnStream({ initial, pending, onTurnStart }: { initial: Line[]; pending: PendingTurn; onTurnStart: () => void }) {
  const router = useRouter();
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
        // Which of the reply's widgets the correction replaces, as the server named them.
        let flagged: number[] | undefined;
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
            else if (event.type === "replay") updateReply(() => event.text);
            else if (event.type === "correction") {
              correction = "";
              flagged = Array.isArray(event.widgets) ? (event.widgets as number[]) : undefined;
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
    if (!text) return;
    // The one Send carries the attached passage too; the thread shows it as its short label.
    const paste = passage?.trim();
    if (!paste) return send({ message: text }, text);
    setPassage(null);
    await send({ message: text, paste }, `${text}\n\n${pastePreview(paste)}`);
  };
  const runtime = useExternalStoreRuntime({ messages, isRunning: running, convertMessage, onNew });

  return { messages, running, announcement, fixing, error, notice, canRetry, cutShort, waiting, passage, setPassage, send, runtime };
}
