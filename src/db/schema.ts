import { integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
