CREATE TABLE "misconceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"check_id" text,
	"description" text NOT NULL,
	"model" text NOT NULL,
	"tool_call_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "check_results" ADD COLUMN "tool_call_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "misconceptions_tool_call" ON "misconceptions" USING btree ("tool_call_id");--> statement-breakpoint
CREATE UNIQUE INDEX "check_results_tool_call" ON "check_results" USING btree ("tool_call_id");