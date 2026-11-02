import { boolean, integer, jsonb, numeric, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** Settings stored in SQL, such as the Tutor's model and effort. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/**
 * One Session: the instructions, tool definitions, model and effort frozen at
 * Session start. Every request in the Session replays these exact values.
 */
export const sessions = pgTable("sessions", {
  id: serial("id").primaryKey(),
  instructions: text("instructions").notNull(),
  tools: jsonb("tools").notNull().$type<unknown[]>(),
  model: text("model").notNull(),
  effort: text("effort").notNull(),
  fingerprint: text("fingerprint").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Add-only history. Content is stored exactly as sent or received. */
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id),
    seq: integer("seq").notNull(),
    role: text("role").notNull().$type<"user" | "assistant" | "system">(),
    content: jsonb("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("messages_session_seq").on(t.sessionId, t.seq)],
);

/**
 * Learner Memory: the Learner's place. One row (id 1) holding the current Topic;
 * null means "follow the default path".
 */
export const learnerState = pgTable("learner_state", {
  id: integer("id").primaryKey(),
  currentTopicId: text("current_topic_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Learner Memory: one row per Topic the Learner has started. */
export const topicProgress = pgTable("topic_progress", {
  topicId: text("topic_id").primaryKey(),
  step: text("step").notNull(),
  revealShown: boolean("reveal_shown").notNull().default(false),
  status: text("status").notNull().$type<"in_progress" | "passed">(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Learner Memory: every Check result, kept even if the Check is later removed from the Course Map. */
export const checkResults = pgTable(
  "check_results",
  {
    id: serial("id").primaryKey(),
    topicId: text("topic_id").notNull(),
    checkId: text("check_id").notNull(),
    passed: boolean("passed").notNull(),
    /** The Tutor's reasons for a conversation Check verdict. */
    evidence: text("evidence"),
    /** The model that taught the Check, when a Tutor turn recorded it. */
    model: text("model"),
    /** The tool call that wrote this result; a repeated call has no second effect. */
    toolCallId: text("tool_call_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("check_results_tool_call").on(t.toolCallId)],
);

/** Learner Memory: misconceptions the Tutor noticed, per Topic (and Check, when one was current). */
export const misconceptions = pgTable(
  "misconceptions",
  {
    id: serial("id").primaryKey(),
    topicId: text("topic_id").notNull(),
    checkId: text("check_id"),
    description: text("description").notNull(),
    /** The model that noticed it. */
    model: text("model").notNull(),
    toolCallId: text("tool_call_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("misconceptions_tool_call").on(t.toolCallId)],
);

/**
 * What the model cost. One "step" row per Tool Runner loop step and one "turn" row per Tutor turn
 * (the sum of its steps). `turnSeq` is the seq of the Learner's message that began the turn.
 * Kept in SQL so cost history outlives Vercel's short log retention.
 */
export const usageRows = pgTable(
  "usage",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id),
    turnSeq: integer("turn_seq").notNull(),
    kind: text("kind").notNull().$type<"turn" | "step">(),
    /** 1, 2, ... for step rows; null for the turn row. */
    step: integer("step"),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull(),
    cacheWriteTokens: integer("cache_write_tokens").notNull(),
    /** Output tokens spent on reasoning, when the API reports them. */
    thinkingTokens: integer("thinking_tokens"),
    tools: jsonb("tools").notNull().$type<string[]>(),
    stopReason: text("stop_reason"),
    durationMs: integer("duration_ms").notNull(),
    /** US dollars; null when the model has no row in the price table. */
    costUsd: numeric("cost_usd", { precision: 12, scale: 6, mode: "number" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("usage_turn_kind_step").on(t.sessionId, t.turnSeq, t.kind, t.step)],
);
