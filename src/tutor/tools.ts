import type { BetaRunnableTool } from "@anthropic-ai/sdk/lib/tools/BetaRunnableTool";
import type { BetaMessageParam } from "@anthropic-ai/sdk/resources/beta/messages";
import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { loadCaseData } from "@/case-data/case-data";
import { REFERENCE_CASE } from "@/case-data/reference";
import { calculate } from "@/finance/calculators";
import { isConverted, type CourseMap } from "@/course/map";
import { navigate, TEACHING_STEPS, type Place, type Progress } from "@/course/navigator";
import { exploreHeldBack } from "@/course/explore-widget";
import { coveredParts, WIDGET_OPENED } from "@/course/written-ahead";
import { messages, practiceAnswers, sessions, toolCalls, turns } from "@/db/schema";
import { widgetControls, widgetNodes, widgetParts, widgetProblems, widgetRuleProblems, writtenAheadPartProblems } from "@/widgets/check";
import { declaredSettings } from "@/widgets/settings";
import { widgetKey } from "@/widgets/widget-state";
import { ARCHETYPES } from "@/widgets/recipes/define";
import { recipeById } from "@/widgets/recipes";
import { shownWidgetOf, WIDGET_SHOWN, type ComposeTimings, type ShownWidget } from "@/widgets/shown-widget";
import type { WidgetStates } from "@/widgets/widget-state";
import { loadWidgetState, saveWidgetState } from "@/learner/widget-state";
import { anthropicComposeClient, COMPOSE_LABEL, composeLimitMs, composeProgram, fallbackCandidates, type ComposeClient, type Composed } from "./compose";
import { readSettings, usesWidgetEngine } from "./session-log";
import { stepUsage, type StepUsage } from "./usage";
import { loadWrittenAhead, openedItem, saveOpenedState } from "./written-ahead";
import { illustrationProblems, normalizePreset, presetProblems, QUICK_CHECK_REFUSAL, sliderSpecs, TUTOR_RECIPE_IDS } from "./ready-made-widgets";
import { checkReply, type ReplyWidget } from "./reply-checks";
import { replyCheckContext, turnFacts } from "./turn-facts";
import type { Db } from "@/db/types";
import { loadProgress, saveCheckResult, saveFinishedStep, saveMisconception } from "@/learner/memory";
import { exactWords, loadExploreInfo, saveInsightAttempt } from "@/learner/insight";
import { MAX_RULE_LENGTH, saveOwnRule } from "@/learner/own-rule";
import { quizUnavailable } from "@/learner/quiz";
import { searchLibrary, searchResultBlocks, type QueryEmbedder } from "@/library/library";
import { stepContext, topicCompleteContext } from "./context";
import { verdictCard } from "./check-results";
import { pasteSummary } from "./pasted";
import { drawnWidgets, loadSessionItems, saveItemAfterLatest, stepDivider, type ReplyText, type SessionItem, type StoredItem } from "./session-items";
import { enterStepItems, startAgainItems } from "./practice";
import { openWidgetsForTurn } from "./widget-context";
import { textOf } from "./transcript";
import type { ToolDefinition } from "./instructions";
import { JUST_TELL_ME } from "./chips";
import { ownRuleOf, OWN_RULE_SAVED } from "./own-rule-item";
import { isCodeWritten, OLD_CONTINUE_TEXT, turnKind } from "./turn-status";

export type ToolCode = Pick<BetaRunnableTool, "run" | "parse">;

/** The text of each of a Session's replies (its assistant rows), with its seq, for drawnWidgets. */
export function replyTexts(rows: readonly { seq: number; role: string; content?: unknown }[]): ReplyText[] {
  return rows.filter((r) => r.role === "assistant").map((r) => ({ seq: r.seq, text: textOf(r.content) }));
}

/** How a Widget block opens in a reply. */
const FENCE_OPEN = "```openui-lang\n";

/** What a tool told the Tutor, and whether it was a rejection (sent back as a tool error). */
type Outcome = {
  ok: boolean;
  text: string;
  /** The call moved the Learner onto a new Teaching Step. */
  began?: boolean;
  /** The Session items the call stored (a result card, a step divider), in order, for the Learner to see at once. */
  items?: SessionItem[];
  /** Widget states the call saved (update_widget), for the open panel to move its sliders at once. */
  widgetStates?: WidgetStateEvent[];
};

/** A Widget's new slider values, by its Widget key, sent to the browser so the open Widget moves (update_widget). */
export type WidgetStateEvent = { type: "widget_state"; widgetKey: string; values: Record<string, number> };

/**
 * Shared with the Tutor Turn: whether a progress write failed, so it can tell the Learner, and the
 * Session items tool calls stored, which it streams to the browser as they are stored.
 */
export type ToolEffects = {
  saveFailed: boolean;
  items?: SessionItem[];
  /**
   * Tells the browser, at once, what the turn is doing now: the Tutor Turn's generator is blocked while tools run, so
   * a tool cannot yield an event. The route wires it to its stream; left out (tests, scripts), nothing is sent.
   */
  notify?: (event: ProgressEvent) => void;
  /** Widget states tool calls saved (update_widget), which the Tutor Turn streams to the browser as they are saved. */
  widgetStates?: WidgetStateEvent[];
  /** The turn's deadline (a performance.now() time): compose_widget ends its model call well before it. */
  deadline?: number;
  /** Aborts when the Learner presses Stop: compose_widget gives up its model call. */
  stop?: AbortSignal;
  /** Saves an extra usage step (the compose model's call) under the turn's next step number; left out, none is saved. */
  saveStep?: (model: string, make: (step: number) => StepUsage) => Promise<void>;
  /** What the page's Widgets showed when the turn was sent (TurnDeps.widgets), over what the Session saved. */
  pageWidgets?: WidgetStates;
};

/** compose_widget's model client and, for tests, a shorter limit than 12 s. */
export type Composer = { client: ComposeClient; limitMs?: number };

/** A plain-word label for what the turn is doing now ("Searching the Library…"), shown by the writing indicator. */
export type ProgressEvent = { type: "progress"; label: string };

/** What the writing indicator says while each tool runs. */
export const TOOL_LABELS: Record<string, string> = {
  search_library: "Searching the Library…",
  calculate: "Working out the numbers…",
  record_misconception: "Making a note…",
  record_check_verdict: "Recording the Check…",
  record_insight_attempt: "Recording your answer…",
  save_learner_rule: "Saving to your notes…",
  start_again: "Starting again…",
  open_widget: "Opening a Widget…",
  show_widget: "Drawing the Widget…",
  compose_widget: COMPOSE_LABEL,
  update_widget: "Updating the Widget…",
  finish_teaching_step: "Moving to the next step…",
};

/** Each tool's code, telling the browser what runs as it starts. */
function withProgress(code: Record<string, ToolCode>, effects: ToolEffects): Record<string, ToolCode> {
  return Object.fromEntries(
    Object.entries(code).map(([name, impl]) => [
      name,
      {
        ...impl,
        run: (input: never, context?: never) => {
          effects.notify?.({ type: "progress", label: TOOL_LABELS[name] ?? "Working…" });
          return impl.run(input, context);
        },
      } as ToolCode,
    ]),
  );
}

/** The tool result when a write failed: the Tutor is told plainly that nothing was saved. */
export const NOTHING_RECORDED =
  "Nothing was recorded: the Learner's progress could not be saved because of a database error. Tell the Learner plainly that this was not saved, do not say it was, and do not move on as if it had been.";

/** Sent back when the Tutor tries to finish a step it only just reached in the same turn. */
export const PACING_REJECTION =
  "Cannot finish this step: it began during this turn. Teach it in your reply now, then stop and wait for the Learner to answer; you can finish it in your next turn.";

/** Sent back when the Tutor calls start_again in a Topic with no Concept cards (not converted). */
export const START_AGAIN_REFUSAL = "Not started again: this Topic has no Concept cards to show again. Teach its first idea again in words, simply, with one ask.";

/** Sent back when the Tutor records a verdict at a Check step it only just reached, before the Learner could answer the prompt. */
export const VERDICT_PACING_REJECTION =
  "Cannot record a verdict: this Check step began during this turn, so the Learner has not answered the Check prompt yet. Put the prompt in your reply now, then stop and wait for the Learner's answer; record the verdict in a later turn.";

/** Sent back when the Tutor records an Insight attempt at an explore step it only just reached, before the Learner could try. */
export const INSIGHT_PACING_REJECTION =
  "Cannot record an attempt: the explore step began during this turn, so the Learner has not seen the Insight question yet. Put the question in your reply now, then stop and wait for the Learner's own words; record their attempt in a later turn.";

/** Sent back when the message is a help chip's words or a note code wrote: neither is ever an attempt. */
export const NOT_THE_LEARNERS_ATTEMPT =
  "Not recorded: this message is a chip the Learner pressed or a note code wrote, which is never an attempt at the Insight. Answer what it asks, invite the Learner to say what they notice in their own words, then wait.";

/** The closing instruction of every Insight result: the reply's last words come after the tool result. */
const WRITE_AFTER = "Write your reply to the Learner now, after this result, and make it the final text of your reply.";

/** What the Learner sees when a progress write failed. */
export const SAVE_FAILED_MESSAGE = "Your progress could not be saved just now. The Tutor has been told nothing was recorded.";

/** The Course Navigator's context for the Learner's place, with the Case Data the as-of rule allows them right now. */
export async function navigatorContext(db: Db, map: CourseMap, place: Place | null, turnId: number | undefined, learnerId: number): Promise<string> {
  const sessionId = turnId === undefined ? null : (await db.select({ s: turns.sessionId }).from(turns).where(eq(turns.id, turnId)))[0]?.s;
  return stepContext(
    place,
    await caseDataFor(db, map, place, learnerId),
    await pasteSummary(db, sessionId, learnerId),
    false,
    await loadExploreInfo(db, place, turnId, learnerId),
    // The new place's word limit, currency and blocked numbers, so the Tutor writes this same reply within them.
    await turnFacts(db, map, learnerId, place),
  );
}

/** The Case Data of the place's Cases, then the reference datasets, under the as-of rule for this Learner's progress. */
export async function caseDataFor(db: Db, map: CourseMap, place: Place | null, learnerId: number) {
  if (!place) return [];
  const progress = await loadProgress(db, learnerId);
  const all = await Promise.all([...place.topic.cases.map((c) => c.id), REFERENCE_CASE].map((id) => loadCaseData(db, map, progress, id)));
  return all.filter((d) => d !== undefined);
}

/**
 * The code behind each tool, by name. Every tool that writes runs through `once`; the read-only
 * `search_library` and the pure `calculate` write nothing, so they don't:
 * the effect and the saved result share one transaction keyed by the tool call ID, so a
 * repeated call, or a call re-run after a cut-off, returns the saved result and has no
 * second effect. If the write fails, the transaction rolls back (the Course Navigator
 * does not advance) and the Tutor is told nothing was recorded. search_library only reads, so
 * it simply runs again if repeated.
 */
/** The turn the tools run in, and the Learner whose memory they read and write. */
export type ToolTurn = { id: number; learnerId: number };

export function toolCode(
  db: Db,
  map: CourseMap,
  now: () => Date,
  model: string,
  effects: ToolEffects,
  turn: ToolTurn,
  embedQuery?: QueryEmbedder,
  composer?: Composer,
): Record<string, ToolCode> {
  const { id: turnId, learnerId } = turn;
  const finishInput = z.object({ step: z.enum(TEACHING_STEPS) });
  const verdictInput = z.object({ check_id: z.string(), verdict: z.enum(["pass", "not_yet"]), reasons: z.string().min(1) });
  const misconceptionInput = z.object({ description: z.string().min(1), topic_id: z.string().optional() });
  const searchInput = z.object({ query: z.string().min(1), source: z.string().optional() });
  const ruleInput = z.object({ learner_words: z.string().min(1) });
  const insightInput = z.object({ outcome: z.enum(["found", "not_yet", "asked_to_be_told"]), learner_words: z.string().min(1) });

  /**
   * Pacing rule: whether the Learner's current step began during this turn, so it has not yet been
   * taught in a reply the Learner answered. A step begins in a turn when a tool call in it moved the
   * Learner on, or when it began before the turn without being taught (the turn started the Topic,
   * or a quiz pass marked by code moved the Learner on).
   */
  async function stepBeganThisTurn(tx: Db): Promise<boolean> {
    const [began] = await tx.select().from(toolCalls).where(and(eq(toolCalls.turnId, turnId), eq(toolCalls.beganStep, true)));
    const [thisTurn] = await tx.select().from(turns).where(eq(turns.id, turnId));
    return Boolean(began || thisTurn?.freshStep);
  }

  /**
   * The context after a step finished or a Check was recorded. When the move passed the Topic the Learner
   * was in (its Principle, or its last Due Check), the Tutor is told to stop there, with no context for
   * another Topic, and nothing more is started: the Learner chooses where to go. Otherwise, the new place's.
   */
  async function contextAfterMove(tx: Db, before: Place | null): Promise<string> {
    const progress = await loadProgress(tx, learnerId);
    const after = navigate(map, progress);
    if (before && progress.topics[before.topic.id]?.status === "passed" && after?.topic.id !== before.topic.id) return topicCompleteContext(before.topic.title);
    return navigatorContext(tx, map, after, turnId, learnerId);
  }

  /**
   * Stores the divider for the Learner's new step in the turn's Session, when they are still in the Topic they were in,
   * then what code shows on entering that step (enterStepItems: a Concept card and its Widget, or the next Quick try),
   * so a card lands right after the divider mid-reply. Returns them in order; empty when nothing was stored.
   */
  async function storeStepDivider(tx: Db, before: Place | null, progress: Progress): Promise<SessionItem[]> {
    const after = navigate(map, progress);
    if (!before || after?.topic.id !== before.topic.id) return [];
    const divider = await storeAfterLatest(tx, stepDivider(map, progress, after.topic.id));
    if (!divider) return [];
    const [turn] = await tx.select({ sessionId: turns.sessionId }).from(turns).where(eq(turns.id, turnId));
    const entered = turn?.sessionId == null ? [] : await enterStepItems(tx, map, learnerId, turn.sessionId, now());
    return [divider, ...entered];
  }

  /** Stores a Session item after the latest message of the turn's Session; null when there is no item or no Session yet. */
  async function storeAfterLatest(tx: Db, item: SessionItem | null): Promise<SessionItem | null> {
    const [turn] = await tx.select({ sessionId: turns.sessionId }).from(turns).where(eq(turns.id, turnId));
    if (!item || turn?.sessionId == null) return null;
    await saveItemAfterLatest(tx, learnerId, turn.sessionId, item, now());
    return item;
  }

  async function once(toolCallId: string | undefined, name: string, effect: (tx: Db) => Promise<Outcome>): Promise<string> {
    if (!toolCallId) throw new Error("Missing tool call ID.");
    let outcome: Outcome;
    try {
      outcome = await db.transaction(async (transaction) => {
        const tx = transaction as unknown as Db;
        const [done] = await tx.select().from(toolCalls).where(eq(toolCalls.toolCallId, toolCallId));
        // A repeat has no second effect, so it stores no second item either.
        if (done) return { ok: !done.isError, text: done.result };
        const result = await effect(tx);
        await tx.insert(toolCalls).values({ toolCallId, name, result: result.text, isError: !result.ok, turnId, beganStep: result.began ?? false, createdAt: now() });
        return result;
      });
    } catch (error) {
      console.error(`Tool ${name} could not save`, error);
      effects.saveFailed = true;
      throw new Error(NOTHING_RECORDED);
    }
    if (outcome.items?.length) (effects.items ??= []).push(...outcome.items);
    if (outcome.widgetStates?.length) (effects.widgetStates ??= []).push(...outcome.widgetStates);
    if (!outcome.ok) throw new Error(outcome.text);
    return outcome.text;
  }

  /** The turn's Session, its reply so far and its items: what a shown Widget is checked against. */
  type ReplyScope = {
    sessionId: number;
    turnSeq: number;
    topicId: string | null;
    rows: { seq: number; role: string; content: unknown }[];
    items: StoredItem[];
    /** The Session was frozen with the widget engine: ready-made Widgets only, one a reply (ADR 0007). */
    engine: boolean;
    /** The turn took Next: the items Next stored (a step's Widget chip) sit just before its message. */
    next: boolean;
  };

  async function replyScope(tx: Db): Promise<ReplyScope | null> {
    const [row] = await tx
      .select({ sessionId: turns.sessionId, turnSeq: turns.turnSeq, input: turns.input, topicId: sessions.topicId, tools: sessions.tools })
      .from(turns)
      .leftJoin(sessions, eq(sessions.id, turns.sessionId))
      .where(eq(turns.id, turnId));
    if (row?.sessionId == null || row.turnSeq == null) return null;
    const rows = await tx.select({ seq: messages.seq, role: messages.role, content: messages.content }).from(messages).where(eq(messages.sessionId, row.sessionId));
    const items = await loadSessionItems(tx, row.sessionId, learnerId);
    return {
      sessionId: row.sessionId,
      turnSeq: row.turnSeq,
      topicId: row.topicId ?? null,
      rows,
      items,
      engine: usesWidgetEngine({ tools: row.tools }),
      next: turnKind({ input: row.input }) === "next",
    };
  }

  /** The reply so far, as text: what the Tutor has written in this turn. */
  const replySoFar = (scope: ReplyScope) => replyTexts(scope.rows.filter((r) => r.seq >= scope.turnSeq)).map((r) => r.text).join("\n");

  /**
   * The Widgets this reply holds, by Widget key: every Widget item stored for it, whoever stored it (a tool call, or code at
   * a Next or a step: those sit just before the turn's message), and every fence in the reply so far. `slots` counts them.
   */
  async function replyWidgets(tx: Db, scope: ReplyScope): Promise<{ slots: number; keys: Set<string> }> {
    const keys = new Set<string>();
    let slots = 0;
    for (const i of scope.items) {
      const mine = i.afterSeq >= scope.turnSeq || (scope.next && i.afterSeq === scope.turnSeq - 1);
      if (!mine) continue;
      if (i.kind === WIDGET_OPENED && typeof i.data.id === "string") {
        keys.add(i.data.id);
        slots++;
      } else if (i.kind === WIDGET_SHOWN) {
        const key = widgetKey(shownWidgetOf(i.data)?.title);
        if (key) keys.add(key);
        slots++;
      }
    }
    for (const fence of replySoFar(scope).split(FENCE_OPEN).slice(1)) {
      const key = widgetKey(widgetParts(fence.split("```")[0]).title);
      if (key) keys.add(key);
      slots++;
    }
    // update_widget on a Widget this reply did not open or show is the reply's Widget too.
    const updates = await tx.select({ result: toolCalls.result }).from(toolCalls).where(and(eq(toolCalls.turnId, turnId), eq(toolCalls.name, "update_widget"), eq(toolCalls.isError, false)));
    const moved = new Set(updates.flatMap((u) => u.result.match(/^Updated by code: "(.*)" now shows/)?.[1] ?? []));
    for (const key of moved) {
      if (!keys.has(key)) slots++;
      keys.add(key);
    }
    return { slots, keys };
  }

  /** One Widget per reply: the reply so far has drawn one of its own, or code has shown one in it. */
  async function widgetInReply(tx: Db, scope: ReplyScope): Promise<boolean> {
    if (scope.engine) return (await replyWidgets(tx, scope)).slots > 0;
    return replySoFar(scope).includes(FENCE_OPEN) || scope.items.some((i) => i.kind === WIDGET_SHOWN && i.afterSeq >= scope.turnSeq);
  }

  const ONE_WIDGET = "Not shown: this reply already has a Widget, and a reply shows one Widget. Talk about the one on screen; show another in a later reply if it still helps.";
  const TALK_ABOUT_IT = "Write no openui-lang block in this reply. Say in one sentence what the Widget shows at these numbers; do not ask the Learner to move or set anything.";
  const GUIDED_TASKS = "Its Guided Tasks (optional play, never set as work; they tick themselves):";

  /**
   * An open quiz keeps its numbers from the Widgets the Tutor sets (V5 of the reply checks, spec #229): the same rule the
   * reply check uses, so the tool and the check never disagree. The problems are in words; none when no quiz is open.
   */
  async function openQuizProblems(tx: Db, w: ReplyWidget): Promise<string[]> {
    const place = navigate(map, await loadProgress(tx, learnerId));
    const facts = await turnFacts(tx, map, learnerId, place);
    if (!facts.openItems.length) return [];
    return checkReply({ text: "", widgets: [w] }, replyCheckContext(facts))
      .filter((p) => p.rule === "V5")
      .map((p) => p.message);
  }

  /** The Case Data references the as-of rule allows the Learner now (ADR 0003). */
  async function allowedRefs(tx: Db): Promise<Set<string>> {
    const progress = await loadProgress(tx, learnerId);
    return new Set((await caseDataFor(tx, map, navigate(map, progress), learnerId)).flatMap((c) => c.datasets.map((d) => `${c.caseId}/${d.id}`)));
  }

  /** The same checks as a Widget the Tutor writes: it draws, keeps the Widget rules, and leaves written-ahead parts alone. */
  async function shownProblems(tx: Db, scope: ReplyScope, code: string): Promise<string[]> {
    const open = drawnWidgets(replyTexts(scope.rows), scope.items).map((w) => w.code);
    const topic = scope.topicId ? map.topic(scope.topicId) : undefined;
    const progress = await loadProgress(tx, learnerId);
    const held = topic ? exploreHeldBack(topic, progress.topics[topic.id]) : null;
    const covered = topic ? coveredParts(topic).map((w) => (w.id === held ? { ...w, held: true } : w)) : [];
    return [...widgetProblems(code), ...widgetRuleProblems(code, open), ...writtenAheadPartProblems(code, covered)];
  }

  /** Stores a shown Widget after the latest message and tells the Tutor what is on screen. */
  async function storeShown(tx: Db, scope: ReplyScope, data: ShownWidget, opening: string): Promise<Outcome> {
    const item = { kind: WIDGET_SHOWN, data };
    await saveItemAfterLatest(tx, learnerId, scope.sessionId, item, now());
    const { sliders, tasks } = widgetControls(data.code);
    const lines = [
      opening,
      ...(sliders.length ? ["Its sliders:", ...sliders.map((s) => `- ${s}`)] : []),
      ...(tasks.length ? [GUIDED_TASKS, ...tasks.map((t) => `- ${t}`)] : []),
    ];
    return { ok: true, text: lines.join("\n"), items: [item] };
  }

  /**
   * compose_widget inside `once`: shows the program the compose model wrote when it passes the checks, else the
   * closest recipe that builds and passes them, else nothing (the Tutor teaches in words).
   */
  async function showComposed(tx: Db, toolCallId: string, input: ComposeInput, composed: Composed | null): Promise<Outcome> {
    const scope = await replyScope(tx);
    if (!scope) return { ok: false, text: "Not shown: this turn has no Session yet." };
    if (await widgetInReply(tx, scope)) return { ok: false, text: ONE_WIDGET };
    if (!composed) return { ok: false, text: "Not shown: the Widget could not be drawn. Teach this in words." };
    if (!composed.ok && composed.reason === "stopped") return { ok: false, text: "Not shown: the Learner pressed Stop." };
    const allowed = await allowedRefs(tx);
    let reason: NonNullable<ComposeTimings["fallbackReason"]>;
    let why: string;
    if (composed.ok) {
      const parts = widgetParts(composed.code);
      const missing = input.mustUse.filter((p) => !parts.components.includes(p));
      const unknown = parts.datasets.filter((d) => !allowed.has(d));
      const problems = [
        ...(parts.title?.trim() ? [] : ["It has no title."]),
        ...(missing.length ? [`It does not use ${missing.join(", ")}.`] : []),
        ...(unknown.length ? [`${unknown.join(", ")} is not in the Case Data code sent for this step.`] : []),
        ...(await shownProblems(tx, scope, composed.code)),
      ];
      if (!problems.length) {
        const title = parts.title!.trim();
        const data: ShownWidget = {
          id: toolCallId,
          recipe: "",
          params: { brief: input.brief, archetype: input.archetype, mustUse: input.mustUse },
          title,
          code: composed.code,
          source: "compose",
          timings: { composeMs: composed.ms },
        };
        return storeShown(tx, scope, data, `Shown by code: "${title}", drawn free-form, is in the Widget panel, with a chip where you called compose_widget. ${TALK_ABOUT_IT}`);
      }
      reason = "checks";
      why = `the free-form Widget did not pass the checks (${problems.join(" ")})`;
    } else {
      reason = composed.reason === "timeout" ? "timeout" : "failed";
      why = composed.reason === "timeout" ? "drawing it took too long" : "it could not be drawn";
    }
    for (const candidate of fallbackCandidates(input.archetype, input.fallback)) {
      const built = recipeById(candidate.recipe)?.build(candidate.params);
      if (!built?.ok || built.refs.some((ref) => !allowed.has(ref))) continue;
      if ((await shownProblems(tx, scope, built.code)).length) continue;
      const data: ShownWidget = {
        id: toolCallId,
        recipe: candidate.recipe,
        params: built.params,
        title: built.title,
        code: built.code,
        source: "fallback",
        timings: { composeMs: composed.ms, fallbackReason: reason },
      };
      return storeShown(
        tx,
        scope,
        data,
        `Shown by code instead: "${built.title}", a ready-made Widget (recipe ${candidate.recipe}), because ${why}. Say so to the Learner in one short line (for example "I used a ready-made Widget because drawing a new one took too long"). ${TALK_ABOUT_IT}`,
      );
    }
    return { ok: false, text: `Not shown: ${why}, and no ready-made Widget fits. Teach this in words.` };
  }

  const openInput = z.object({ id: z.string().min(1), preset: z.record(z.string(), z.number()).optional() });
  const showInput = z.object({ recipe: z.string(), params: z.unknown() });
  const composeInput = z.object({
    brief: z.string().min(1),
    archetype: z.enum(ARCHETYPES),
    mustUse: z.array(z.string()).default([]),
    fallback: z.object({ recipe: z.string(), params: z.unknown() }).optional(),
  });
  type ComposeInput = z.output<typeof composeInput>;
  const updateInput = z.object({ key: z.string().min(1), values: z.record(z.string(), z.number()) });
  const calculateInput = z.object({ calculator: z.string(), inputs: z.unknown(), currency: z.enum(["usd", "inr"]).optional() });

  return withProgress({
    search_library: {
      parse: (input) => searchInput.parse(input),
      run: async ({ query, source }) => searchResultBlocks(await searchLibrary({ db, map, embedQuery, learnerId }, query, { source })),
    },
    // Pure: it writes nothing, so it does not go through `once`; the same inputs always give the same answer.
    calculate: {
      parse: (input) => calculateInput.parse(input),
      run: async ({ calculator, inputs, currency }) => {
        const result = calculate(calculator, inputs, currency);
        if (!result.ok) throw new Error(result.error);
        return `${result.title}\n${result.results.map((r) => `${r.label}: ${r.text}`).join("\n")}\n(Computed by code from the tested formula "${result.id}".)`;
      },
    },
    record_misconception: {
      parse: (input) => misconceptionInput.parse(input),
      run: ({ description, topic_id }, context) =>
        once(context?.toolUse.id, "record_misconception", async (tx) => {
          const place = navigate(map, await loadProgress(tx, learnerId));
          // A topic_id that isn't on the Course Map is kept under the current Topic rather than lost.
          const known = topic_id && map.topic(topic_id) ? topic_id : undefined;
          const topicId = known ?? place?.topic.id;
          if (!topicId) return { ok: false, text: "No current Topic; give the topic_id of a Topic on the Course Map." };
          const checkId = place && topicId === place.topic.id ? (place.check?.id ?? null) : null;
          const saved = await saveMisconception(tx, map, { topicId, checkId, description, model, toolCallId: context!.toolUse.id }, now(), learnerId);
          if (!saved.ok) return { ok: false, text: saved.reason };
          const note = topic_id && !known ? ` "${topic_id}" is not a Topic ID on the Course Map, so it was recorded under the current Topic.` : "";
          return { ok: true, text: `Recorded by code: misconception noted for Topic ${topicId}.${note}` };
        }),
    },
    record_check_verdict: {
      parse: (input) => verdictInput.parse(input),
      run: ({ check_id, verdict, reasons }, context) =>
        once(context?.toolUse.id, "record_check_verdict", async (tx) => {
          // A quiz Check is marked only by code, from the Learner's submitted answers; never by a Tutor verdict.
          // The one exception: a quiz that cannot be shown, which the Tutor checks in conversation instead.
          const quiz = map.check(check_id);
          if (quiz?.kind === "quiz" && !(await quizUnavailable(tx, map, quiz)))
            return { ok: false, text: `Check ${check_id} is a quiz, so it is marked by code from the Learner's answers. Nothing was recorded; ask the Learner to submit the quiz.` };
          // Pacing rule, for the Check that is being taken; any other verdict gets the Course Navigator's own reason below.
          const at = navigate(map, await loadProgress(tx, learnerId));
          if (at?.step === "check" && at.check?.id === check_id && (await stepBeganThisTurn(tx))) return { ok: false, text: VERDICT_PACING_REJECTION };
          const passed = verdict === "pass";
          const before = navigate(map, await loadProgress(tx, learnerId));
          const saved = await saveCheckResult(tx, map, { checkId: check_id, passed, evidence: reasons, model, toolCallId: context!.toolUse.id }, now(), learnerId);
          if (!saved.ok) return { ok: false, text: saved.reason };
          const recorded = passed
            ? `Recorded by code: pass for Check ${check_id}.`
            : `Recorded by code: not yet for Check ${check_id}. The Learner stays at this Check and can try again.`;
          // The Learner sees the result in the conversation: a card after the reply that recorded it, never sent to the model.
          const card = await storeAfterLatest(tx, verdictCard(map, check_id, passed));
          // A pass moves the Learner on: the divider for their new step follows the card (none once the Topic is passed).
          const divider = passed ? await storeStepDivider(tx, before, await loadProgress(tx, learnerId)) : [];
          const items = [card, ...divider].filter((i) => i !== null);
          return { ok: true, began: passed, text: `${recorded}\n\n${await contextAfterMove(tx, before)}`, ...(items.length && { items }) };
        }),
    },
    record_insight_attempt: {
      parse: (input) => insightInput.parse(input),
      run: ({ outcome, learner_words }, context) =>
        once(context?.toolUse.id, "record_insight_attempt", async (tx) => {
          const [turn] = await tx.select().from(turns).where(eq(turns.id, turnId));
          const message = turn?.input ?? "";
          // An old "Continue.", a note code wrote (Finish this reply's among them) or a help chip is never an attempt,
          // whatever words the Tutor offers; the Just tell me chip only ever asks to be told (ADR 0001).
          const justTellMe = message.trim() === JUST_TELL_ME;
          if (message.trim() === OLD_CONTINUE_TEXT || isCodeWritten(message) || (turn && turnKind(turn) === "chip" && !justTellMe)) {
            return { ok: false, text: NOT_THE_LEARNERS_ATTEMPT };
          }
          // Pacing rule: the Learner must have seen the question before an attempt can count.
          if (navigate(map, await loadProgress(tx, learnerId))?.step === "explore" && (await stepBeganThisTurn(tx))) return { ok: false, text: INSIGHT_PACING_REJECTION };
          const saved = await saveInsightAttempt(
            tx,
            map,
            { reported: justTellMe ? "asked_to_be_told" : outcome, words: learner_words, learnerMessage: message, toolCallId: context!.toolUse.id, model, turnId },
            now(),
            learnerId,
          );
          if (!saved.ok) return { ok: false, text: saved.reason };
          const written = `Written Insight: ${saved.insight.written.trim()}`;
          const quoted = `The Learner's words, saved: "${saved.words}".`;
          if (saved.released === "found") {
            return {
              ok: true,
              text: `Recorded by code: the Learner found the Insight. ${quoted}\n${written}\nConfirm it against the Learner's own words: quote what they said, and say plainly what makes it right. You can finish the explore step with finish_teaching_step once you have confirmed. ${WRITE_AFTER}`,
            };
          }
          if (saved.released === "told") {
            return {
              ok: true,
              // Telling the Insight begins a new moment for the Learner, so the pacing rule keeps explore open for the rest of this turn.
              began: true,
              text: `Recorded by code: the Insight is told. ${quoted}\n${written}\nTell the Learner the Insight in your own words, kindly and without any sense of failure, and link it to what they tried. You cannot finish the explore step in this turn: wait for the Learner to answer, then finish it. ${WRITE_AFTER}`,
            };
          }
          const n = saved.released === "hint_1" ? 1 : 2;
          return {
            ok: true,
            text: `Recorded by code: not yet (hint ${n}). ${quoted}\nHint ${n} for the Learner: ${saved.hint!.trim()}\nGive this hint in your own words, point to what to try in the Widget, and do not state the Insight. ${WRITE_AFTER}`,
          };
        }),
    },
    // The Learner's own rule (spec #229): code checks it is their typed words, then keeps them on the Topic Note.
    save_learner_rule: {
      parse: (input) => ruleInput.parse(input),
      run: ({ learner_words }, context) =>
        once(context?.toolUse.id, "save_learner_rule", async (tx) => {
          const [turn] = await tx.select().from(turns).where(eq(turns.id, turnId));
          const message = turn?.input ?? "";
          // A chip, a note code wrote and the old "Continue." are never the Learner's own words.
          if (!turn || message.trim() === OLD_CONTINUE_TEXT || isCodeWritten(message) || turnKind(turn) !== "message") {
            return { ok: false, text: "Not saved: this turn is not a message the Learner typed. Save a rule only from words they wrote themselves." };
          }
          const words = exactWords(message, learner_words);
          if (!words) return { ok: false, text: "Not saved: those words are not in the Learner's message this turn. Copy their rule exactly as they typed it." };
          if (words.length > MAX_RULE_LENGTH) return { ok: false, text: `Not saved: a saved rule is at most ${MAX_RULE_LENGTH} characters. Copy only the sentence that states the rule.` };
          const [row] = await tx.select({ topicId: sessions.topicId }).from(sessions).where(eq(sessions.id, turn.sessionId ?? -1));
          if (turn.sessionId == null || turn.turnSeq == null || !row?.topicId) return { ok: false, text: "Not saved: this turn has no Topic Session yet." };
          const topicId = row.topicId;
          const rules = (await loadSessionItems(tx, turn.sessionId, learnerId)).flatMap((i) => {
            const rule = ownRuleOf(i);
            return rule && rule.topicId === topicId ? [{ ...rule, afterSeq: i.afterSeq }] : [];
          });
          if (rules.some((r) => r.afterSeq >= turn.turnSeq!)) return { ok: false, text: "Not saved: a rule was already saved in this turn. Save one rule per turn." };
          let skillId: string | null = null;
          const topic = map.topic(topicId);
          if (topic && isConverted(topic)) {
            // The Skill is the one the Learner just got right: code takes it from their latest marked answer, so the Tutor never names one.
            const [answer] = await tx
              .select({ skillId: practiceAnswers.skillId, verdict: practiceAnswers.verdict, createdAt: practiceAnswers.createdAt })
              .from(practiceAnswers)
              .where(and(eq(practiceAnswers.learnerId, learnerId), eq(practiceAnswers.topicId, topicId)))
              .orderBy(desc(practiceAnswers.id))
              .limit(1);
            const [previous] = await tx
              .select({ startedAt: turns.startedAt })
              .from(turns)
              .where(and(eq(turns.sessionId, turn.sessionId), lt(turns.id, turnId)))
              .orderBy(desc(turns.id))
              .limit(1);
            if (!answer || answer.verdict !== "right" || (previous && answer.createdAt <= previous.startedAt)) {
              return { ok: false, text: "Not saved: save the Learner's rule only right after they get a practice answer right. Code has not marked a right answer since your last reply, so teach on without saving." };
            }
            skillId = answer.skillId;
            if (rules.some((r) => r.skillId === skillId)) return { ok: false, text: "Not saved: a rule for this Skill is already on the Learner's notes. Confirm their rule in a sentence without saving it." };
          } else if (rules.length) {
            return { ok: false, text: "Not saved: a rule is already on the Learner's notes for this Topic. Confirm their rule in a sentence without saving it." };
          }
          const saved = await saveOwnRule(tx, { learnerId, topicId, sessionId: turn.sessionId, turnSeq: turn.turnSeq, text: words, skillId }, now());
          const item = { kind: OWN_RULE_SAVED, data: { noteId: saved.id, topicId, text: words, skillId } };
          await saveItemAfterLatest(tx, learnerId, turn.sessionId, item, now());
          return {
            ok: true,
            text: `Saved by code to the Learner's Topic Note: "${words}". The Learner sees "Saved to your notes" with Undo, so don't say you saved it. Confirm their rule in one sentence and use their words from now on.`,
            items: [item],
          };
        }),
    },
    open_widget: {
      parse: (input) => openInput.parse(input),
      run: ({ id, preset }, context) =>
        once(context?.toolUse.id, "open_widget", async (tx) => {
          // The Topic of the Session this turn runs in: its written-ahead Widgets are the ones that can be opened.
          const scope = await replyScope(tx);
          const [row] = await tx.select({ sessionId: turns.sessionId, topicId: sessions.topicId }).from(turns).leftJoin(sessions, eq(sessions.id, turns.sessionId)).where(eq(turns.id, turnId));
          const topicId = row?.topicId ?? navigate(map, await loadProgress(tx, learnerId))?.topic.id;
          const progress = await loadProgress(tx, learnerId);
          const widgets = await loadWrittenAhead(tx, map, progress, topicId);
          const widget = widgets.find((w) => w.id === id);
          if (!widget || row?.sessionId == null) {
            return { ok: false, text: `Not opened: this Topic has no written-ahead Widget "${id}". Its written-ahead Widgets: ${widgets.map((w) => w.id).join(", ") || "none"}.` };
          }
          // Code holds the sequence (ADR 0001): the explore Widget reaches the Learner only once the explore step begins.
          const topic = topicId ? map.topic(topicId) : undefined;
          if (topic && exploreHeldBack(topic, progress.topics[topic.id]) === widget.id) {
            return { ok: false, text: `Not opened: "${widget.title}" is this Topic's explore Widget, which code shows when the explore step begins. Do not open it or draw your own version before then; teach this in words.` };
          }
          // One Widget a reply (ADR 0007), in a Session frozen with the widget engine.
          if (scope?.engine && (await widgetInReply(tx, scope))) return { ok: false, text: ONE_WIDGET.replace("Not shown", "Not opened") };
          // A preset sets its sliders: each must be one of the Widget's, in range and on its step, and none may use an open quiz's numbers.
          const set = preset && Object.keys(preset).length ? normalizePreset(preset) : undefined;
          if (set) {
            const problems = presetProblems(widget.code, set);
            if (problems.length) {
              const sliders = widgetControls(widget.code).sliders;
              return { ok: false, text: `Not opened: ${problems.join(" ")} Its sliders: ${sliders.join("; ") || "none"}. Call open_widget again with a preset that fits, or without one.` };
            }
            const blocked = await openQuizProblems(tx, { kind: "written", id: widget.id, params: set });
            if (blocked.length) return { ok: false, text: `Not opened: ${blocked.join(" ")}` };
          }
          const item = openedItem(widget, set);
          await saveItemAfterLatest(tx, learnerId, row.sessionId, item, now());
          // Opened already set: the preset replaces what the Learner last set, and their ticked Guided Tasks stay.
          let widgetStates: WidgetStateEvent[] | undefined;
          if (set) {
            const saved = await loadWidgetState(tx, row.sessionId, widget.id, learnerId);
            const ticked = effects.pageWidgets?.[widget.id]?.ticked ?? saved?.ticked ?? [];
            const result = await saveOpenedState(tx, learnerId, { sessionId: row.sessionId, widgetKey: widget.id, code: widget.code, preset: set, ticked }, now());
            if (!result.ok) return { ok: false, text: `Not opened: ${result.reason}` };
            widgetStates = [result.event];
          }
          const { sliders, tasks } = widgetControls(widget.code);
          const setTo = set ? ` It is set to ${Object.entries(set).map(([n, v]) => `${n} = ${v}`).join(", ")}.` : "";
          const lines = [
            `Opened by code: "${widget.title}" is in the Widget panel, with a chip where you opened it.${setTo} Point the Learner to it; do not draw a Widget of your own for the same idea. Say in one sentence what it shows at these numbers; do not ask the Learner to move or set anything.`,
            ...(sliders.length ? ["Its sliders:", ...sliders.map((s) => `- ${s}`)] : []),
            ...(tasks.length ? [GUIDED_TASKS, ...tasks.map((t) => `- ${t}`)] : []),
          ];
          return { ok: true, text: lines.join("\n"), items: [item], ...(widgetStates && { widgetStates }) };
        }),
    },
    // The widget engine (ADR 0005): the Tutor chooses a recipe and params, code compiles, checks and stores the Widget.
    // Always bound, whatever the widget_engine setting says, so a Session frozen with it always resumes.
    show_widget: {
      parse: (input) => showInput.parse(input),
      run: ({ recipe: id, params }, context) =>
        once(context?.toolUse.id, "show_widget", async (tx) => {
          if (id === "quick_check") return { ok: false, text: QUICK_CHECK_REFUSAL };
          const recipe = recipeById(id);
          if (!recipe) return { ok: false, text: `Not shown: there is no Widget recipe "${id}". Recipes: ${TUTOR_RECIPE_IDS.join(", ")}.` };
          const built = recipe.build(params);
          if (!built.ok) return { ok: false, text: `Not shown: these params do not fit the ${id} recipe. ${built.error}. Call show_widget again with params that fit, or teach this in words.` };
          const scope = await replyScope(tx);
          if (!scope) return { ok: false, text: "Not shown: this turn has no Session yet." };
          if (await widgetInReply(tx, scope)) return { ok: false, text: ONE_WIDGET };
          // An Illustration only where no input or Case Data path covers the same number.
          const covered = illustrationProblems(id, built.params);
          if (covered.length) return { ok: false, text: `Not shown: ${covered.join(" ")} Call show_widget again without it, or teach this in words.` };
          // Real figures only from Case Data the as-of rule allows the Learner now (ADR 0003).
          const allowed = await allowedRefs(tx);
          const unknown = built.refs.filter((ref) => !allowed.has(ref));
          if (unknown.length) {
            return { ok: false, text: `Not shown: ${unknown.join(", ")} ${unknown.length > 1 ? "are" : "is"} not in the Case Data code sent for this step. Use a reference from that list, or teach this in words.` };
          }
          const problems = await shownProblems(tx, scope, built.code);
          if (problems.length) return { ok: false, text: `Not shown: ${problems.join(" ")}` };
          // An open quiz keeps its numbers: the recipe's inputs may not use them.
          const blocked = await openQuizProblems(tx, { kind: "recipe", id, params: built.params });
          if (blocked.length) return { ok: false, text: `Not shown: ${blocked.join(" ")}` };
          const data: ShownWidget = { id: context!.toolUse.id, recipe: id, params: built.params, title: built.title, code: built.code, source: "recipe" };
          const outcome = await storeShown(tx, scope, data, `Shown by code: "${built.title}" is in the Widget panel, with a chip where you called show_widget. ${TALK_ABOUT_IT}`);
          // A title the Learner already has saved state for opens at the recipe's own numbers, not where they last left it.
          const key = widgetKey(built.title);
          const had = key ? (effects.pageWidgets?.[key] ?? (await loadWidgetState(tx, scope.sessionId, key, learnerId))) : undefined;
          if (!key || !had) return outcome;
          const reset = await saveOpenedState(tx, learnerId, { sessionId: scope.sessionId, widgetKey: key, code: built.code, ticked: had.ticked }, now());
          return reset.ok ? { ...outcome, widgetStates: [reset.event] } : outcome;
        }),
    },
    // The free-form lane (UX audit ★.4): the compose model writes the Widget within 12 s, outside the transaction, and
    // `once` checks and stores it (or the closest recipe). A repeat or a resume finds the saved result and never asks
    // the model again.
    compose_widget: {
      parse: (input) => composeInput.parse(input),
      run: async (input: ComposeInput, context) => {
        const toolCallId = context?.toolUse.id;
        if (!toolCallId) throw new Error("Missing tool call ID.");
        const [done] = await db.select({ id: toolCalls.toolCallId }).from(toolCalls).where(eq(toolCalls.toolCallId, toolCallId));
        let composed: Composed | null = null;
        const scope = done ? null : await replyScope(db);
        if (scope && !(await widgetInReply(db, scope))) {
          const { composeModel } = await readSettings(db);
          composer ??= { client: anthropicComposeClient() };
          composed = await composeProgram(composer.client, {
            model: composeModel,
            brief: input.brief,
            archetype: input.archetype,
            mustUse: input.mustUse,
            limitMs: composeLimitMs(effects.deadline, performance.now(), composer.limitMs),
            stop: effects.stop,
          });
          // The compose model's call is an extra step of the turn: its tokens and cost count in the turn's usage.
          const spent = composed;
          if (spent.ms > 0 || spent.usage) {
            const stopReason = spent.ok ? spent.stopReason : (spent.stopReason ?? spent.reason);
            await effects
              .saveStep?.(composeModel, (n) => stepUsage(composeModel, n, spent.usage, ["compose_widget"], spent.ms, stopReason))
              .catch((e) => console.error("compose_widget could not save its usage", e));
          }
        }
        return once(toolCallId, "compose_widget", (tx) => showComposed(tx, toolCallId, input, composed));
      },
    },
    // Moves the sliders of a Widget already open (UX audit ★.4): saves its state and tells the browser. It never ticks a
    // Guided Task: they tick themselves from their conditions as the sliders move.
    update_widget: {
      parse: (input) => updateInput.parse(input),
      run: ({ key, values }: z.output<typeof updateInput>, context) =>
        once(context?.toolUse.id, "update_widget", async (tx) => {
          const scope = await replyScope(tx);
          if (!scope) return { ok: false, text: "Not updated: this turn has no Session yet." };
          const drawn = drawnWidgets(replyTexts(scope.rows), scope.items);
          const open = await openWidgetsForTurn(tx, map, learnerId, drawn, false, { id: scope.sessionId, topicId: scope.topicId });
          const widget = open.find((w) => w.key === key.trim());
          if (!widget) return { ok: false, text: `Not updated: no open Widget has the key "${key}". Open Widgets: ${open.map((w) => `"${w.key}"`).join(", ") || "none"}.` };
          // One Widget a reply: this one must be the reply's own, unless the reply has none yet.
          if (scope.engine) {
            const { slots, keys } = await replyWidgets(tx, scope);
            if (slots > 0 && !keys.has(widget.key)) return { ok: false, text: ONE_WIDGET.replace("Not shown", "Not updated") };
          }
          const ranges = sliderSpecs(widget.code);
          const problems: string[] = [];
          const set: Record<string, number> = {};
          for (const [raw, value] of Object.entries(values)) {
            const name = raw.startsWith("$") ? raw : `$${raw}`;
            const range = ranges.get(name);
            if (!range) problems.push(`${name} is not one of its sliders.`);
            else if (!Number.isFinite(value) || value < range.min || value > range.max) problems.push(`${name} must be from ${range.min} to ${range.max}.`);
            else set[name] = value;
          }
          if (!Object.keys(values).length) problems.push("Give at least one slider value.");
          if (problems.length) {
            const sliders = [...ranges].map(([n, r]) => `${n} (${r.min} to ${r.max})`).join(", ") || "none";
            return { ok: false, text: `Not updated: ${problems.join(" ")} Its sliders: ${sliders}.` };
          }
          // Its sliders where the Learner left them (the page's state over what was saved), with the new values over those.
          const saved = await loadWidgetState(tx, scope.sessionId, widget.key, learnerId);
          const page = effects.pageWidgets?.[widget.key];
          const current = { ...declaredSettings(widget.code), ...saved?.values, ...page?.values };
          const merged = { ...Object.fromEntries(Object.entries(current).filter(([n]) => ranges.has(n))), ...set };
          // Ticks stay as they were: Guided Tasks tick themselves from their conditions.
          const ticked = page?.ticked ?? saved?.ticked ?? [];
          // An open quiz keeps its numbers.
          const blocked = await openQuizProblems(tx, { kind: "written", id: widget.key, params: set });
          if (blocked.length) return { ok: false, text: `Not updated: ${blocked.join(" ")}` };
          const result = await saveWidgetState(tx, { sessionId: scope.sessionId, widgetKey: widget.key, values: merged, ticked }, learnerId, now());
          if (!result.ok) return { ok: false, text: `Not updated: ${result.reason}` };
          const moved = Object.entries(set).map(([n, v]) => `${n} = ${v}`).join(", ");
          return {
            ok: true,
            text: `Updated by code: "${widget.key}" now shows ${moved}. Its Guided Tasks are optional play and tick themselves from what it shows. Say in one sentence what changed on screen at these numbers; do not ask the Learner to move or set anything.`,
            widgetStates: [{ type: "widget_state", widgetKey: widget.key, values: merged }],
          };
        }),
    },
    finish_teaching_step: {
      parse: (input) => finishInput.parse(input),
      run: ({ step }, context) =>
        once(context?.toolUse.id, "finish_teaching_step", async (tx) => {
          if (await stepBeganThisTurn(tx)) return { ok: false, text: PACING_REJECTION };
          const before = navigate(map, await loadProgress(tx, learnerId));
          const move = await saveFinishedStep(tx, map, step, now(), learnerId);
          if (!move.ok) return { ok: false, text: move.reason };
          // The Learner sees where the next step begins: a divider after the reply that finished this one.
          // None once the Topic is passed; its Topic complete card marks that.
          const items = await storeStepDivider(tx, before, move.progress);
          return { ok: true, began: true, text: await contextAfterMove(tx, before), ...(items.length && { items }) };
        }),
    },
    // Start again (spec #229, ticket #245): in a converted Topic, code re-posts its Concept cards in order, then its first
    // Quick try. The step and any open quiz attempt stay where they are.
    start_again: {
      parse: (input) => z.object({}).passthrough().parse(input ?? {}),
      run: (_input, context) =>
        once(context?.toolUse.id, "start_again", async (tx) => {
          const [turn] = await tx.select({ sessionId: turns.sessionId }).from(turns).where(eq(turns.id, turnId));
          const items = turn?.sessionId == null ? null : await startAgainItems(tx, map, learnerId, turn.sessionId, now());
          if (!items) return { ok: false, text: START_AGAIN_REFUSAL };
          return {
            ok: true,
            text: "Started again by code: the Learner now sees this Topic's Concept cards again, in order, then its first Quick try. Their step and any open quiz stay as they were. Add one sentence that points to the first card, and one ask. Do not repeat the cards' words.",
            items,
          };
        }),
    },
  }, effects);
}

/**
 * Pairs each saved tool definition with the code that runs it. Definitions are
 * replayed exactly as saved; only the run function comes from the current build.
 */
export function bindTools(definitions: ToolDefinition[], code: Record<string, ToolCode>): BetaRunnableTool[] {
  return definitions.map((d) => {
    // A server tool (hosted code execution) has a `type` and nothing for us to run.
    if ("type" in d) return d as unknown as BetaRunnableTool;
    const impl = code[d.name];
    if (!impl) throw new Error(`No implementation for saved tool ${d.name}`);
    return { ...d, ...impl } as unknown as BetaRunnableTool;
  });
}

export type ToolUse = { type: "tool_use"; id: string; name: string; input: unknown };

/** Tool calls in the last stored reply that have no stored result yet. */
export function unansweredToolCalls(msgs: BetaMessageParam[]): ToolUse[] {
  const last = msgs.at(-1);
  if (last?.role !== "assistant" || !Array.isArray(last.content)) return [];
  return last.content.filter((b): b is ToolUse => b.type === "tool_use");
}

/**
 * Runs saved tool calls that have no saved result (the turn was cut off between running a
 * tool and saving its result), under their own tool call IDs. Written tools return their
 * saved result without a second effect. Returns the tool_result blocks, as Tool Runner makes them.
 */
export async function rerunToolCalls(uses: ToolUse[], code: Record<string, ToolCode>) {
  const results = [];
  for (const use of uses) {
    const impl = code[use.name];
    try {
      if (!impl) throw new Error(`Unknown tool ${use.name}`);
      const content = await impl.run(impl.parse(use.input), { toolUse: use, toolUseBlock: use } as never);
      results.push({ type: "tool_result" as const, tool_use_id: use.id, content });
    } catch (e) {
      results.push({ type: "tool_result" as const, tool_use_id: use.id, content: `Error: ${(e as Error).message}`, is_error: true });
    }
  }
  return results;
}
