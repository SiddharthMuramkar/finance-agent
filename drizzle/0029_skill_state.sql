CREATE TABLE "practice_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"learner_id" integer NOT NULL,
	"topic_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"session_id" integer,
	"item_key" text NOT NULL,
	"item_id" text NOT NULL,
	"template_id" text,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"input" text NOT NULL,
	"verdict" text NOT NULL,
	"mistake_tag" text,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_state" (
	"learner_id" integer NOT NULL,
	"topic_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"tries" integer DEFAULT 0 NOT NULL,
	"right" integer DEFAULT 0 NOT NULL,
	"streak" integer DEFAULT 0 NOT NULL,
	"misses_in_row" integer DEFAULT 0 NOT NULL,
	"last_mistake" text,
	"methods_used" text[] DEFAULT '{}'::text[] NOT NULL,
	"parked_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "skill_state_learner_id_topic_id_skill_id_pk" PRIMARY KEY("learner_id","topic_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "practice_answers" ADD CONSTRAINT "practice_answers_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_answers" ADD CONSTRAINT "practice_answers_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_state" ADD CONSTRAINT "skill_state_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "practice_answers_once" ON "practice_answers" USING btree ("learner_id","item_key");--> statement-breakpoint
CREATE INDEX "practice_answers_skill" ON "practice_answers" USING btree ("learner_id","topic_id","skill_id");