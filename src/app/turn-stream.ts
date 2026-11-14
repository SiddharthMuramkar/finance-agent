"use client";

import { useExternalStoreRuntime, type AppendMessage } from "@assistant-ui/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { SOMETHING_WENT_WRONG, type ProviderDetails } from "@/tutor/failure-words";
import { REPLY_CHOICES } from "@/tutor/session-item-kinds";
import { withoutOpenWidget } from "@/tutor/open-widget";
import type { Shown } from "@/tutor/session-log";
import type { StreamEvent } from "@/tutor/turn";
import type { TurnBody } from "@/tutor/turn-body";
import type { SessionItemData } from "./session-item-view";
import { track } from "./analytics";
import { addText, finishReply, placeItem, replayReply, replyCursor, startReply, stopReply, takeBack, type Placed } from "./reply-lines";
import { convertMessage, withNextStepDividers, type Line, type ThreadLine } from "./thread";
import type { WidgetStore } from "./widget-states";

/** How an attached passage shows in the thread: a short label, as the saved transcript shows it. */
export function pastePreview(paste: string): string {
  const words = paste.split(/\s+/).filter(Boolean);
  return `(Pasted passage, ${words.length} words: "${words.slice(0, 6).join(" ")} …")`;
}

/**
 * Turn streaming for the Study Workspace: the conversation on screen and the phase of the turn being run. It sends a
 * turn to /api/turn, one at a time, streams the reply in, resumes cut-off turns on its own, and gives assistant-ui its
 * external-store runtime. It draws nothing: the left column shows its phase, and the Widget host reads its messages.
 * Where the reply's lines go is worked out in reply-lines.ts.
 */

/**
 * The latest turn's saved status, as the page found it. `provider` is what the provider said about a failure, there only
 * for a Learner with Show developer details on (A3).
 */
export type PendingTurn = { status: "running" | "cut_off" | "failed"; error: string | null; provider?: ProviderDetails } | null;

/** How long "Tutor is writing…" shows before it changes to "Still working on it…". */
export const SLOW_AFTER_MS = 8000;
/** What the writing indicator says while a turn waits for its first words: "writing", then "slow" after 8 seconds. */
export type Waiting = "writing" | "slow" | null;

/**
 * The turn's own words under the thread: a notice ("A turn is in progress…", a refusal) and an error. `provider` is what
 * the provider said about the failure, which the server sends only with Show developer details on (A3).
 */
type Said = { notice: string | null; error: string | null; provider?: ProviderDetails };

/**
 * Where the turn stream is, for the left column:
 * - `opened`: no turn has run on this page yet. What the page found: a failed turn's error with Retry (its error may be
 *   null), or a turn running elsewhere.
 * - `running`: a turn runs. `waiting` and `progress` are the writing indicator's words, `stopping` is true once Stop is
 *   pressed, and a notice or error can show meanwhile (a busy wait, a save that failed).
 * - `ended`: the last turn ended, keeping its notice and error. `retry`: it failed, and Retry is offered. `cutShort`:
 *   the reply hit its length limit, and Finish this reply is offered.
 */
export type TurnPhase =
  | ({ kind: "opened"; retry: boolean } & Said)
  | ({ kind: "running"; waiting: Waiting; progress: string | null; stopping: boolean } & Said)
  | ({ kind: "ended"; retry: boolean; cutShort: boolean } & Said);

type Running = Extract<TurnPhase, { kind: "running" }>;

/** The phase a page opens in, from the latest turn's saved status. */
export function openingPhase(pending: PendingTurn): TurnPhase {
  return {
    kind: "opened",
    notice: pending?.status === "running" ? "A turn is in progress, perhaps on another device." : null,
    error: pending?.status === "failed" ? pending.error : null,
    ...(pending?.status === "failed" && pending.provider && { provider: pending.provider }),
    retry: pending?.status === "failed",
  };
}

/**
 * The one short status a screen reader hears for the turn (WCAG 4.1.3), never the streaming text itself: "Tutor is
 * replying" while it runs, then its problem or "Reply ready". Nothing before the page's first turn.
 */
export function spokenOf(phase: TurnPhase): string {
  if (phase.kind === "running") return "Tutor is replying";
  return phase.kind === "ended" ? (phase.error ?? "Reply ready") : "";
}

/** How many cut-offs in a row the browser resumes on its own, and how long it waits for a turn running elsewhere. */
const MAX_RESUMES = 10;
const BUSY_WAIT_MS = 3000;
const MAX_BUSY_WAITS = 60;

/** How long Stop waits before asking again when the server had no running turn yet (the Stop came before the turn was saved), and how many times it asks. */
const STOP_RETRY_MS = 400;
const MAX_STOP_TRIES = 4;

/**
 * Numbers the lines every page in this tab draws, so no two share an id: not two sends in the same millisecond, and not
 * a page opened again, whose Widgets widget-panel.tsx would otherwise time from the last visit's (it keeps when each
 * Widget key began drawing for as long as the tab is open).
 */
let lineCount = 0;

export { withoutOpenWidget };

/** What the Study Workspace gets from the turn stream. */
export type TurnStream = {
  /** The conversation on screen. */
  messages: ThreadLine[];
  phase: TurnPhase;
  /** True until the page has re-read the Learner's place after a turn (the strip, the Next on offer). */
  refreshing: boolean;
  /** The passage attached to the next message: null while the Attach a passage box is closed. */
  passage: string | null;
  setPassage: (passage: string | null) => void;
  /** Starts a turn the Learner asked for (a message, a Choice, a Next, Finish this reply, a widget report). Does nothing while a turn runs. */
  send: (body: TurnBody, userText?: string) => Promise<void>;
  /** Starts a turn code asks for (a drill, a quiz follow-up) now, or once a running turn ends with no error and no cut-short reply. */
  sendWhenIdle: (body: TurnBody) => void;
  /** Starts a turn code asks for (a Quick-try follow-up) now, or never: while a turn runs, it is dropped. */
  sendIfIdle: (body: TurnBody) => void;
  /** Retry: resumes the last turn; while one runs (a stalled Widget), lets go of its stream and resumes it in place. */
  retry: () => void;
  stop: () => void;
  /** Draws a Session item stored outside a turn (a quiz's result card) at the end of the conversation, as a reload would. */
  appendItem: (item: SessionItemData) => void;
  runtime: ReturnType<typeof useExternalStoreRuntime>;
};

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
  widgets,
}: {
  initial: Line[];
  pending: PendingTurn;
  onTurnStart: () => void;
  shown?: Shown;
  opener?: boolean;
  /**
   * The page's Widget state: every turn request carries what its Widgets show now (`all`, slider values and ticks by
   * Widget key) for the Tutor, and values the Tutor set (a widget_state event) are pushed into it.
   */
  widgets?: Pick<WidgetStore, "all" | "push">;
}): TurnStream {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const shownRef = useRef(shown);
  // An old stored "Continue." draws as a "→ next step" divider, never as a Learner bubble.
  const [messages, setMessages] = useState<ThreadLine[]>(() => withNextStepDividers(initial).map((l, i) => ({ ...l, id: `saved-${i}` })));
  const [phase, setPhase] = useState<TurnPhase>(() => openingPhase(pending));
  /** Changes the running phase; once the turn has ended, it changes nothing. A change to the same values keeps the phase as it was. */
  const update = (change: (p: Running) => Partial<Running>) =>
    setPhase((p) => {
      if (p.kind !== "running") return p;
      const next = { ...p, ...change(p) };
      return (Object.keys(next) as (keyof Running)[]).every((k) => next[k] === p[k]) ? p : next;
    });
  // Whether a turn runs, read when a send starts: render state lags behind a send started in the same commit.
  const runningRef = useRef(false);
  // Which send is running, and the id of the turn the server says holds the lock: Stop is tied to them, so a late Stop never stops the next turn.
  const runIdRef = useRef(0);
  const turnIdRef = useRef<number | null>(null);
  // Lets go of the running send's stream (Retry on a stalled Widget); null while no stream is open.
  const dropStream = useRef<(() => void) | null>(null);
  // The one turn waiting to start when the running one ends (sendWhenIdle).
  const waitingTurn = useRef<TurnBody | null>(null);
  const [passage, setPassage] = useState<string | null>(null);

  /**
   * Sends a message, Finish this reply, a Next, the opener or a resume, and streams the reply. When the stream ends
   * without "done" (the turn was cut off by the time limit or the connection dropped),
   * it resumes on its own from the last saved loop step; the saved text replaces what
   * was on screen. One turn at a time: while one runs, it does nothing.
   */
  async function send(body: TurnBody, userText?: string) {
    // The server answers a second turn with a 409, and two sends would stream into the same thread at once.
    if (runningRef.current) return;
    runningRef.current = true;
    runIdRef.current += 1;
    turnIdRef.current = null;
    setPhase({ kind: "running", waiting: "writing", progress: null, stopping: false, notice: null, error: null });
    // Whether the turn showed an error: a turn waiting in the slot then waits on, so it never hides that error.
    let errored = false;
    const fail = (message: string) => {
      errored = true;
      update(() => ({ error: message }));
    };
    // What the turn offers once it ends: Retry after a failure, Finish this reply after a cut-short reply.
    let offerRetry = false;
    let cutShort = false;
    // A slow turn never looks frozen: after 8 seconds with no words, the indicator says so.
    const turnStart = performance.now();
    let firstText = true;
    const slow = setTimeout(() => update((p) => ({ waiting: p.waiting === "writing" ? "slow" : p.waiting })), SLOW_AFTER_MS);
    onTurnStart();
    const n = ++lineCount;
    const userId = `u-${n}`;
    // Where the reply has got to: a Session item (a step divider) arriving mid-reply starts a new part after it.
    let reply = replyCursor(`a-${n}`);
    const place = (placed: Placed) => {
      reply = placed.cursor;
      setMessages(placed.update);
    };
    setMessages((m) => startReply(m, reply.first, { ...(userText !== undefined && { user: { id: userId, text: userText } }), resume: "resume" in body }));
    let request = body;
    let resumes = 0;
    let busyWaits = 0;
    // The busy notice a resume shows while it waits for the turn running elsewhere; it goes once that turn has ended.
    let busyNotice: string | null = null;
    try {
      for (;;) {
        const res = await fetch("/api/turn", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...request, ...(shownRef.current && { shown: shownRef.current }), ...(widgets && { widgets: widgets.all() }) }),
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
            setMessages(takeBack(reply, userId));
            fail(busy);
            return;
          }
          // The turn is still running elsewhere (for example, the connection dropped): wait for it.
          if (++busyWaits > MAX_BUSY_WAITS) return window.location.reload();
          update(() => ({ notice: busy }));
          busyNotice = busy;
          await new Promise((r) => setTimeout(r, BUSY_WAIT_MS));
          continue;
        }
        // Answered at last: the turn it waited for has ended (Widget Retry waits for its own turn this way).
        if (busyNotice !== null) {
          const said = busyNotice;
          update((p) => (p.notice === said ? { notice: null } : {}));
          busyNotice = null;
        }
        // Never a status code or the server's own words (A3): the Learner reads one plain sentence.
        if (!res.ok || !res.body) throw new Error(SOMETHING_WENT_WRONG);
        let finished = false;
        let failed = false;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        // Retry lets go of this stream: the read below ends as at a cut-off, and the turn resumes. The server's turn runs on.
        const letGo: { closed?: Promise<void> } = {};
        dropStream.current = () => void (letGo.closed ??= reader.cancel().catch(() => {}));
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n");
          buffer = parts.pop() ?? "";
          for (const part of parts) {
            if (!part) continue;
            // The route streams the Tutor Turn's events as they are (StreamEvent), so the compiler checks each field read here.
            const event = JSON.parse(part) as StreamEvent;
            // The first words of the reply end the writing indicator.
            if ((event.type === "text" || event.type === "replay") && event.text) {
              update(() => ({ waiting: null, progress: null }));
              if (firstText) {
                firstText = false;
                track("turn_first_text", { ms: Math.round(performance.now() - turnStart) });
              }
            }
            // The Tutor updated a Widget: its sliders move in place; ticked Guided Tasks stay as they were.
            if (event.type === "widget_state") {
              widgets?.push(event.widgetKey, event.values);
              continue;
            }
            // A ping only shows the stream is alive; a progress label replaces the indicator's words.
            if (event.type === "ping") continue;
            if (event.type === "turn_started") {
              turnIdRef.current = event.turnId;
              continue;
            }
            if (event.type === "progress") {
              update(() => ({ progress: event.label }));
              continue;
            }
            if (event.type === "stopped") {
              // The Learner stopped the reply, and "done" follows. Never a resume. The held reply is dropped (ADR 0008): no text
              // was shown, so no empty reply bubble is left, only the Stopped note.
              finished = true;
              update(() => ({ waiting: null, progress: null }));
              place(stopReply(reply));
              continue;
            }
            if (event.type === "text") setMessages(addText(reply, event.text));
            else if (event.type === "replay") place(replayReply(reply, event.text));
            // The reply's Choices (D3a) end the reply rather than start a new part of it.
            else if (event.type === "item" && event.item) place(placeItem(reply, event.item, event.item.kind === REPLY_CHOICES));
            else if (event.type === "done") {
              finished = true;
              // The finished reply can now be saved to the Notebook (every part of it: its Widgets are saved by the whole reply's count).
              // A Widget code showed in this turn is the reply's too (reply-items.ts), a Next's step Widget drawn before it among them.
              setMessages(finishReply(reply, event));
              // What the next turn request says the page shows.
              if (event.shown) shownRef.current = event.shown;
            } else if (event.type === "refusal") {
              // Only the declined loop step is dropped; what earlier steps saved stays, as a reload shows it.
              place(replayReply(reply, event.text ?? ""));
              update(() => ({ notice: event.message }));
            } else if (event.type === "cut_short") cutShort = true;
            else if (event.type === "save_failed") fail(event.message);
            else if (event.type === "error") {
              failed = true;
              offerRetry = true;
              fail(event.message);
              if (event.provider) update(() => ({ provider: event.provider }));
            }
          }
        }
        dropStream.current = null;
        // A stream Retry let go of is closed before the resume asks again, so two never stream at once.
        await letGo.closed;
        if (finished || failed) return;
        // No "done": the turn was cut off, or Retry let go of a stalled stream. Resume from the last saved loop step.
        if (++resumes > MAX_RESUMES) {
          fail("The turn keeps being cut off. Press Retry to try again.");
          offerRetry = true;
          return;
        }
        request = { resume: true };
      }
    } catch {
      // A dropped connection or a broken stream: the browser's own error text is a programmer's, never shown (A3).
      fail(SOMETHING_WENT_WRONG);
      offerRetry = true;
    } finally {
      clearTimeout(slow);
      dropStream.current = null;
      runningRef.current = false;
      setPhase((p) => ({ kind: "ended", notice: p.notice, error: p.error, ...(p.provider && { provider: p.provider }), retry: offerRetry, cutShort }));
      // Re-reads the strip and the Next on offer, since the Tutor may have finished a Teaching Step; `refreshing`
      // stays true until the page has them, so a Next chip from before the turn is never offered.
      startRefresh(() => router.refresh());
      // A turn code asked for while this one ran starts now, through this render's send. After an error or a cut-short
      // reply it waits on, so the error, Retry and Finish this reply stay: it starts once a later turn ends cleanly.
      const next = waitingTurn.current;
      if (next && !errored && !cutShort) {
        waitingTurn.current = null;
        void latestSend.current(next);
      }
    }
  }

  /**
   * Starts a turn code asks for (the opener or a resume as the page opens, a drill, a quiz follow-up) now, or, while
   * another turn runs, as soon as it ends. It waits on through a turn that shows an error or a cut-short reply, so the
   * Learner's Retry or Finish this reply comes first, and starts once a later turn ends cleanly. One turn waits at most:
   * a newer one takes the slot, since it is the one the Learner has just caused (a drill that loses its place stays
   * due, and starts on the next visit).
   */
  function sendWhenIdle(body: TurnBody) {
    if (runningRef.current) waitingTurn.current = body;
    else void send(body);
  }

  /**
   * Starts a turn code asks for now, or drops it while a turn runs. For a Quick-try follow-up: the answer that asked for
   * it was marked before the running turn's reply, and once a reply follows the result the server has no answer to go
   * over (quickTryFollowUpNote), so a follow-up waiting for that turn would only be refused.
   */
  function sendIfIdle(body: TurnBody) {
    if (!runningRef.current) void send(body);
  }

  /**
   * Retry resumes the last turn. Retry on a Widget that stalled comes while its turn still runs: the running send lets
   * go of its stream and resumes the turn itself, as after a cut-off. The server's turn is not stopped (it keeps
   * saving; the resume waits for it and then draws the saved reply), and no second turn starts beside it. Before the
   * reply has begun to stream there is nothing to let go of.
   */
  function retry() {
    if (!runningRef.current) return void send({ resume: true });
    dropStream.current?.();
  }

  /**
   * Stop: a separate request that flags the running turn, which ends within about half a second and keeps what it
   * wrote. The reply's own stream is never aborted: it ends by itself with "stopped" then "done". The server answers
   * `{ stopping: false }` when it had no running turn yet (Stop pressed before the turn was saved), so ask again.
   */
  async function requestStop() {
    if (!runningRef.current || (phase.kind === "running" && phase.stopping)) return;
    update(() => ({ stopping: true }));
    // Every ask belongs to the send that was running when Stop was pressed: once another send starts, they end.
    const run = runIdRef.current;
    for (let tries = 0; tries < MAX_STOP_TRIES && runningRef.current && runIdRef.current === run; tries++) {
      try {
        const turn = turnIdRef.current;
        const res = await fetch("/api/turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(turn === null ? { stop: true } : { stop: true, turn }) });
        const answer = (await res.json()) as { stopping?: boolean };
        if (answer.stopping) return;
      } catch {
        // The reply's stream reports a real failure itself.
      }
      await new Promise((r) => setTimeout(r, STOP_RETRY_MS));
    }
    // Nothing was running to stop (or the turn ended meanwhile): the button comes back, unless another send has begun.
    if (runIdRef.current === run) update(() => ({ stopping: false }));
  }

  /**
   * Starts the turn the page opens with. The browser test bed can hold it until it lets it go (`__faE2eHoldOpener`, a
   * promise only its init script sets; e2e/reply-landed.spec.ts), as a slow CI runner does when the page hydrates after
   * it looks quiet.
   */
  function startOnOpen(start: TurnBody) {
    const held = (window as { __faE2eHoldOpener?: Promise<unknown> }).__faE2eHoldOpener;
    if (held) void held.then(() => sendWhenIdle(start));
    else sendWhenIdle(start);
  }

  // The send of the latest render, for the turn waiting in the slot: an older send's callbacks may be out of date.
  const latestSend = useRef(send);
  useEffect(() => {
    latestSend.current = send;
  });

  // A turn cut off while the page was closed resumes as soon as the page opens; an empty Session starts its opener.
  const resumedOnOpen = useRef(false);
  useEffect(() => {
    const start: TurnBody | null =
      pending?.status === "cut_off" ? { resume: true } : opener && shown && pending === null && initial.every((l) => l.role === "item") ? { opener: true } : null;
    if (!start || resumedOnOpen.current) return;
    resumedOnOpen.current = true;
    startOnOpen(start);
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
  const runtime = useExternalStoreRuntime({ messages, isRunning: phase.kind === "running", convertMessage, onNew });

  const appendItem = (item: SessionItemData) => {
    const id = `item-${++lineCount}`;
    setMessages((m) => [...m, { id, role: "item", ...item }]);
  };

  return { messages, phase, refreshing, passage, setPassage, send, sendWhenIdle, sendIfIdle, retry, stop: () => void requestStop(), appendItem, runtime };
}
