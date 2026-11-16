CREATE TABLE "own_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"learner_id" integer NOT NULL,
	"company" text NOT NULL,
	"market" text NOT NULL,
	"report_date" date NOT NULL,
	"inputs" jsonb NOT NULL,
	"estimate" jsonb NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "own_cases" ADD CONSTRAINT "own_cases_learner_id_learners_id_fk" FOREIGN KEY ("learner_id") REFERENCES "public"."learners"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "own_cases_learner" ON "own_cases" USING btree ("learner_id");