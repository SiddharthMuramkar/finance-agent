CREATE TABLE "model_comparison_answers" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"question_id" text NOT NULL,
	"source" text NOT NULL,
	"model" text NOT NULL,
	"turns" jsonb NOT NULL,
	"answer" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_tokens" integer NOT NULL,
	"cache_write_tokens" integer NOT NULL,
	"turn_count" integer NOT NULL,
	"cost_usd" numeric(12, 6) NOT NULL,
	"duration_ms" integer NOT NULL,
	"correctness" text NOT NULL,
	"give_away" text NOT NULL,
	"past_only" text NOT NULL,
	"reasons" text NOT NULL,
	"grader_cost_usd" numeric(12, 6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "model_comparison_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"models" jsonb NOT NULL,
	"grader_model" text NOT NULL,
	"fingerprint" text NOT NULL,
	"report" text NOT NULL,
	"recommendation" text NOT NULL,
	"total_cost_usd" numeric(12, 6) NOT NULL
);
--> statement-breakpoint
ALTER TABLE "model_comparison_answers" ADD CONSTRAINT "model_comparison_answers_run_id_model_comparison_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."model_comparison_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "model_comparison_answer_unique" ON "model_comparison_answers" USING btree ("run_id","question_id","model");