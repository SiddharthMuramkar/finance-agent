import { sql } from "drizzle-orm";
import { boolean, customType, date, doublePrecision, index, integer, jsonb, numeric, pgTable, primaryKey, serial, text, timestamp, uniqueIndex, vector } from "drizzle-orm/pg-core";

/** Settings stored in SQL, such as the Tutor's model and effort. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

/** The owner's Learner, made by the expand migration, which gave it every row from before Learners. */
export const OWNER_LEARNER_ID = 1;

// Better Auth's four core tables (Google sign-in, ADR 0011), as `auth generate` makes them for Drizzle
// on Postgres: text ids, kept apart from `learners`. Better Auth reads and writes them; our code only
// reads `user` through `learners.auth_user_id`.

/** One Google account that has signed in (Better Auth's `user`). Made only when the invite gate lets it through. */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/** One signed-in browser (Better Auth's `session`); sign-out deletes the row. */
export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_userId_idx").on(t.userId)],
);

/** The provider side of a `user` (for us, always Google). */
export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("account_userId_idx").on(t.userId)],
);

/** Short-lived values Better Auth checks once (the OAuth state of a sign-in in progress). */
export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/**
 * One Learner: a person with their own Learner Profile, progress, Notes, Sessions and Widget state.
 * A name (from the passcode list) signs in as its one active Learner; Start over archives that
 * Learner and makes a fresh one under the same name, so at most one per name is not archived.
 * A Learner made through Google sign-in carries its Google user in `auth_user_id`.
 */
export const learners = pgTable(
  "learners",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    /** Set by Start over; an archived Learner is kept whole but can no longer sign in. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    /** Settings > Show developer details: "Under the hood" under each reply. Off by default. */
    showDeveloperDetails: boolean("show_developer_details").notNull().default(false),
    /** The Google user (Better Auth `user.id`) this Learner belongs to; null for a passcode Learner. */
    authUserId: text("auth_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("learners_one_active_per_name").on(t.name).where(sql`${t.archivedAt} is null`),
    uniqueIndex("learners_one_active_per_auth_user")
      .on(t.authUserId)
      .where(sql`${t.archivedAt} is null and ${t.authUserId} is not null`),
  ],
);

/**
 * The invite list (ADR 0011): the emails that may become a Learner through Google while the Sign-up
 * switch (`signup_open`) is off. `email` is stored lowercase and trimmed. `learner_name` links an
 * existing Learner by name (the owner's email names `owner`), because ids differ per database.
 */
export const invites = pgTable("invites", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  learnerName: text("learner_name"),
  invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
  note: text("note"),
});

/**
 * The Learner a row belongs to. It has no default (the contract step of spec #119 dropped the
 * owner's), so a row written without a Learner is refused by the database.
 */
const learnerId = () =>
  integer("learner_id")
    .notNull()
    .references(() => learners.id);

/**
 * One Session: the instructions, tool definitions, model and effort frozen at
 * Session start. Every request in the Session replays these exact values.
 *
 * A Topic Session (ADR 0004) has its Topic and is live (`older` false): at most one live Session
 * per Learner and Topic. Every Session from before one Session per Topic is Older: read-only, and
 * possibly holding several Topics. `older` defaults to true so a Session made by code that doesn't
 * know about Topics is Older too; code that makes a Topic Session sets it to false.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: serial("id").primaryKey(),
    learnerId: learnerId(),
    instructions: text("instructions").notNull(),
    tools: jsonb("tools").notNull().$type<unknown[]>(),
    model: text("model").notNull(),
    effort: text("effort").notNull(),
    fingerprint: text("fingerprint").notNull(),
    /** The Topic this Session teaches; null for an Older Session and for the every-Topic-passed Session. */
    topicId: text("topic_id"),
    older: boolean("older").notNull().default(true),
    /** The seq of the first message after the instructions were last refrozen on a deploy; null if never. */
    refrozenAtSeq: integer("refrozen_at_seq"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("sessions_one_live_per_topic")
      .on(t.learnerId, t.topicId)
      .where(sql`${t.older} = false and ${t.topicId} is not null`),
  ],
);

/**
 * jsonb read back as the driver returns it. Both drivers (neon-serverless in the app, PGlite in tests) already parse
 * jsonb, and drizzle's own jsonb parses a string once more: a Learner's stored "0.8" came back as the number 0.8,
 * which the API refuses as message content.
 */
const storedJson = customType<{ data: unknown; driverData: unknown }>({
  dataType: () => "jsonb",
  toDriver: (value) => JSON.stringify(value),
});

/** Add-only history. Content is stored, and read back, exactly as sent or received. */
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id),
    seq: integer("seq").notNull(),
    role: text("role").notNull().$type<"user" | "assistant" | "system">(),
    content: storedJson("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("messages_session_seq").on(t.sessionId, t.seq)],
);

/**
 * Learner Memory: the Learner's place on the Course Map. One row per Learner, holding the current
 * Topic; null means "follow the default path". `id` is the Learner's id (the owner's row is id 1).
 */
export const learnerState = pgTable(
  "learner_state",
  {
    id: integer("id").primaryKey(),
    learnerId: learnerId(),
    currentTopicId: text("current_topic_id"),
    /** The Session the Study Workspace shows (a passed Topic's stays shown until the Learner chooses where to go). */
    shownSessionId: integer("shown_session_id").references(() => sessions.id),
    /**
     * No longer written or read: the old pending switch, which carried a chosen Topic to the next turn.
     * Choosing a Topic now shows its Session at once and the opener teaches it. Kept until a contract migration drops it.
     */
    enteredByJump: boolean("entered_by_jump").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("learner_state_one_per_learner").on(t.learnerId)],
);

/** Learner Memory: one row per Learner and Topic the Learner has started. */
export const topicProgress = pgTable(
  "topic_progress",
  {
    topicId: text("topic_id").notNull(),
    learnerId: learnerId(),
    step: text("step").notNull(),
    revealShown: boolean("reveal_shown").notNull().default(false),
    status: text("status").notNull().$type<"in_progress" | "passed">(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.topicId] })],
);

/** Learner Memory: every Check result, kept even if the Check is later removed from the Course Map. */
export const checkResults = pgTable(
  "check_results",
  {
    id: serial("id").primaryKey(),
    learnerId: learnerId(),
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
    learnerId: learnerId(),
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
 * Learner Memory: every attempt at a Topic's Insight at the explore step, with the Learner's exact
 * words. `reported` is what the Tutor judged; `released` is what code did about it (the hint, or
 * the written Insight). A Topic's Insight is settled once a row is released as found or told.
 */
export const insightAttempts = pgTable(
  "insight_attempts",
  {
    id: serial("id").primaryKey(),
    learnerId: learnerId(),
    topicId: text("topic_id").notNull(),
    reported: text("reported").notNull().$type<"found" | "not_yet" | "asked_to_be_told">(),
    released: text("released").notNull().$type<"found" | "hint_1" | "hint_2" | "told">(),
    /** The Learner's words, taken from their message in the turn. */
    words: text("words").notNull(),
    /** The model that taught the step. */
    model: text("model"),
    /** The turn it happened in. */
    turnId: integer("turn_id"),
    /** The tool call that wrote it; a repeated call has no second effect. */
    toolCallId: text("tool_call_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("insight_attempts_tool_call").on(t.toolCallId),
    index("insight_attempts_topic").on(t.learnerId, t.topicId),
    // The Insight is settled once per Learner: their second "found" or "told" for a Topic is refused by the database.
    uniqueIndex("insight_attempts_settled_once")
      .on(t.learnerId, t.topicId)
      .where(sql`${t.released} in ('found', 'told')`),
  ],
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
    learnerId: learnerId(),
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
  // Attempt numbers count each Learner's own attempts at a Check.
  (t) => [uniqueIndex("quiz_attempts_check_no").on(t.learnerId, t.checkId, t.attemptNo)],
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
 * One Tutor turn and its saved status. `running` doubles as the lock: at most one row per Learner
 * can be running at a time (a partial unique index), so the same Learner's second send, from any
 * device, is turned away, while another Learner's turn runs alongside.
 * A turn cut off by the time limit is `cut_off` and the browser resumes it; `failed` (an API
 * error) is resumed by the Learner's Retry. `sessionId` and `turnSeq` are filled in once the
 * turn knows its Session; `turnSeq` is the seq of the Learner's message that began it.
 */
export const turns = pgTable(
  "turns",
  {
    id: serial("id").primaryKey(),
    learnerId: learnerId(),
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
    /** No longer written or read (the old pending switch); kept until a contract migration drops it. */
    enteredByJump: boolean("entered_by_jump").notNull().default(false),
    /**
     * What the Learner sent (their message), or the note code wrote for an opener, a Next or Finish this reply, so a retry
     * can send it again if it was never stored. A code-written note's fixed prefix records the turn's kind (`turnKind`).
     */
    input: text("input"),
    /** When the current run of the turn started; a resume starts a new run. */
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("turns_one_running").on(t.learnerId).where(sql`status = 'running'`)],
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
 * Each Learner has their own card per question.
 */
export const reviewCards = pgTable(
  "review_cards",
  {
    questionId: text("question_id").notNull(),
    learnerId: learnerId(),
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
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.questionId] })],
);

/** Every rating given to a question. `source` "review" rows are the ones the daily cap counts (the last 24 hours, ADR 0004). */
export const reviewLog = pgTable("review_log", {
  id: serial("id").primaryKey(),
  learnerId: learnerId(),
  questionId: text("question_id").notNull(),
  /** 1 Again, 3 Good. */
  rating: integer("rating").notNull(),
  source: text("source").notNull().$type<"quiz" | "review">(),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
});

/** Postgres full-text search terms, kept by the database itself (a generated column). */
const tsvector = customType<{ data: string }>({ dataType: () => "tsvector" });

/**
 * Library: one source the Tutor can search, such as a book or a blog. A `dated` source's passages
 * fall under the as-of rule; a `timeless` reference (a textbook) is always searchable. Loaded from
 * the laptop (`npm run library:load`); the app only reads it.
 */
export const librarySources = pgTable("library_sources", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  kind: text("kind").notNull().$type<"dated" | "timeless">(),
  licence: text("licence").notNull(),
  licenceUrl: text("licence_url").notNull(),
  /** The credit line every search result carries. */
  credit: text("credit").notNull(),
  url: text("url").notNull(),
  /** When the copy in the Library was taken from the source. */
  fetchedOn: date("fetched_on", { mode: "string" }).notNull(),
  /** Set for a source stored whole but quoted only briefly (Damodaran's blog): the most words the Tutor may quote at once. */
  quoteWords: integer("quote_words"),
});

/**
 * Library: one passage, cut from a source by the Library scripts, with its own source, licence,
 * credit and publication date. `search` is its keyword terms (heading and text); `embedding` its
 * Voyage vector, empty until embedded.
 */
export const libraryPassages = pgTable(
  "library_passages",
  {
    id: serial("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => librarySources.id),
    /** Stable key within the source, so a reload updates the same passage. */
    ref: text("ref").notNull(),
    heading: text("heading").notNull(),
    url: text("url").notNull(),
    /** When the passage was published; the as-of rule filters dated sources on it. */
    publishedOn: date("published_on", { mode: "string" }),
    text: text("text").notNull(),
    licence: text("licence").notNull(),
    credit: text("credit").notNull(),
    search: tsvector("search")
      .notNull()
      .generatedAlwaysAs(sql`to_tsvector('english', heading || ' ' || text)`),
    /**
     * The latest year (1900 to 2099) the passage mentions, set by the load. Before a Case's reveal a
     * timeless passage mentioning a year after the as-of date is hidden too, as it may tell the ending.
     */
    latestYear: integer("latest_year"),
    embedding: vector("embedding", { dimensions: 1024 }),
    /** The Voyage model that made the embedding. */
    embeddedWith: text("embedded_with"),
  },
  (t) => [uniqueIndex("library_passages_source_ref").on(t.sourceId, t.ref), index("library_passages_search").using("gin", t.search)],
);

/**
 * Library: one run of the weekly refresh of Damodaran's posts. The log of what each run added and
 * what failed, and the lock: only one row may be `running`, and a run that stays `running` for over
 * ten minutes is marked `failed` by the next run. `watermark` is how far through the blog's
 * updated times the run got, so the next run asks Blogger only for posts changed after it.
 */
export const libraryRefreshRuns = pgTable(
  "library_refresh_runs",
  {
    id: serial("id").primaryKey(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    status: text("status").notNull().$type<"running" | "done" | "failed">(),
    watermark: text("watermark"),
    /** Posts added or changed: ref, title, whether it was an edit, passages and spreadsheet files. */
    added: jsonb("added").notNull().$type<unknown[]>().default(sql`'[]'::jsonb`),
    /** Everything that went wrong: the step and the message. */
    failed: jsonb("failed").notNull().$type<unknown[]>().default(sql`'[]'::jsonb`),
    note: text("note"),
  },
  () => [uniqueIndex("library_refresh_one_running").on(sql`(true)`).where(sql`status = 'running'`)],
);

/**
 * What the model read from a Library picture, kept by the picture's original-size address so each
 * picture is read once, ever. `text` is null when the picture has nothing of substance.
 */
export const libraryPictures = pgTable("library_pictures", {
  url: text("url").primaryKey(),
  text: text("text"),
  model: text("model").notNull(),
  stopReason: text("stop_reason"),
  problems: jsonb("problems").notNull().$type<string[]>().default(sql`'[]'::jsonb`),
  readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
});

/** A Library document (a blog post or a spreadsheet file) and its published and updated times as the source gave them. */
export const libraryDocuments = pgTable(
  "library_documents",
  {
    sourceId: text("source_id")
      .notNull()
      .references(() => librarySources.id),
    ref: text("ref").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sourceId, t.ref] })],
);

/**
 * One run of the model comparison script (npm run compare:models): which models answered, who
 * graded, the written report and the recommendation. Saved from the laptop; the app never reads it.
 */
export const modelComparisonRuns = pgTable("model_comparison_runs", {
  id: serial("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  models: jsonb("models").notNull().$type<string[]>(),
  graderModel: text("grader_model").notNull(),
  /** Hash of the Tutor instructions and tools the models were given. */
  fingerprint: text("fingerprint").notNull(),
  report: text("report").notNull(),
  recommendation: text("recommendation").notNull(),
  /** Everything the run spent, Tutor turns and grading. */
  totalCostUsd: numeric("total_cost_usd", { precision: 12, scale: 6, mode: "number" }).notNull(),
});

/** One model's answer to one question in a comparison run, with its tokens, cost and the grader's three verdicts. */
export const modelComparisonAnswers = pgTable(
  "model_comparison_answers",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => modelComparisonRuns.id),
    questionId: text("question_id").notNull(),
    /** "own" for our questions, "financebench" for the FinanceBench open sample (testing only). */
    source: text("source").notNull(),
    model: text("model").notNull(),
    turns: jsonb("turns").notNull().$type<string[]>(),
    answer: text("answer").notNull(),
    inputTokens: integer("input_tokens").notNull(),
    outputTokens: integer("output_tokens").notNull(),
    cacheReadTokens: integer("cache_read_tokens").notNull(),
    cacheWriteTokens: integer("cache_write_tokens").notNull(),
    /** Tutor turns taken to answer (more than one for a two-step question). */
    turnCount: integer("turn_count").notNull(),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6, mode: "number" }).notNull(),
    durationMs: integer("duration_ms").notNull(),
    /** pass, fail, na (does not apply) or ungraded (grader reply unreadable). */
    correctness: text("correctness").notNull(),
    giveAway: text("give_away").notNull(),
    pastOnly: text("past_only").notNull(),
    reasons: text("reasons").notNull(),
    graderCostUsd: numeric("grader_cost_usd", { precision: 12, scale: 6, mode: "number" }).notNull(),
  },
  (t) => [uniqueIndex("model_comparison_answer_unique").on(t.runId, t.questionId, t.model)],
);

/**
 * The Question Bank: imported human-written questions, kept only in the private database (never in
 * the repo). The ID is permanent and starts with `bank:` so a quiz Check can list it beside the
 * Topic file's own question IDs. `choice` questions are marked by code; `numeric` ones (FinQA) are
 * stored for the Judge Stage and cannot yet be used in a quiz Check. `verified` stays false until a
 * person has checked the key.
 */
export const questionBank = pgTable(
  "question_bank",
  {
    id: text("id").primaryKey(),
    /** Which import it came from: `unipd`, `eab` or `finqa`. */
    source: text("source").notNull(),
    /** The bank or course inside the source, for example "MBA core - Corporate Finance". */
    bankTitle: text("bank_title").notNull(),
    topic: text("topic").notNull(),
    kind: text("kind").notNull().$type<"choice" | "numeric">(),
    prompt: text("prompt").notNull(),
    /** Passage and table a question is asked about (FinQA); null when the prompt stands alone. */
    context: text("context"),
    /** Choices for a `choice` question; null for `numeric`. */
    choices: jsonb("choices").$type<{ id: string; text: string }[]>(),
    /** The right choice ID, or the expected number as written in the source. */
    answer: text("answer").notNull(),
    explanation: text("explanation").notNull(),
    licence: text("licence").notNull(),
    /** The credit line to show with the question. */
    credit: text("credit").notNull(),
    sourceUrl: text("source_url").notNull(),
    /** What the source itself says about the review of this item (for example "self-checked", "draft"). */
    upstreamReview: text("upstream_review").notNull(),
    verified: boolean("verified").notNull().default(false),
    /** Who or what checked the key, and when; set together with `verified`. */
    verifiedNote: text("verified_note"),
    importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("question_bank_source_idx").on(t.source, t.bankTitle)],
);

/**
 * Text the Learner pasted into the workspace (for example the part of a Zitron article being
 * studied). It belongs to the turn that sent it and the Session that turn ran in, is given to the
 * Tutor as marked text appended to the Learner's message, and is never added to the Library.
 * Private: it lives only in this database, never in the repo.
 */
export const pastedTexts = pgTable(
  "pasted_texts",
  {
    id: serial("id").primaryKey(),
    learnerId: learnerId(),
    /** The turn that sent it; one paste per turn, so a retry reuses it. */
    turnId: integer("turn_id")
      .notNull()
      .references(() => turns.id),
    /** Set once the turn has chosen its Session; null only for a turn that failed before that. */
    sessionId: integer("session_id").references(() => sessions.id),
    text: text("text").notNull(),
    words: integer("words").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("pasted_texts_turn").on(t.turnId), index("pasted_texts_session").on(t.sessionId)],
);

/**
 * One row per wrong passcode, kept for a day, so the login can refuse an address (and, past a cap,
 * everyone) that keeps guessing. Holds the caller's address and the time only, never the guess.
 */
export const loginFailures = pgTable(
  "login_failures",
  {
    id: serial("id").primaryKey(),
    ip: text("ip").notNull(),
    at: timestamp("at", { withTimezone: true }).notNull(),
  },
  (t) => [index("login_failures_at").on(t.at)],
);

/**
 * Learner Profile: what the Learner chooses to share about their own life. One row per Learner (the
 * owner's is id 1); every field is optional. It is used only to choose everyday examples. `offerDismissed`
 * was the old first-visit card's "Not now"; the Welcome replaced that card, and nothing reads it now.
 */
export const learnerProfile = pgTable(
  "learner_profile",
  {
    id: integer("id").primaryKey(),
    learnerId: learnerId(),
    work: text("work"),
    location: text("location"),
    loan: text("loan"),
    savingFor: text("saving_for"),
    offerDismissed: boolean("offer_dismissed").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("learner_profile_one_per_learner").on(t.learnerId)],
);

/**
 * The Notes page: the Learner's own lines on a Topic Note (kind "line", text only). Saved replies and
 * Widgets (kinds "reply" and "widget", keyed by Session and turn) use the other columns. A Topic
 * Note's filled-in part is not stored: code builds it on read from the Topic file and the records.
 */
export const noteItems = pgTable(
  "note_items",
  {
    id: serial("id").primaryKey(),
    learnerId: learnerId(),
    topicId: text("topic_id").notNull(),
    kind: text("kind").notNull().$type<"line" | "reply" | "widget" | "own_rule">(),
    /** The Learner's own line, or their own rule the Tutor saved (kind own_rule, with its Session and turn); null for saved replies and Widgets. */
    text: text("text"),
    /** A saved reply or Widget: the Session and the turn (the seq of the Learner's message that began it). */
    sessionId: integer("session_id").references(() => sessions.id),
    turnSeq: integer("turn_seq"),
    /** A saved Widget: which Widget of the reply, and the slider values the Learner had. */
    widgetIndex: integer("widget_index"),
    widgetState: jsonb("widget_state").$type<Record<string, number>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("note_items_topic").on(t.topicId),
    // One saved reply or Widget per Learner and place; the Learner's own lines are many per Topic, so they are left out.
    uniqueIndex("note_items_saved_once")
      .on(t.learnerId, t.topicId, t.kind, sql`coalesce(${t.sessionId}, -1)`, sql`coalesce(${t.turnSeq}, -1)`, sql`coalesce(${t.widgetIndex}, -99)`)
      .where(sql`${t.kind} <> 'line'`),
  ],
);

/**
 * What the Study Workspace draws between messages and never sends to the model: step dividers,
 * "Picking up where you left off" and Due Check dividers, Check result cards, Topic complete
 * cards and Widget opened chips. Each sits after the message with seq `afterSeq` in its Session (-1: before the first).
 */
export const sessionItems = pgTable(
  "session_items",
  {
    id: serial("id").primaryKey(),
    learnerId: learnerId(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id),
    afterSeq: integer("after_seq").notNull(),
    kind: text("kind").notNull(),
    data: jsonb("data").notNull().$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_items_session").on(t.sessionId, t.afterSeq)],
);

/**
 * A Widget's saved work in one Session: its slider values and ticked Guided Tasks, restored on
 * reload and tab switch. The Widget key is the written-ahead Widget's id, or the title of a Widget
 * the Tutor drew.
 */
export const widgetState = pgTable(
  "widget_state",
  {
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id),
    widgetKey: text("widget_key").notNull(),
    learnerId: learnerId(),
    values: jsonb("values").notNull().$type<Record<string, number>>().default(sql`'{}'::jsonb`),
    ticked: jsonb("ticked").notNull().$type<string[]>().default(sql`'[]'::jsonb`),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.widgetKey] })],
);

/**
 * Skill state (spec #229, ticket #232): one Learner's progress on one Skill of a Topic. The repair ladder
 * (`src/teaching/ladder.ts`) reads it to choose what comes next; `src/learner/skill-state.ts` writes it.
 */
export const skillState = pgTable(
  "skill_state",
  {
    learnerId: learnerId(),
    topicId: text("topic_id").notNull(),
    skillId: text("skill_id").notNull(),
    tries: integer("tries").notNull().default(0),
    right: integer("right").notNull().default(0),
    /** Right answers in a row. */
    streak: integer("streak").notNull().default(0),
    /** Misses in a row, across Quick tries and quiz questions; a right answer sets it back to 0. */
    missesInRow: integer("misses_in_row").notNull().default(0),
    /** The tag of the last Known mistake made on this Skill. */
    lastMistake: text("last_mistake"),
    /** Ladder method ids used to teach the Skill again, oldest first. */
    methodsUsed: text("methods_used").array().notNull().default(sql`'{}'::text[]`),
    /** Set when the Learner parks the Skill: it comes back as a drill of five after this time. */
    parkedUntil: timestamp("parked_until", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.learnerId, t.topicId, t.skillId] })],
);

/**
 * Every Quick-try and typed quiz answer, with its item, numbers, answer and verdict. `item_key` names one showing of
 * one item, so the same answer sent twice is stored, and counted in Skill state, once.
 */
export const practiceAnswers = pgTable(
  "practice_answers",
  {
    id: serial("id").primaryKey(),
    learnerId: learnerId(),
    topicId: text("topic_id").notNull(),
    skillId: text("skill_id").notNull(),
    sessionId: integer("session_id").references(() => sessions.id),
    itemKey: text("item_key").notNull(),
    /** The Quick try or quiz question. */
    itemId: text("item_id").notNull(),
    /** The question template the numbers were made from, when code made them. */
    templateId: text("template_id"),
    /** The numbers the item was shown with. */
    params: jsonb("params").notNull().$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    /** What the Learner gave, exactly as typed or picked. */
    input: text("input").notNull(),
    verdict: text("verdict").notNull().$type<"right" | "known_mistake" | "wrong">(),
    /** The Known mistake's tag, for a `known_mistake` verdict. */
    mistakeTag: text("mistake_tag"),
    source: text("source").notNull().$type<"quick_try" | "quiz">(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("practice_answers_once").on(t.learnerId, t.itemKey),
    index("practice_answers_skill").on(t.learnerId, t.topicId, t.skillId),
  ],
);

/**
 * Reply checks (spec #229, ticket #239, ADR 0008): one row per Tutor turn whose reply code held back and changed
 * before the Learner saw it. It keeps the draft's problems and the retry's (with their reasons), the correction code
 * sent, whether the turn retried, fell back or was stopped, the seqs of the rows the Learner never saw (left out of
 * every later request), and the text the Learner saw. Read and written fail-soft (reply-records.ts): a database
 * without this table runs turns as if nothing had been rejected.
 */
export const replyChecks = pgTable(
  "reply_checks",
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => sessions.id),
    /** The seq of the message that began the turn. */
    turnSeq: integer("turn_seq").notNull(),
    /** The words of the reply the Learner saw, and the cap it was held to. */
    words: integer("words").notNull(),
    cap: integer("cap").notNull(),
    draftProblems: jsonb("draft_problems").notNull().$type<{ rule: string; message: string }[]>().default(sql`'[]'::jsonb`),
    retryProblems: jsonb("retry_problems").notNull().$type<{ rule: string; message: string }[]>().default(sql`'[]'::jsonb`),
    correction: text("correction"),
    retried: boolean("retried").notNull().default(false),
    fallback: boolean("fallback").notNull().default(false),
    /** The Learner pressed Stop: the held reply was dropped. */
    stopped: boolean("stopped").notNull().default(false),
    /** Rows of the turn the Learner never saw: the draft's text, the correction message, a failed retry. */
    rejectedSeqs: integer("rejected_seqs").array().notNull().default(sql`'{}'::integer[]`),
    shownText: text("shown_text").notNull(),
    /**
     * The Reply kind code chose for the turn (spec #229: code records the kind it chose); a Learner's own typed message
     * is `answer_question`. Null on rows from before migration 0031, and when code chose none.
     */
    replyKind: text("reply_kind"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("reply_checks_turn").on(t.sessionId, t.turnSeq)],
);
