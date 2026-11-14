CREATE TABLE "skip_ahead_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"learner_id" integer NOT NULL,
	"topic_id" text NOT NULL,
	"day" date NOT NULL,
	"questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"answers" jsonb,
	"correct_count" integer,
	"passed" boolean,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tutor_incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"learner_id" integer NOT NULL,
	"session_id" integer NOT NULL,
	"turn_id" integer,
	"kind" text NOT NULL,
	"request_id" text,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "failure_ref" text;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "provider_error" text;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "provider_request_id" text;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "provider_status" integer;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "reply_kind" text;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "first_event_ms" integer;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "first_word_ms" integer;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "total_ms" integer;--> statement-breakpoint
ALTER TABLE "skip_ahead_attempts" ADD CONSTRAINT "skip_ahead_attempts_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_incidents" ADD CONSTRAINT "tutor_incidents_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_incidents" ADD CONSTRAINT "tutor_incidents_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tutor_incidents" ADD CONSTRAINT "tutor_incidents_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "skip_ahead_attempts_one_a_day" ON "skip_ahead_attempts" USING btree ("learner_id","topic_id","day");--> statement-breakpoint
CREATE INDEX "tutor_incidents_kind_created" ON "tutor_incidents" USING btree ("kind","created_at");