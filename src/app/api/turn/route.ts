import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { voyageQueryEmbedder } from "@/library/voyage";
import { anthropicTutorClient } from "@/tutor/anthropic";
import { MAX_PASTE_WORDS, wordCount } from "@/tutor/pasted";
import type { Shown } from "@/tutor/session-log";
import { runTutorTurn, type StreamEvent, type TurnEvent } from "@/tutor/turn";
import { turnBody, turnInputOf } from "@/tutor/turn-body";
import { cleanSentWidgets } from "@/tutor/widget-context";

export const runtime = "nodejs";
// Vercel Hobby's ceiling for one function, streaming included. The turn stops itself
// before this (TIME_BUDGET_MS) and the browser resumes it in a new function call.
export const maxDuration = 300;

/** What the page says it shows: a Session id, or a Topic id (null for the every-Topic-passed Session) before its first turn. */
function shownOf(value: unknown): Shown | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const v = value as Record<string, unknown>;
  if (Number.isInteger(v.sessionId)) return { sessionId: v.sessionId as number };
  if ("topicId" in v && (typeof v.topicId === "string" || v.topicId === null)) return { topicId: v.topicId };
  return undefined;
}

/**
 * Runs one Tutor turn (a message, Next, a widget report, Finish this reply, the opener the page starts for a Session
 * with no messages, or the quiz follow-up it starts after a missed quiz), or resumes the last one, and streams its events as
 * newline-delimited JSON. A send while another turn runs gets a 409, and so does a send from a tab
 * whose Topic is no longer the Learner's current one (`stale`).
 */
export async function POST(request: Request) {
  // One kind of turn per request (turn-body.ts): a body naming none, or two, is refused.
  const parsed = turnBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send one kind of turn: a message, finish, opener, next, widgetReport, quizFollowUp or resume." }, { status: 400 });
  const body = parsed.data;
  const paste = "paste" in body ? body.paste?.trim() : undefined;
  if (paste && wordCount(paste) > MAX_PASTE_WORDS) return Response.json({ error: `A paste can hold at most ${MAX_PASTE_WORDS} words; paste the part being studied.` }, { status: 400 });
  const input = turnInputOf(body);
  if (!input) return Response.json({ error: "Empty message" }, { status: 400 });

  const started = Date.now();
  // TURN_TIME_BUDGET_MS shortens the budget for a local cut-off check; unset, the default leaves room inside 300 s.
  const timeBudgetMs = Number(process.env.TURN_TIME_BUDGET_MS) || undefined;
  // Without a Voyage key, Library search uses keyword results only and tells the Tutor so.
  const embedQuery = process.env.VOYAGE_API_KEY ? voyageQueryEmbedder({ apiKey: process.env.VOYAGE_API_KEY }) : undefined;
  const learnerId = await currentLearnerId();
  // The Study Workspace always says what it shows; the test tools' requests may not, and are not checked.
  const shown = shownOf(body.shown);
  // What the page's open Widgets show now (slider values and ticks by Widget key), cleaned: the Tutor is told of them.
  const widgets = cleanSentWidgets(body.widgets);
  const turn = runTutorTurn({ db: getDb(), client: anthropicTutorClient(), learnerId, timeBudgetMs, embedQuery, shown, widgets }, input);
  const first = await turn.next();
  if (!first.done && first.value.type === "busy") return Response.json({ error: first.value.message }, { status: 409 });
  if (!first.done && first.value.type === "stale") return Response.json({ error: first.value.message, stale: true }, { status: 409 });
  if (!first.done && first.value.type === "not_allowed") return Response.json({ error: first.value.message }, { status: 409 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // If the browser has gone, keep running so every loop step is still saved; it resumes or reloads.
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {}
      };
      // "done" says how long the turn ran.
      const stamped = (event: TurnEvent): StreamEvent => (event.type === "done" ? { ...event, elapsedMs: Date.now() - started } : event);
      try {
        if (!first.done) send(stamped(first.value));
        for await (const event of turn) send(stamped(event));
      } catch (error) {
        console.error("Tutor turn failed", error);
        send({ type: "error", kind: "error", message: error instanceof Error ? error.message : "The turn failed." });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
