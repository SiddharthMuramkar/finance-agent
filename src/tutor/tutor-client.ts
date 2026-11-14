import { assertE2eSafe, scriptedTutor } from "@/dev/e2e-mode";
import { e2eTutorClient } from "@/dev/e2e-tutor";
import type { ModelClient } from "./model";
import { openaiModelClient } from "./openai";

/**
 * The Tutor Turn's model client: OpenAI's gpt-6.1-sol through the Responses API (openai.ts). In the browser test bed
 * (`E2E_TUTOR=scripted`, never in production) it is the scripted Tutor instead. The real client is made lazily, so
 * nothing reads `OPENAI_API_KEY` until a step is actually sent.
 */
export function tutorClient(): ModelClient {
  assertE2eSafe(process.env);
  if (scriptedTutor(process.env)) return e2eTutorClient();
  return openaiModelClient();
}
