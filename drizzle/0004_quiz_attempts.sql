CREATE TABLE "quiz_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"check_id" text NOT NULL,
	"attempt_no" integer NOT NULL,
	"question_ids" jsonb NOT NULL,
	"answers" jsonb,
	"correct_count" integer,
	"passed" boolean,
	"submitted_at" timestamp with time zone,
	"reported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_check_no" ON "quiz_attempts" USING btree ("check_id","attempt_no");