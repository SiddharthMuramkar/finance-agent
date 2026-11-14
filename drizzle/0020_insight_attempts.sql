CREATE TABLE "insight_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"reported" text NOT NULL,
	"released" text NOT NULL,
	"words" text NOT NULL,
	"model" text,
	"turn_id" integer,
	"tool_call_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "insight_attempts_tool_call" ON "insight_attempts" USING btree ("tool_call_id");--> statement-breakpoint
CREATE INDEX "insight_attempts_topic" ON "insight_attempts" USING btree ("topic_id");