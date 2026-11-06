import { z } from "zod";
import { TEACHING_STEPS } from "@/course/navigator";
import { PASTE_MESSAGE } from "./pasted";
import type { TurnInput } from "./turn";

/**
 * The /api/turn request body: one kind of turn, with what the page shows and its Widgets' state beside it. The
 * one list of turn kinds on the wire: the route parses with it and the browser's `TurnBody` is its type, so a new
 * kind is one entry here plus its handler in the Tutor Turn. A body naming two kinds matches none and is refused.
 */

/** What every request may carry beside its kind; the route reads both on their own. */
const beside = { shown: z.unknown().optional(), widgets: z.unknown().optional() };
const kind = <T extends z.ZodRawShape>(shape: T) => z.strictObject({ ...shape, ...beside });

const kinds = [
  // A message, with an optional pasted passage (a paste alone is sent as PASTE_MESSAGE).
  kind({ message: z.string().optional(), paste: z.string().optional() }),
  // Finish this reply, offered under a reply cut off at its length limit.
  kind({ finish: z.literal(true) }),
  // The opener the page starts for a Session with no messages.
  kind({ opener: z.literal(true) }),
  // The Learner's Next, naming the step on its chip, or "complete" for Complete this Topic.
  kind({ next: z.enum([...TEACHING_STEPS, "complete"]) }),
  // Tell the Tutor what I found, naming the Widget's key.
  kind({ widgetReport: z.string().refine((s) => s.trim().length > 0) }),
  // The quiz follow-up the page starts after a missed quiz.
  kind({ quizFollowUp: z.literal(true) }),
  // The Quick-try follow-up the page starts after a try marked wrong with no Known mistake, or after Your turn finished.
  kind({ quickTryFollowUp: z.literal(true) }),
  // The drill the page starts when the Learner opens a Topic whose parked Skill is due (spec #229, "Parking").
  kind({ drill: z.literal(true) }),
  // A resume of the last turn (Retry, or after a cut-off).
  // A press of one of the Choices under the latest reply, by its index (D3a): the server posts its stored words.
  kind({ choice: z.number().int().min(0).max(2) }),
  kind({ resume: z.literal(true) }),
  // Stop: the Learner's running turn ends at its next check (within about half a second) and keeps what it wrote.
  // The route answers it on its own, before any turn runs; it never starts a turn.
  kind({ stop: z.literal(true), turn: z.number().int().positive().optional() }),
] as const;

/** Every kind, and the `continue` a tab opened before Finish this reply replaced Continue still sends: it means Finish. */
export const turnBody = z.union([...kinds, kind({ continue: z.literal(true) })]);

type KindOnly<T> = T extends unknown ? Omit<T, "shown" | "widgets"> : never;
/** What the browser sends as a turn's kind (it adds what it shows and its Widgets' state). */
export type TurnBody = KindOnly<z.input<(typeof kinds)[number]>>;

/** The Tutor Turn's input for a parsed body; undefined for an empty message. */
export function turnInputOf(body: z.output<typeof turnBody>): TurnInput | undefined {
  // A stop is not a turn: the route handles it before asking for a turn's input.
  if ("stop" in body) return undefined;
  if ("resume" in body) return { resume: true };
  if ("opener" in body) return { opener: true };
  if ("next" in body) return { next: body.next };
  if ("widgetReport" in body) return { widgetReport: body.widgetReport };
  if ("quizFollowUp" in body) return { quizFollowUp: true };
  if ("quickTryFollowUp" in body) return { quickTryFollowUp: true };
  if ("drill" in body) return { drill: true };
  if ("choice" in body) return { choice: body.choice };
  if ("finish" in body || "continue" in body) return { finish: true };
  const paste = body.paste?.trim();
  const message = body.message?.trim() || (paste ? PASTE_MESSAGE : undefined);
  if (!message) return undefined;
  return paste ? { message, paste } : message;
}
