CREATE TABLE "tool_calls" (
	"tool_call_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"result" text NOT NULL,
	"is_error" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turns" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer,
	"turn_seq" integer,
	"status" text NOT NULL,
	"stop_reason" text,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "turns" ADD CONSTRAINT "turns_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "turns_one_running" ON "turns" USING btree ((true)) WHERE status = 'running';