import { getDb } from "@/db/client";
import { anthropicTutorClient } from "@/tutor/anthropic";
import { runTutorTurn, type TurnInput } from "@/tutor/turn";

export const runtime = "nodejs";
// Vercel Hobby's ceiling for one function, streaming included.
export const maxDuration = 300;

/** Runs one Tutor turn and streams its events as newline-delimited JSON. */
export async function POST(request: Request) {
  const body = (await request.json()) as { message?: string; continue?: boolean };
  const input: TurnInput | undefined = body.continue ? { continue: true } : body.message?.trim() || undefined;
  if (!input) return Response.json({ error: "Empty message" }, { status: 400 });

  const client = anthropicTutorClient();
  const started = Date.now();
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        for await (const event of runTutorTurn({ db: getDb(), client }, input)) {
          send(event.type === "done" ? { ...event, elapsedMs: Date.now() - started } : event);
        }
      } catch (error) {
        console.error("Tutor turn failed", error);
        send({ type: "error", message: error instanceof Error ? error.message : "The turn failed." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
