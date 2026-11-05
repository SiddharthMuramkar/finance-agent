import Anthropic from "@anthropic-ai/sdk";
import { assertE2eSafe, scriptedTutor } from "@/dev/e2e-mode";
import { e2eTutorClient } from "@/dev/e2e-tutor";
import type { TutorClient } from "./turn";

/**
 * The real Anthropic client behind the Tutor Turn's narrow client interface. The signal aborts the runner's open
 * stream and every later API call (Stop); a tool already running is not cut off, since ours ignore it.
 * In the browser test bed (`E2E_TUTOR=scripted`, never in production) it is the scripted Tutor instead.
 */
export function anthropicTutorClient(): TutorClient {
  assertE2eSafe(process.env);
  if (scriptedTutor(process.env)) return e2eTutorClient();
  const anthropic = new Anthropic();
  return { beta: { messages: { toolRunner: (params, options) => anthropic.beta.messages.toolRunner(params, { signal: options?.signal }) } } };
}
