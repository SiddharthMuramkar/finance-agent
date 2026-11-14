CREATE TABLE "question_bank" (
	"id" text PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"bank_title" text NOT NULL,
	"topic" text NOT NULL,
	"kind" text NOT NULL,
	"prompt" text NOT NULL,
	"context" text,
	"choices" jsonb,
	"answer" text NOT NULL,
	"explanation" text NOT NULL,
	"licence" text NOT NULL,
	"credit" text NOT NULL,
	"source_url" text NOT NULL,
	"upstream_review" text NOT NULL,
	"verified" boolean DEFAULT false NOT NULL,
	"verified_note" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "question_bank_source_idx" ON "question_bank" USING btree ("source","bank_title");