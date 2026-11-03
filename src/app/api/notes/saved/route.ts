import { z } from "zod";
import { currentLearnerId } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { removeSaved, saveToNotes } from "@/learner/saved";

export const runtime = "nodejs";

const id = z.number().int();
const save = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("reply"), sessionId: id, turnSeq: id }),
  // Settings are only numbers by name; the server checks them against the Widget's own code. The Widget's code is never sent.
  z.object({ kind: z.literal("widget"), sessionId: id.optional(), turnSeq: id.optional(), widgetIndex: id, settings: z.record(z.string(), z.number()).optional(), widgetKey: z.string().max(200).optional() }),
]);
const remove = z.object({ id });

/** Saves a Tutor reply or a Widget to the current Learner's Topic Note; another Learner's Session answers 404. Behind the passcode (the proxy); no model call. */
export async function POST(request: Request) {
  const parsed = save.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Say what to save." }, { status: 400 });
  const result = await saveToNotes(getDb(), loadCourseMap(), parsed.data, new Date(), await currentLearnerId());
  return result.ok ? Response.json({ id: result.id, topicId: result.topicId }) : Response.json({ error: result.reason }, { status: result.status });
}

/** Takes one of the current Learner's saved replies or Widgets off its Topic Note; another Learner's answers 404. */
export async function DELETE(request: Request) {
  const parsed = remove.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send the item to remove." }, { status: 400 });
  return (await removeSaved(getDb(), parsed.data.id, await currentLearnerId())) ? Response.json({ ok: true }) : Response.json({ error: "That item does not exist." }, { status: 404 });
}
