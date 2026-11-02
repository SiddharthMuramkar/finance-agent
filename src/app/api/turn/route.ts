import { getDb } from "@/db/client";
import { anthropicTutorClient } from "@/tutor/anthropic";
import { runTutorTurn } from "@/tutor/turn";

export const runtime = "nodejs";
// Vercel Hobby's ceiling for one function, streaming included.
export const maxDuration = 300;

/** Runs one Tutor turn and streams its events as newline-delimited JSON. */
export async function POST(request: Request) {
  const { message } = (await request.json()) as { message?: string };
  if (!message?.trim()) return Response.json({ error: "Empty message" }, { status: 400 });

  const client = anthropicTutorClient();
  const started = Date.now();
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        for await (const event of runTutorTurn({ db: getDb(), client }, message.trim())) {
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
  return new Response(body, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
