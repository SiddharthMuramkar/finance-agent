import type { Citation } from "./citations";
import type { ApiUsage } from "./usage";

/**
 * The one model the app runs on, and the shapes the Tutor Turn works in (ADR 0015).
 *
 * Every model call goes to OpenAI's gpt-6.1-sol through the Responses API. The Tutor Turn never sees an OpenAI
 * type: it speaks the app's own transcript format below, stored unchanged in `messages.content`, and one adapter
 * (openai-items.ts) translates it to and from OpenAI's items. The format is the one Sessions were stored in before
 * the switch, so every older conversation still reads back the same way.
 */

/** The only model: the Tutor, compose_widget, the picture reader, judges and graders all use it. */
export const TUTOR_MODEL = "gpt-6.1-sol";

/** gpt-6.1-sol's reasoning efforts; `medium` is the API's default and the app's. */
export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
export const DEFAULT_EFFORT: Effort = "medium";

// ---------------------------------------------------------------------------------------------------------------
// The transcript format (stored in `messages.content`)
// ---------------------------------------------------------------------------------------------------------------

/** Text. On a Tutor reply, `citations` name the Library sentences a block rests on (citations.ts). */
export type TextBlock = { type: "text"; text: string; citations?: Citation[] | null };

/**
 * A tool call. `id` is the call's id (OpenAI's `call_id`), the key every tool's effect is saved under (tools.ts).
 * `arguments` keeps the raw JSON the model wrote when it could not be parsed (a reply cut off at its length limit).
 */
export type ToolUseBlock = { type: "tool_use"; id: string; name: string; input: unknown; arguments?: string };

/** One Library passage handed to the Tutor: block 0 is its credit header, then one block per sentence. */
export type SearchResultBlock = {
  type: "search_result";
  /** The passage view, `/passages/<id>`. */
  source: string;
  title: string;
  content: { type: "text"; text: string }[];
  citations?: { enabled: boolean };
};

/** What a tool returned: text, or (search_library) the Library passages it found. */
export type ToolOutput = string | (TextBlock | SearchResultBlock)[];

/** A tool call's result, in the user message that follows the call. */
export type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: ToolOutput; is_error?: boolean };

/**
 * The summary that stands in for everything before it: OpenAI's compacted window (`items`: an encrypted compaction
 * item and any items OpenAI kept from the old window), passed back as returned and never pruned. Sessions from before the switch hold Anthropic's readable `content` instead.
 */
export type CompactionBlock = { type: "compaction"; items?: unknown[]; content?: string | null };

/**
 * One loop step's raw OpenAI output items (reasoning, the message with its `phase`, function calls with their exact
 * arguments), kept beside the readable blocks so an untouched step goes back to the model exactly as it came.
 * Never shown; any code that edits a stored step drops it, and the step is then sent rebuilt from its blocks.
 */
export type ReplayBlock = { type: "replay"; items: unknown[] };

export type Block = TextBlock | ToolUseBlock | ToolResultBlock | SearchResultBlock | CompactionBlock | ReplayBlock;

/** One stored message. `system` rows carry code's changed context mid-conversation (sent as developer messages). */
export type Message = { role: "user" | "assistant" | "system"; content: string | Block[] };

/** A tool as frozen into a Session: OpenAI's function tool shape, stored and replayed exactly. */
export type ToolDefinition = {
  type: "function";
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  strict: boolean;
};

/** The call a tool's code is given: `toolUse.id` is the key its effect is saved under (tools.ts `once`). */
export type ToolRunContext = { toolUse: ToolUseBlock };

/** A tool's code, bound to its frozen definition by name. */
export type ToolCode = {
  // The input is whatever `parse` returned for this tool.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parse: (input: unknown) => any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  run: (input: any, context?: ToolRunContext) => ToolOutput | Promise<ToolOutput>;
};

/** A frozen definition with its code: what the runner can call. */
export type RunnableTool = ToolDefinition & ToolCode;

// ---------------------------------------------------------------------------------------------------------------
// The model seam: one model step at a time
// ---------------------------------------------------------------------------------------------------------------

/**
 * Why a step ended. The words are the app's own (stored in `turns`, `usage` and `library_pictures`, and compared in
 * code and SQL); the adapter maps OpenAI's status, refusals and function calls onto them.
 */
export type StopReason = "end_turn" | "tool_use" | "max_tokens" | "refusal" | "compaction";

/** What a step streams while it runs. `block` is the index, in the step's final content, of the block it belongs to. */
export type StepEvent =
  | { type: "text"; block: number; text: string }
  | { type: "citation"; block: number; citation: Citation }
  /** A block ended: the reply shows its citation markers here (citations.ts). */
  | { type: "block_stop"; block: number };

export type StepResult = { content: Block[]; stopReason: StopReason; usage?: ApiUsage };

/** One model step: its events as they stream, and its final message. `final()` may be called more than once. */
export type StepStream = AsyncIterable<StepEvent> & { final(): Promise<StepResult> };

export type StepRequest = {
  model: string;
  effort: Effort;
  instructions: string;
  tools: ToolDefinition[];
  messages: Message[];
  maxOutputTokens: number;
  /** "none" on a turn's last allowed step (the step limit, runner.ts): the model writes its reply and calls no tool. */
  toolChoice?: "none";
};

/** A compaction: the history to fold into one summary window. */
export type CompactRequest = { model: string; messages: Message[] };

export type ModelClient = {
  /** Starts one model step. The signal aborts it (the Learner pressed Stop, or the turn was cut off). */
  step(request: StepRequest, options?: { signal?: AbortSignal }): StepStream;
  /** Folds the history into one compaction block (`content: [{ type: "compaction", … }]`). */
  compact(request: CompactRequest, options?: { signal?: AbortSignal }): Promise<StepResult>;
  /** The client one runner uses for its whole loop; the browser test bed starts a fresh script per run. */
  forRun?(): ModelClient;
};

/** The Tutor Turn's client: one model step at a time. */
export type TutorClient = ModelClient;

/** Thrown when a step or a runner is aborted: the Learner pressed Stop, or the turn was cut off. */
export class StepAborted extends Error {
  constructor() {
    super("The model step was aborted.");
    this.name = "AbortError";
  }
}
