import { currentLearnerId } from "@/auth/session";
import { getDb } from "@/db/client";
import { voyageQueryEmbedder } from "@/library/voyage";
import { anthropicTutorClient } from "@/tutor/anthropic";
import { MAX_PASTE_WORDS, PASTE_MESSAGE, wordCount } from "@/tutor/pasted";
import type { Shown } from "@/tutor/session-log";
import { runTutorTurn, type TurnInput } from "@/tutor/turn";
import type { NextName } from "@/tutor/next";
import { TEACHING_STEPS, type TeachingStep } from "@/course/navigator";

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

/** The step a Next names (or "complete" for Complete this Topic); anything else is not a Next. */
function nextOf(value: unknown): NextName | undefined {
  return value === "complete" || TEACHING_STEPS.includes(value as TeachingStep) ? (value as NextName) : undefined;
}

/**
 * Runs one Tutor turn (a message, Next, Finish this reply, or the opener the page starts for a Session with no messages), or resumes the last one, and streams its events as
 * newline-delimited JSON. A send while another turn runs gets a 409, and so does a send from a tab
 * whose Topic is no longer the Learner's current one (`stale`).
 */
export async function POST(request: Request) {
  const body = (await request.json()) as { message?: string; paste?: string; finish?: boolean; continue?: boolean; opener?: boolean; next?: unknown; resume?: boolean; shown?: unknown };
  const paste = body.paste?.trim();
  if (paste && wordCount(paste) > MAX_PASTE_WORDS) return Response.json({ error: `A paste can hold at most ${MAX_PASTE_WORDS} words; paste the part being studied.` }, { status: 400 });
  const message = body.message?.trim() || (paste ? PASTE_MESSAGE : undefined);
  const next = nextOf(body.next);
  // A tab opened before Finish this reply replaced the cut-off reply's Continue still sends `continue`: it means the same.
  const input: TurnInput | undefined = body.resume
    ? { resume: true }
    : body.opener
      ? { opener: true }
      : next
        ? { next }
        : body.finish || body.continue
          ? { finish: true }
          : message && paste
            ? { message, paste }
            : message;
  if (!input) return Response.json({ error: "Empty message" }, { status: 400 });

  const started = Date.now();
  // TURN_TIME_BUDGET_MS shortens the budget for a local cut-off check; unset, the default leaves room inside 300 s.
  const timeBudgetMs = Number(process.env.TURN_TIME_BUDGET_MS) || undefined;
  // Without a Voyage key, Library search uses keyword results only and tells the Tutor so.
  const embedQuery = process.env.VOYAGE_API_KEY ? voyageQueryEmbedder({ apiKey: process.env.VOYAGE_API_KEY }) : undefined;
  const learnerId = await currentLearnerId();
  // The Study Workspace always says what it shows; the test tools' requests may not, and are not checked.
  const shown = shownOf(body.shown);
  const turn = runTutorTurn({ db: getDb(), client: anthropicTutorClient(), learnerId, timeBudgetMs, embedQuery, shown }, input);
  const first = await turn.next();
  if (!first.done && first.value.type === "busy") return Response.json({ error: first.value.message }, { status: 409 });
  if (!first.done && first.value.type === "stale") return Response.json({ error: first.value.message, stale: true }, { status: 409 });
  if (!first.done && first.value.type === "not_allowed") return Response.json({ error: first.value.message }, { status: 409 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // If the browser has gone, keep running so every loop step is still saved; it resumes or reloads.
      const send = (event: object) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {}
      };
      try {
        if (!first.done) send(first.value);
        for await (const event of turn) send(event.type === "done" ? { ...event, elapsedMs: Date.now() - started } : event);
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
