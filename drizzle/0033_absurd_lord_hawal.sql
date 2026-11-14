CREATE TABLE "topic_restarts" (
	"id" serial PRIMARY KEY NOT NULL,
	"learner_id" integer NOT NULL,
	"topic_id" text NOT NULL,
	"session_id" integer,
	"attempt_no" integer NOT NULL,
	"restarted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "topic_restarts_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "restarted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "topic_restarts" ADD CONSTRAINT "topic_restarts_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "topic_restarts" ADD CONSTRAINT "topic_restarts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "topic_restarts_learner_topic" ON "topic_restarts" USING btree ("learner_id","topic_id");