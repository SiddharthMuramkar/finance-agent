import Anthropic from "@anthropic-ai/sdk";
import frozenWidgets from "@/widgets/frozen.generated.json";
import { ARCHETYPES, type Archetype } from "@/widgets/recipes/define";
import { RECIPES, recipeById } from "@/widgets/recipes";
import { scriptedTutor } from "@/dev/e2e-mode";
import { e2eComposeClient } from "@/dev/e2e-tutor";
import type { ApiUsage } from "./usage";

/**
 * The free-form Widget lane (UX audit ★.4, lane 2): when no recipe fits, the Tutor calls compose_widget with a brief,
 * an archetype and the parts it must use. A second, faster model writes the OpenUI Lang program from a slim prompt
 * (the frozen grammar-v2 Widget instructions, cut down to the archetype's parts), within 12 seconds. The program goes
 * through the same checks as show_widget's; on a timeout or a failure, code shows the closest recipe instead. This
 * module holds the model call, the prompt and the fallback choice; tools.ts checks and stores the Widget.
 */

/** The longest a free-form Widget may take to write before code falls back to a recipe. */
export const COMPOSE_LIMIT_MS = 12_000;
/** Room the turn keeps after the compose call, to check, store and reply before its own deadline. */
export const COMPOSE_TURN_MARGIN_MS = 15_000;
const MAX_TOKENS = 4000;

/** The label the writing indicator shows while the Widget is being written. */
export const COMPOSE_LABEL = "Drawing your Widget…";

export type ComposeRequest = {
  model: string;
  max_tokens: number;
  system: string;
  messages: { role: "user"; content: string }[];
};
export type ComposeMessage = { content: { type: string; text?: string }[]; stop_reason: string | null; usage?: ApiUsage };

/** The slice of the Anthropic client compose_widget uses; tests pass a stub. */
export type ComposeClient = { messages: { create(params: ComposeRequest, options?: { signal?: AbortSignal }): Promise<ComposeMessage> } };

/** The real client, made on first use so the build never reads the API key. The browser test bed's always refuses. */
export function anthropicComposeClient(): ComposeClient {
  if (scriptedTutor(process.env)) return e2eComposeClient();
  let anthropic: Anthropic | undefined;
  return {
    messages: {
      create: async (params, options) => {
        anthropic ??= new Anthropic();
        return (await anthropic.messages.create(params, { signal: options?.signal })) as unknown as ComposeMessage;
      },
    },
  };
}

/** How long the compose call may run: 12 s, less when the turn's deadline (a performance.now() time) is nearer. */
export function composeLimitMs(deadline: number | undefined, nowMs: number, limitMs = COMPOSE_LIMIT_MS): number {
  if (deadline === undefined) return limitMs;
  return Math.max(0, Math.min(limitMs, deadline - nowMs - COMPOSE_TURN_MARGIN_MS));
}

/** The component groups of the Widget instructions each archetype keeps, besides the ones every Widget needs. */
const ALWAYS = ["### Widget", "### Answers", "### Our parts: numbers from code", "### Layout", "### Content", "### Controls"];
const GROUPS_FOR: Record<Archetype, string[]> = {
  Grow: ["### Things to count", "### Charts"],
  Compare: ["### Guess, check, compare, order", "### Things to count", "### Charts", "### Tables"],
  History: ["### Guess, check, compare, order", "### Charts", "### Data display"],
  Formula: [],
  Predict: ["### Guess, check, compare, order", "### Charts"],
  Check: ["### Guess, check, compare, order"],
  Rank: ["### Guess, check, compare, order"],
  Chain: ["### Things to count", "### Data display"],
  Convert: ["### Things to count"],
};

/** Cuts a "## " or "### " section, up to the next heading of its level or above. */
function cutSection(text: string, heading: string): string {
  const start = text.indexOf(`\n${heading}\n`);
  if (start < 0) return text;
  const level = heading.match(/^#+/)![0].length;
  const rest = text.slice(start + 1 + heading.length);
  const next = rest.search(new RegExp(`\\n#{1,${level}} `));
  return text.slice(0, start) + (next < 0 ? "" : rest.slice(next));
}

/** The "### " groups of the Component Signatures section, with the part names each lists. */
function signatureGroups(text: string): { heading: string; parts: string[] }[] {
  const start = text.indexOf("## Component Signatures");
  const end = text.indexOf("\n## ", start + 1);
  const body = text.slice(start, end < 0 ? undefined : end);
  return body
    .split(/\n(?=### )/)
    .slice(1)
    .map((part) => ({ heading: part.split("\n")[0], parts: [...part.matchAll(/^([A-Z]\w+)\(/gm)].map((m) => m[1]) }));
}

const COMPOSE_RULES = `## Your task
You write one Widget for the Tutor, from the brief below. Reply with only the openui-lang program, inside one \`\`\`openui-lang fence, and nothing else: no prose before or after it. The program starts with root = Widget("<title>", [...]). Keep it minimal: one question, at most one control the Learner moves, at most three numbers and one visual at rest; put the rest behind an Accordion. Use every part the brief says it must use.`;

/**
 * The compose model's instructions: the frozen Widget instructions with the component groups this archetype (and the
 * parts it must use) do not need cut, and the reply-writing section replaced by the compose task.
 */
export function composePrompt(archetype: Archetype, mustUse: readonly string[] = []): string {
  let text = frozenWidgets.instructions;
  const keep = new Set([...ALWAYS, ...GROUPS_FOR[archetype]]);
  for (const group of signatureGroups(text)) {
    if (!keep.has(group.heading) && !group.parts.some((p) => mustUse.includes(p))) text = cutSection(text, group.heading);
  }
  text = cutSection(text, "## Inline Mode");
  return `${text.trim()}\n\n${COMPOSE_RULES}`;
}

/** The brief as the compose model reads it. */
export function composeBrief(brief: string, archetype: Archetype, mustUse: readonly string[]): string {
  return [`Archetype: ${archetype}.`, mustUse.length ? `It must use: ${mustUse.join(", ")}.` : "", `Brief: ${brief}`].filter(Boolean).join("\n");
}

/** The program in the compose model's reply: the first openui-lang fence's code, or the whole reply when it has none. */
export function programIn(reply: string): string | null {
  const fenced = reply.match(/```openui-lang\n([\s\S]*?)(?:\n```|$)/);
  const code = (fenced ? fenced[1] : reply).trim();
  return code.startsWith("root") || /\nroot\s*=/.test(code) ? code : null;
}

export type Composed =
  | { ok: true; code: string; ms: number; usage?: ApiUsage; stopReason: string | null }
  | { ok: false; reason: "timeout" | "stopped" | "failed"; error: string; ms: number; usage?: ApiUsage; stopReason?: string | null };

/**
 * Asks the compose model for the program, aborted after `limitMs` or when `stop` aborts (the Learner pressed Stop).
 * Never throws: a timeout, a Stop, an API error or a reply with no program comes back as a failure with its reason.
 */
export async function composeProgram(
  client: ComposeClient,
  input: { model: string; brief: string; archetype: Archetype; mustUse: readonly string[]; limitMs: number; stop?: AbortSignal },
): Promise<Composed> {
  const started = performance.now();
  const ms = () => Math.round(performance.now() - started);
  if (input.limitMs <= 0) return { ok: false, reason: "timeout", error: "no time left in the turn", ms: 0 };
  if (input.stop?.aborted) return { ok: false, reason: "stopped", error: "the Learner pressed Stop", ms: 0 };
  const timeout = AbortSignal.timeout(input.limitMs);
  const signal = input.stop ? AbortSignal.any([timeout, input.stop]) : timeout;
  try {
    // Raced as well as aborted, so a client that ignores the signal still cannot hold the turn past the limit.
    const aborted = new Promise<never>((_, reject) => {
      if (signal.aborted) reject(signal.reason);
      signal.addEventListener("abort", () => reject(signal.reason), { once: true });
    });
    const message = await Promise.race([
      client.messages.create(
        {
          model: input.model,
          max_tokens: MAX_TOKENS,
          system: composePrompt(input.archetype, input.mustUse),
          messages: [{ role: "user", content: composeBrief(input.brief, input.archetype, input.mustUse) }],
        },
        { signal },
      ),
      aborted,
    ]);
    const reply = message.content.flatMap((b) => (b.type === "text" && b.text ? [b.text] : [])).join("");
    const code = programIn(reply);
    if (!code) return { ok: false, reason: "failed", error: "the reply held no Widget program", ms: ms(), usage: message.usage, stopReason: message.stop_reason };
    return { ok: true, code, ms: ms(), usage: message.usage, stopReason: message.stop_reason };
  } catch (error) {
    if (input.stop?.aborted) return { ok: false, reason: "stopped", error: "the Learner pressed Stop", ms: ms() };
    if (timeout.aborted) return { ok: false, reason: "timeout", error: `it took longer than ${Math.round(input.limitMs / 1000)} seconds`, ms: ms() };
    return { ok: false, reason: "failed", error: error instanceof Error ? error.message : String(error), ms: ms() };
  }
}

/** A recipe and params to try as the fallback. */
export type FallbackCandidate = { recipe: string; params: unknown };

/**
 * The recipes to try when the free-form Widget cannot be shown, closest first: the fallback the Tutor gave, then each
 * recipe of the same archetype with its working examples, then every other recipe's. Code tries them in order and
 * shows the first that builds and passes the checks.
 */
export function fallbackCandidates(archetype: Archetype, given?: FallbackCandidate): FallbackCandidate[] {
  const same = RECIPES.filter((r) => r.archetype === archetype);
  const others = RECIPES.filter((r) => r.archetype !== archetype);
  const fromExamples = [...same, ...others].flatMap((r) => r.examples.map((params) => ({ recipe: r.id, params })));
  return [...(given && recipeById(given.recipe) ? [given] : []), ...fromExamples];
}

export const isArchetype = (value: unknown): value is Archetype => typeof value === "string" && (ARCHETYPES as readonly string[]).includes(value);
