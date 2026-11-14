import { APIError } from "openai";
import type { Message, ModelClient, StepEvent, StepRequest, StepResult, StepStream } from "./model";

/**
 * A Session heals itself (spec 2026-11-12, A2; ADR 0016). The Tutor sends each stored step back with its raw OpenAI
 * output (`replay`: reasoning items, ids, exact arguments). When the API refuses a request because of those replayed
 * items (encrypted reasoning it cannot verify, a reasoning item with nothing after it, an item id it will not take),
 * the turn does not fail: the request is sent once more with every `replay` block left out, which the API always
 * accepts (an edited step is sent that way already, ADR 0015), and the heal is recorded. A second refusal fails the
 * turn the normal way (A3). Each heal is a bug in what is sent (A1), so each one is counted.
 */

/** The kind of the `tutor_incidents` row a heal writes. */
export const REPLAY_STRIPPED = "replay_stripped_after_refusal";

/**
 * Whether an error is the API refusing replayed output items: a 400 that names encrypted content, a reasoning item
 * without its following item, a duplicate or unknown item id. Any other 400 (a bad tool schema, a too-long input) is not
 * healed this way, since sending less reasoning would not fix it.
 */
export function isReplayRefusal(error: unknown): boolean {
  if (!(error instanceof APIError) || error.status !== 400) return false;
  if (error.code === "invalid_encrypted_content") return true;
  const inner = (error.error as { message?: unknown } | undefined)?.message;
  const text = `${typeof inner === "string" ? inner : ""} ${error.message}`;
  return /encrypted content|encrypted_content|of type 'reasoning' was provided without its required following item|Duplicate item found with id|Item with id '?[a-z]+_[^\s']*'? not found|reasoning item/i.test(text);
}

/** Messages without any `replay` block: every step is sent rebuilt from its readable blocks, without reasoning. */
export function withoutReplay(messages: Message[]): Message[] {
  return messages.map((m) => (Array.isArray(m.content) && m.content.some((b) => b?.type === "replay") ? { ...m, content: m.content.filter((b) => b?.type !== "replay") } : m));
}

export type Heal = { error: unknown; at: "step" | "compact" };

/**
 * The model client of one turn, healing a replay refusal once (`onHeal` records it and makes the heal last). After a
 * heal every later request of the turn leaves `replay` blocks out too, since the history the refusal blamed is still
 * in it. A refusal arrives before any event of the step, so nothing was shown twice.
 */
export function healingClient(inner: ModelClient, onHeal: (heal: Heal) => Promise<void>): ModelClient {
  const state = { healed: false };
  return wrap(inner, state, onHeal);
}

function wrap(inner: ModelClient, state: { healed: boolean }, onHeal: (heal: Heal) => Promise<void>): ModelClient {
  const stripped = <R extends { messages: Message[] }>(request: R): R => ({ ...request, messages: withoutReplay(request.messages) });
  /** Runs `attempt` once; on a first replay refusal of the turn, records the heal and runs it again without replay. */
  async function healOnce<T>(attempt: (healed: boolean) => Promise<T>, at: Heal["at"]): Promise<T> {
    const healedBefore = state.healed;
    try {
      return await attempt(healedBefore);
    } catch (error) {
      if (healedBefore || state.healed || !isReplayRefusal(error)) throw error;
      state.healed = true;
      await onHeal({ error, at });
      return attempt(true);
    }
  }
  return {
    step(request: StepRequest, options) {
      let current: StepStream | undefined;
      const open = (healed: boolean) => (current = inner.step(healed ? stripped(request) : request, options));
      let firstRead: Promise<{ iterator: AsyncIterator<StepEvent>; first: IteratorResult<StepEvent> }> | undefined;
      // The refusal comes on the step's first read (an event, or its final message when nothing is read first).
      const start = () =>
        (firstRead ??= healOnce(async (healed) => {
          const iterator = open(healed)[Symbol.asyncIterator]();
          return { iterator, first: await iterator.next() };
        }, "step"));
      return {
        async *[Symbol.asyncIterator]() {
          const { iterator, first } = await start();
          if (first.done) return;
          yield first.value;
          for (;;) {
            const next = await iterator.next();
            if (next.done) return;
            yield next.value;
          }
        },
        async final(): Promise<StepResult> {
          if (!firstRead) return healOnce((healed) => open(healed).final(), "step");
          await firstRead;
          return current!.final();
        },
      };
    },
    compact(request, options) {
      return healOnce((healed) => inner.compact(healed ? stripped(request) : request, options), "compact");
    },
    ...(inner.forRun && { forRun: () => wrap(inner.forRun!(), state, onHeal) }),
  };
}
