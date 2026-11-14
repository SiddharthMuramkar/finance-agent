ALTER TABLE "tool_calls" ADD COLUMN "turn_id" integer;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD COLUMN "began_step" boolean DEFAULT false NOT NULL;