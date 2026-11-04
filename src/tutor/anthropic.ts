import Anthropic from "@anthropic-ai/sdk";
import type { TutorClient } from "./turn";

/**
 * The real Anthropic client behind the Tutor Turn's narrow client interface. The signal aborts the runner's open
 * stream and every later API call (Stop); a tool already running is not cut off, since ours ignore it.
 */
export function anthropicTutorClient(): TutorClient {
  const anthropic = new Anthropic();
  return { beta: { messages: { toolRunner: (params, options) => anthropic.beta.messages.toolRunner(params, { signal: options?.signal }) } } };
}
