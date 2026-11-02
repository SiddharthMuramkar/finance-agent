import { sql } from "drizzle-orm";
import { boolean, date, doublePrecision, integer, jsonb, numeric, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
  /**
   * True when the Learner entered a Topic by choosing it on the Course Map page or by going back
   * to the default path, and no turn has started since. The next turn tells the Tutor and treats
   * the step as fresh (the pacing rule), because nothing of it has been taught in this conversation.
   */
  enteredByJump: boolean("entered_by_jump").notNull().default(false),
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

/**
 * Learner Memory: one row per quiz attempt. `questionIds` are the questions code chose to show;
 * the answers and marking are filled in when the Learner submits. `reportedAt` is set once the
 * result has been added to the Tutor's history, so each result reaches the Tutor exactly once.
 */
export const quizAttempts = pgTable(
  "quiz_attempts",
  {
    id: serial("id").primaryKey(),
    checkId: text("check_id").notNull(),
    /** 0 for the first attempt at the Check. */
    attemptNo: integer("attempt_no").notNull(),
    questionIds: jsonb("question_ids").notNull().$type<string[]>(),
    answers: jsonb("answers").$type<Record<string, string>>(),
    correctCount: integer("correct_count"),
    passed: boolean("passed"),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reportedAt: timestamp("reported_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("quiz_attempts_check_no").on(t.checkId, t.attemptNo)],
);

/**
 * Case Data: one checked historical dataset of a Case, with its source. Imported from the laptop
 * (`npm run case-data:import`); the app only reads it, through the as-of rule.
 */
export const caseDatasets = pgTable(
  "case_datasets",
  {
    caseId: text("case_id").notNull(),
    datasetId: text("dataset_id").notNull(),
    label: text("label").notNull(),
    unit: text("unit").notNull(),
    /** The credit line shown beside the data. */
    source: text("source").notNull(),
    sourceUrl: text("source_url").notNull(),
    /** When and how the figures were checked against the source. */
    checkedOn: date("checked_on", { mode: "string" }).notNull(),
    checkNote: text("check_note").notNull(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.datasetId] })],
);

/** Case Data: the dated values of a dataset. The as-of rule filters on `date`. */
export const caseDataPoints = pgTable(
  "case_data_points",
  {
    caseId: text("case_id").notNull(),
    datasetId: text("dataset_id").notNull(),
    date: date("date", { mode: "string" }).notNull(),
    value: doublePrecision("value").notNull(),
  },
  (t) => [primaryKey({ columns: [t.caseId, t.datasetId, t.date] })],
);

/**
 * One Tutor turn and its saved status. `running` doubles as the lock: at most one row can be
 * running at a time (a partial unique index), so a second send, from any device, is turned away.
 * A turn cut off by the time limit is `cut_off` and the browser resumes it; `failed` (an API
 * error) is resumed by the Learner's Retry. `sessionId` and `turnSeq` are filled in once the
 * turn knows its Session; `turnSeq` is the seq of the Learner's message that began it.
 */
export const turns = pgTable(
  "turns",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").references(() => sessions.id),
    turnSeq: integer("turn_seq"),
    status: text("status").notNull().$type<"running" | "cut_off" | "finished" | "failed">(),
    /** The last loop step's stop reason once the turn ends (`refusal`, `max_tokens`, ...). */
    stopReason: text("stop_reason"),
    /** What went wrong, for a failed turn. */
    error: text("error"),
    /**
     * True when the Learner's current step began before this turn's reply without being taught:
     * this turn started the Topic, or a quiz pass marked by code since the last turn moved the
     * Learner on. The pacing rule then keeps that step open for this turn. (The column keeps its
     * first name, from when only a Topic start set it.)
     */
    freshStep: boolean("started_topic").notNull().default(false),
    /** True when this turn is the first since the Learner chose a Topic on the Course Map page or went back to the default path. */
    enteredByJump: boolean("entered_by_jump").notNull().default(false),
    /** What the Learner sent (their message, or "Continue."), so a retry can send it again if it was never stored. */
    input: text("input"),
    /** When the current run of the turn started; a resume starts a new run. */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  () => [uniqueIndex("turns_one_running").on(sql`(true)`).where(sql`status = 'running'`)],
);

/**
 * The saved outcome of every tool call that writes, keyed by its tool call ID. Written in the
 * same transaction as the tool's effect, so a repeated or re-run call returns the saved result
 * and has no second effect.
 */
export const toolCalls = pgTable("tool_calls", {
  toolCallId: text("tool_call_id").primaryKey(),
  name: text("name").notNull(),
  result: text("result").notNull(),
  isError: boolean("is_error").notNull(),
  /** The turn that ran it. */
  turnId: integer("turn_id"),
  /** True when the call moved the Learner onto a new Teaching Step, so the pacing rule can see it. */
  beganStep: boolean("began_step").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Spaced review: one FSRS card per quiz question (`ts-fsrs` fields, stored as columns). A question
 * gets its card once its Check is passed. Reviews touch only these tables, never a Topic's status.
 */
export const reviewCards = pgTable("review_cards", {
  questionId: text("question_id").primaryKey(),
  due: timestamp("due", { withTimezone: true }).notNull(),
  stability: doublePrecision("stability").notNull(),
  difficulty: doublePrecision("difficulty").notNull(),
  elapsedDays: integer("elapsed_days").notNull(),
  scheduledDays: integer("scheduled_days").notNull(),
  reps: integer("reps").notNull(),
  lapses: integer("lapses").notNull(),
  learningSteps: integer("learning_steps").notNull(),
  /** The `ts-fsrs` State number (0 new, 1 learning, 2 review, 3 relearning). */
  state: integer("state").notNull(),
  lastReview: timestamp("last_review", { withTimezone: true }),
});

/** Every rating given to a question. `source` "review" rows are the ones the per-Session cap counts. */
export const reviewLog = pgTable("review_log", {
  id: serial("id").primaryKey(),
  questionId: text("question_id").notNull(),
  /** 1 Again, 3 Good. */
  rating: integer("rating").notNull(),
  source: text("source").notNull().$type<"quiz" | "review">(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
});
