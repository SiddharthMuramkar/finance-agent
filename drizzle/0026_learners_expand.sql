CREATE TABLE "learners" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp with time zone,
	"show_developer_details" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- The owner's Learner, id 1 (OWNER_LEARNER_ID). Every learner_id column below defaults to it, so
-- adding the column gives every existing row to the owner, and so does every insert by code that
-- doesn't name a Learner yet. Likewise every existing Session gets older = true from its default.
INSERT INTO "learners" ("id", "name") VALUES (1, 'owner');--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('"learners"', 'id'), 1);--> statement-breakpoint
CREATE TABLE "session_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"learner_id" integer DEFAULT 1 NOT NULL,
	"session_id" integer NOT NULL,
	"after_seq" integer NOT NULL,
	"kind" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "widget_state" (
	"session_id" integer NOT NULL,
	"widget_key" text NOT NULL,
	"learner_id" integer DEFAULT 1 NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ticked" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "widget_state_session_id_widget_key_pk" PRIMARY KEY("session_id","widget_key")
);
--> statement-breakpoint
ALTER TABLE "check_results" ADD COLUMN "learner_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "insight_attempts" ADD COLUMN "learner_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "learner_profile" ADD COLUMN "learner_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "learner_state" ADD COLUMN "learner_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "learner_state" ADD COLUMN "shown_session_id" integer;--> statement-breakpoint
ALTER TABLE "misconceptions" ADD COLUMN "learner_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "note_items" ADD COLUMN "learner_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "pasted_texts" ADD COLUMN "learner_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "learner_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_cards" ADD COLUMN "learner_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_log" ADD COLUMN "learner_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "learner_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "topic_id" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "older" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "refrozen_at_seq" integer;--> statement-breakpoint
ALTER TABLE "topic_progress" ADD COLUMN "learner_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "learner_id" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_state" ADD CONSTRAINT "widget_state_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "widget_state" ADD CONSTRAINT "widget_state_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "learners_one_active_per_name" ON "learners" USING btree ("name") WHERE "learners"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "session_items_session" ON "session_items" USING btree ("session_id","after_seq");--> statement-breakpoint
ALTER TABLE "check_results" ADD CONSTRAINT "check_results_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insight_attempts" ADD CONSTRAINT "insight_attempts_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_profile" ADD CONSTRAINT "learner_profile_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_state" ADD CONSTRAINT "learner_state_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "learner_state" ADD CONSTRAINT "learner_state_shown_session_id_sessions_id_fk" FOREIGN KEY ("shown_session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "misconceptions" ADD CONSTRAINT "misconceptions_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "note_items" ADD CONSTRAINT "note_items_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pasted_texts" ADD CONSTRAINT "pasted_texts_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD CONSTRAINT "quiz_attempts_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cards" ADD CONSTRAINT "review_cards_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_log" ADD CONSTRAINT "review_log_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_progress" ADD CONSTRAINT "topic_progress_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_one_live_per_topic" ON "sessions" USING btree ("learner_id","topic_id") WHERE "sessions"."older" = false and "sessions"."topic_id" is not null;