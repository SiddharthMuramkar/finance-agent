import type { TutorClient, TutorRequest } from "@/tutor/turn";

type Block = Record<string, unknown> & { type: string };
export type ScriptedReply = { content: Block[]; stop_reason?: string };

/**
 * Stands in for the Anthropic client at the Tutor Turn seam. Each turn takes
 * the next scripted reply, streams its text as deltas and records the request.
 */
export function scriptedClient(replies: ScriptedReply[]) {
  const requests: TutorRequest[] = [];
  const client: TutorClient = {
    beta: {
      messages: {
        toolRunner(params) {
          requests.push(structuredClone(params));
          const reply = replies.shift();
          if (!reply) throw new Error("scripted client ran out of replies");
          const final = {
            id: `msg_${requests.length}`,
            type: "message",
            role: "assistant",
            model: params.model,
            content: reply.content,
            stop_reason: reply.stop_reason ?? "end_turn",
          };
          const stream = {
            async *[Symbol.asyncIterator]() {
              for (const [index, block] of reply.content.entries()) {
                if (block.type === "text") {
                  yield { type: "content_block_delta", index, delta: { type: "text_delta", text: block.text } };
                }
              }
            },
            finalMessage: async () => final,
          };
          return {
            params,
            async *[Symbol.asyncIterator]() {
              yield stream;
            },
          } as never;
        },
      },
    },
  };
  return { client, requests };
}
