import type { TutorClient, TutorRequest } from "@/tutor/turn";

type Block = Record<string, unknown> & { type: string };
export type ScriptedReply =
  | {
      content: Block[];
      stop_reason?: string;
      usage?: Record<string, unknown>;
      /** Waits this long before the reply starts, like a slow model call. */
      delayMs?: number;
      /** Waits for this promise before the reply starts. */
      hold?: Promise<unknown>;
    }
  /** The API call fails with this error. */
  | { error: Error };

export type ScriptedRequest = TutorRequest & { compaction?: boolean };

/**
 * Stands in for the Anthropic client at the Tutor Turn seam. Each loop step
 * takes the next scripted reply, streams its text as deltas and records the
 * request. Like the real Tool Runner, a reply that stops for `tool_use` runs
 * its tools, appends the reply and the tool results to `params.messages`, and
 * loops; a thrown error becomes an `is_error` tool result. Any other stop
 * reason (end_turn, max_tokens, refusal) ends the loop without running tools.
 * `compactBeforeNextTurn()` makes the runner send one compaction request after
 * the final step and replace its history with the reply, as the SDK does.
 */
export function scriptedClient(replies: ScriptedReply[]) {
  const requests: ScriptedRequest[] = [];
  const client: TutorClient = {
    beta: {
      messages: {
        toolRunner(params) {
          let compact = false;
          const record = (extra: object = {}) =>
            requests.push(structuredClone({ ...params, tools: params.tools.map(({ name }) => ({ name })), ...extra }) as never);
          const next = async () => {
            const reply = replies.shift();
            if (!reply) throw new Error("scripted client ran out of replies");
            if ("error" in reply) throw reply.error;
            if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
            if (reply.hold) await reply.hold;
            return reply;
          };
          const streamOf = (reply: Exclude<ScriptedReply, { error: Error }>, stopReason: string) => {
            const final = { content: reply.content, stop_reason: stopReason, usage: reply.usage };
            return {
              async *[Symbol.asyncIterator]() {
                // As the API streams a cited text block: its citations, then its text, then the block's end.
                for (const [index, block] of reply.content.entries()) {
                  if (block.type !== "text") continue;
                  for (const citation of (block.citations as unknown[] | undefined) ?? []) yield { type: "content_block_delta", index, delta: { type: "citations_delta", citation } };
                  yield { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } };
                  yield { type: "content_block_stop", index };
                }
              },
              finalMessage: async () => final,
            } as never;
          };
          return {
            params,
            compactBeforeNextTurn() {
              compact = true;
            },
            async *[Symbol.asyncIterator]() {
              for (;;) {
                assertSystemPlacement(params.messages);
                assertToolCallsAnswered(params.messages);
                record();
                const reply = await next();
                const uses = reply.content.filter((b) => b.type === "tool_use");
                const stopReason = reply.stop_reason ?? (uses.length ? "tool_use" : "end_turn");
                yield streamOf(reply, stopReason);
                if (stopReason !== "tool_use") {
                  if (compact) {
                    params.messages.push({ role: "assistant", content: reply.content as never });
                    record({ compaction: true });
                    const summary = await next();
                    yield streamOf(summary, summary.stop_reason ?? "compaction");
                    if (summary.content.some((b) => b.type === "compaction")) {
                      params.messages.splice(0, params.messages.length, { role: "assistant", content: summary.content as never });
                    }
                  }
                  return;
                }
                const results = [];
                for (const use of uses) {
                  const tool = params.tools.find((t) => "name" in t && t.name === use.name)!;
                  try {
                    const content = await tool.run(tool.parse(use.input), { toolUse: use, toolUseBlock: use } as never);
                    results.push({ type: "tool_result", tool_use_id: use.id, content });
                  } catch (e) {
                    results.push({ type: "tool_result", tool_use_id: use.id, content: `Error: ${(e as Error).message}`, is_error: true });
                  }
                }
                params.messages.push({ role: "assistant", content: reply.content as never });
                params.messages.push({ role: "user", content: results as never });
              }
            },
          } as never;
        },
      },
    },
  };
  return { client, requests };
}

/**
 * Mirrors the live API's rule, found on 2026-11-02: a `system` message is rejected with a 400
 * at messages.0, and anywhere it doesn't directly follow a `user` message.
 */
function assertSystemPlacement(messages: { role: string }[]) {
  messages.forEach((m, i) => {
    if (m.role === "system" && messages[i - 1]?.role !== "user") {
      throw new Error(`400 invalid_request_error: messages.${i}: role 'system' must follow a 'user' message`);
    }
  });
}

/** Mirrors the API's 400 for a tool_use block without a tool_result in the next message. */
function assertToolCallsAnswered(messages: { role: string; content?: unknown }[]) {
  messages.forEach((m, i) => {
    if (m.role !== "assistant" || !Array.isArray(m.content)) return;
    const next = messages[i + 1];
    const answered = new Set(
      Array.isArray(next?.content) ? (next.content as Block[]).filter((b) => b.type === "tool_result").map((b) => b.tool_use_id) : [],
    );
    for (const b of m.content as Block[]) {
      if (b.type === "tool_use" && !answered.has(b.id)) {
        throw new Error(`400 invalid_request_error: messages.${i}: tool_use ${String(b.id)} has no tool_result right after it`);
      }
    }
  });
}
