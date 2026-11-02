import { getDb } from "@/db/client";
import { anthropicTutorClient } from "@/tutor/anthropic";
import { runTutorTurn, type TurnInput } from "@/tutor/turn";

export const runtime = "nodejs";
// Vercel Hobby's ceiling for one function, streaming included. The turn stops itself
// before this (TIME_BUDGET_MS) and the browser resumes it in a new function call.
export const maxDuration = 300;

/**
 * Runs one Tutor turn, or resumes the last one, and streams its events as
 * newline-delimited JSON. A send while another turn runs gets a 409.
 */
export async function POST(request: Request) {
  const body = (await request.json()) as { message?: string; continue?: boolean; resume?: boolean };
  const input: TurnInput | undefined = body.resume ? { resume: true } : body.continue ? { continue: true } : body.message?.trim() || undefined;
  if (!input) return Response.json({ error: "Empty message" }, { status: 400 });

  const started = Date.now();
  // TURN_TIME_BUDGET_MS shortens the budget for a local cut-off check; unset, the default leaves room inside 300 s.
  const timeBudgetMs = Number(process.env.TURN_TIME_BUDGET_MS) || undefined;
  const turn = runTutorTurn({ db: getDb(), client: anthropicTutorClient(), timeBudgetMs }, input);
  const first = await turn.next();
  if (!first.done && first.value.type === "busy") return Response.json({ error: first.value.message }, { status: 409 });

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
