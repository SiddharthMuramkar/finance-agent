CREATE TABLE "check_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"check_id" text NOT NULL,
	"passed" boolean NOT NULL,
	"evidence" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "learner_state" (
	"id" integer PRIMARY KEY NOT NULL,
	"current_topic_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "topic_progress" (
	"topic_id" text PRIMARY KEY NOT NULL,
	"step" text NOT NULL,
	"reveal_shown" boolean DEFAULT false NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
