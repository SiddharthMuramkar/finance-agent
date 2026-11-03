import { z } from "zod";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { addLine, editLine, removeLine } from "@/learner/notes";

export const runtime = "nodejs";

const add = z.object({ topicId: z.string(), text: z.string() });
const edit = z.object({ id: z.number().int(), text: z.string() });
const remove = z.object({ id: z.number().int() });

const bad = (message: string) => Response.json({ error: message }, { status: 400 });

/** Adds one of the Learner's own lines to a Topic Note. Behind the passcode (the proxy); no model call. */
export async function POST(request: Request) {
  const parsed = add.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bad("Send a Topic and some text.");
  const result = await addLine(getDb(), loadCourseMap(), parsed.data.topicId, parsed.data.text);
  return result.ok ? Response.json(result.line) : bad(result.reason);
}

/** Changes the words of one of the Learner's own lines. */
export async function PATCH(request: Request) {
  const parsed = edit.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bad("Send a line and its new text.");
  const result = await editLine(getDb(), parsed.data.id, parsed.data.text);
  return result.ok ? Response.json(result.line) : Response.json({ error: result.reason }, { status: result.status });
}

/** Deletes one of the Learner's own lines. */
export async function DELETE(request: Request) {
  const parsed = remove.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return bad("Send the line to delete.");
  return (await removeLine(getDb(), parsed.data.id)) ? Response.json({ ok: true }) : Response.json({ error: "That line does not exist." }, { status: 404 });
}
