import type { TutorClient, TutorRequest } from "@/tutor/turn";

type Block = Record<string, unknown> & { type: string };
export type ScriptedReply = { content: Block[]; stop_reason?: string; usage?: Record<string, unknown> };

/**
 * Stands in for the Anthropic client at the Tutor Turn seam. Each loop step
 * takes the next scripted reply, streams its text as deltas and records the
 * request. Like the real Tool Runner, a reply with tool_use blocks runs those
 * tools, appends the reply and the tool results to `params.messages`, and
 * loops; a thrown error becomes an `is_error` tool result.
 */
export function scriptedClient(replies: ScriptedReply[]) {
  const requests: TutorRequest[] = [];
  const client: TutorClient = {
    beta: {
      messages: {
        toolRunner(params) {
          return {
            params,
            async *[Symbol.asyncIterator]() {
              for (;;) {
                assertSystemPlacement(params.messages);
                requests.push(structuredClone({ ...params, tools: params.tools.map(({ name }) => ({ name })) }) as never);
                const reply = replies.shift();
                if (!reply) throw new Error("scripted client ran out of replies");
                const uses = reply.content.filter((b) => b.type === "tool_use");
                const final = {
                  content: reply.content,
                  stop_reason: reply.stop_reason ?? (uses.length ? "tool_use" : "end_turn"),
                  usage: reply.usage,
                };
                yield {
                  async *[Symbol.asyncIterator]() {
                    for (const [index, block] of reply.content.entries()) {
                      if (block.type === "text") {
                        yield { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } };
                      }
                    }
                  },
                  finalMessage: async () => final,
                } as never;
                if (!uses.length) return;
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
