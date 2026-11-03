import Anthropic from "@anthropic-ai/sdk";
import type { TutorClient } from "./turn";

/** The real Anthropic client behind the Tutor Turn's narrow client interface. */
export function anthropicTutorClient(): TutorClient {
  const anthropic = new Anthropic();
  return { beta: { messages: { toolRunner: (params) => anthropic.beta.messages.toolRunner(params) } } };
}
