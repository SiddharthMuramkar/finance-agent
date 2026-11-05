import { scriptedClient, type ScriptedReply } from "@/test/scripted-client";
import type { ComposeClient } from "@/tutor/compose";
import type { ReplyDraft, ReplyWidget, StepKind } from "@/tutor/reply-checks";
import type { TutorClient } from "@/tutor/turn";

/**
 * The browser test bed's scripted Tutor (spec 2026-11-05, T-00). With `E2E_TUTOR=scripted` the app's Tutor client
 * plays one of these named scripts instead of calling Anthropic, so a browser test sees a real Tutor Turn (tools,
 * reply checks, storage) with a known reply and no key. The test picks the script with `POST /api/dev-e2e {script}`;
 * the choice is kept on globalThis, since the route and the turn route are separate module graphs in `next dev`.
 * Every script passes the reply checks for its step (src/dev/e2e-tutor.test.ts), or the gate would retry.
 * A ticket that needs another script adds it here.
 */

const text = (t: string) => ({ type: "text", text: t });

/** The Topic every fixture state opens (src/app/api/dev-e2e/route.ts). Its running example is a savings rate from 4% to 5%. */
const RATE_MOVE_PARAMS = { title: "A savings rate from 4% to 5%", inputs: { old: 4, new: 5, mode: "show" }, refs: {}, facts: {} };

export const E2E_SCRIPTS = {
  /** About 90 words of story at the Story step, one ask on the last line, no Widget. */
  "story-reply": {
    step: "story",
    replies: [
      {
        content: [
          text(
            "In February 1994 the Federal Reserve lifted its key rate from 3 to 3.25 percent. On paper it was a small step. " +
              "Bond traders were stunned anyway, because rates had sat still for more than a year. " +
              "Newspapers called it a quarter-point move. Traders on the phone called it 25 basis points. " +
              "Some readers heard that borrowing had become dearer by a twelfth and wondered what had happened. " +
              "All of them were describing the very same move, only in different words. That year is still remembered as the great bond massacre.\n\n" +
              "Which of those descriptions sounds biggest to you?",
          ),
        ],
      },
    ],
  },
  /** A Concept reply under 80 words and one ready-made Widget (the rate_move recipe) shown with show_widget. */
  "concept-reply-widget": {
    step: "concept",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_show", name: "show_widget", input: { recipe: "rate_move", params: RATE_MOVE_PARAMS } }] },
      {
        content: [
          text(
            "A percentage point is the plain gap between two rates. A savings rate that goes from 4% to 5% is up one point. " +
              "A basis point is one hundredth of a point, so the same move is 100 basis points. The panel shows the move both ways.\n\n" +
              "Which name would a bond trader use for it?",
          ),
        ],
      },
    ],
  },
  /** A Concept reply with no Widget: the case E4a must fix. */
  "plain-reply": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "A basis point is one hundredth of a percentage point. Traders like it because small moves in rates matter a lot on big loans, " +
              "and a quarter of a point is clumsy to say out loud.\n\n" +
              "Which word would you use for a tiny rate move?",
          ),
        ],
      },
    ],
  },
  /** A reply beside an open quiz: it quotes none of the quiz's numbers (it has no numbers at all). */
  "quiz-open": {
    step: "check",
    replies: [
      {
        content: [
          text(
            "Take your time with the questions in the Check tab. Each one asks you to name a move the way a trader would. " +
              "Read where the rate started and where it ended before you pick.\n\n" +
              "Which question would you like to start with?",
          ),
        ],
      },
    ],
  },
} satisfies Record<string, { step: StepKind; replies: ScriptedReply[] }>;

export type E2eScriptName = keyof typeof E2E_SCRIPTS;

export const DEFAULT_E2E_SCRIPT: E2eScriptName = "plain-reply";

export function isE2eScript(name: unknown): name is E2eScriptName {
  return typeof name === "string" && Object.hasOwn(E2E_SCRIPTS, name);
}

/** The finished reply a script gives, as the reply checks read it: its text and the Widgets its tool calls show. */
export function draftOf(name: E2eScriptName): ReplyDraft {
  const blocks = (E2E_SCRIPTS[name].replies as ScriptedReply[]).flatMap((r) => ("content" in r ? r.content : []));
  const textOf = blocks.filter((b) => b.type === "text").map((b) => String(b.text));
  const widgets: ReplyWidget[] = blocks
    .filter((b) => b.type === "tool_use" && b.name === "show_widget")
    .map((b) => {
      const input = b.input as { recipe: string; params?: Record<string, unknown> };
      return { kind: "recipe", id: input.recipe, params: input.params };
    });
  return { text: textOf.join("\n\n"), widgets };
}

declare global {
  var __faE2eScript: E2eScriptName | undefined;
}

/** Chooses the script the next Tutor Turns play. */
export function chooseE2eScript(name: E2eScriptName): void {
  globalThis.__faE2eScript = name;
}

export function currentE2eScript(): E2eScriptName {
  return globalThis.__faE2eScript ?? DEFAULT_E2E_SCRIPT;
}

/** The Tutor client of the test bed: each Tutor Turn (and each gate retry) plays a fresh copy of the chosen script. */
export function e2eTutorClient(): TutorClient {
  return {
    beta: {
      messages: {
        toolRunner: (params, options) => scriptedClient(structuredClone(E2E_SCRIPTS[currentE2eScript()].replies) as ScriptedReply[]).client.beta.messages.toolRunner(params, options),
      },
    },
  };
}

/** The compose client of the test bed: it always refuses, so no free-form Widget is ever composed. */
export function e2eComposeClient(): ComposeClient {
  return { messages: { create: async () => ({ content: [], stop_reason: "refusal" }) } };
}
