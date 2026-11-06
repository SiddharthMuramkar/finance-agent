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
  /** E5's stage scripts: Concept replies like concept-reply-widget, each showing a differently titled Widget, so a Session collects one filmstrip thumbnail per reply. */
  "stage-reply-2": {
    step: "concept",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_stage2", name: "show_widget", input: { recipe: "rate_move", params: { title: "A deposit rate from 6% to 6.5%", inputs: { old: 6, new: 6.5, mode: "show" }, refs: {}, facts: {} } } }] },
      {
        content: [
          text(
            "Here is the same move on a deposit rate. It climbs from 6% to 6.5%: half a percentage point, which traders call 50 basis points. " +
              "The panel draws the move on one line, so the two names sit side by side.\n\n" +
              "Which name makes the move sound bigger?",
          ),
        ],
      },
    ],
  },
  "stage-reply-3": {
    step: "concept",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_stage3", name: "show_widget", input: { recipe: "rate_move", params: { title: "A loan rate from 9% to 8.75%", inputs: { old: 9, new: 8.75, mode: "show" }, refs: {}, facts: {} } } }] },
      {
        content: [
          text(
            "Now a move the other way. A loan rate falls from 9% to 8.75%: a quarter of a point down, or 25 basis points in trader talk. " +
              "The arrow on the panel points down this time.\n\n" +
              "Which word would a bank use in a headline?",
          ),
        ],
      },
    ],
  },
  "stage-reply-4": {
    step: "concept",
    replies: [
      { content: [{ type: "tool_use", id: "toolu_e2e_stage4", name: "show_widget", input: { recipe: "rate_move", params: { title: "A bond yield from 7% to 7.1%", inputs: { old: 7, new: 7.1, mode: "show" }, refs: {}, facts: {} } } }] },
      {
        content: [
          text(
            "One more, smaller still. A bond yield edges from 7% to 7.1%: a tenth of a point, just 10 basis points. " +
              "Small moves like this are exactly why the smaller unit exists.\n\n" +
              "Which unit would you reach for here?",
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
  /** E4a: a Concept reply about percent change and its base, no Widget: code adds the Lingo card for "percent change". */
  "concept-percent-change": {
    step: "concept",
    replies: [
      {
        content: [
          text(
            "A percent change compares the move with where the rate started. Traders call that starting rate the base. " +
              "A small move on a low base is a big percent change, which is why headlines and traders can sound so different.\n\n" +
              "Which rate is the base when a rate moves from its old level to a new one?",
          ),
        ],
      },
    ],
  },
  /** E4a: a Your turn reply that points at the open Quick try and names the base, no Widget. */
  "your-turn-reply": {
    step: "your_turn",
    replies: [
      {
        content: [
          text(
            "Before you tap, find the base: the rate the move started from. Everything in a percent change is measured against it.\n\n" +
              "Have a go at the Quick try below.",
          ),
        ],
      },
    ],
  },
  /** E4a: a Reveal reply that tells what the Fed did and how traders said it, no Widget. */
  "reveal-reply": {
    step: "reveal",
    replies: [
      {
        content: [
          text(
            "On 4 February 1994 the Fed tightened, and the federal funds rate went from about 3% to 3.25%. " +
              "No number was announced. Traders still read the move in basis points straight away, and bond prices fell over the following weeks " +
              "as borrowed money rushed out of long bonds. That spring became known as the great bond massacre.\n\n" +
              "Why do you think such a small move shook the bond market so hard?",
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
  var __faE2eTurnCount: number | undefined;
}

/**
 * A fresh copy of a script's replies for one Tutor Turn, with every tool_use id made unique to this play:
 * tool calls are recorded once per tool-call id across the whole database (`once` in src/tutor/tools.ts), so
 * replaying a script's fixed ids in a later Session would store no second Widget.
 */
export function freshScriptReplies(name: E2eScriptName): ScriptedReply[] {
  const play = (globalThis.__faE2eTurnCount = (globalThis.__faE2eTurnCount ?? 0) + 1);
  const replies = structuredClone(E2E_SCRIPTS[name].replies) as ScriptedReply[];
  for (const reply of replies) {
    if (!("content" in reply)) continue;
    for (const block of reply.content) {
      if (block.type === "tool_use" && typeof block.id === "string") block.id = `${block.id}-p${play}`;
    }
  }
  return replies;
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
        toolRunner: (params, options) => scriptedClient(freshScriptReplies(currentE2eScript())).client.beta.messages.toolRunner(params, options),
      },
    },
  };
}

/** The compose client of the test bed: it always refuses, so no free-form Widget is ever composed. */
export function e2eComposeClient(): ComposeClient {
  return { messages: { create: async () => ({ content: [], stop_reason: "refusal" }) } };
}
