CREATE TABLE "review_cards" (
	"question_id" text PRIMARY KEY NOT NULL,
	"due" timestamp with time zone NOT NULL,
	"stability" double precision NOT NULL,
	"difficulty" double precision NOT NULL,
	"elapsed_days" integer NOT NULL,
	"scheduled_days" integer NOT NULL,
	"reps" integer NOT NULL,
	"lapses" integer NOT NULL,
	"learning_steps" integer NOT NULL,
	"state" integer NOT NULL,
	"last_review" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "review_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"question_id" text NOT NULL,
	"rating" integer NOT NULL,
	"source" text NOT NULL,
	"reviewed_at" timestamp with time zone NOT NULL
);
