CREATE TABLE "usage" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"turn_seq" integer NOT NULL,
	"kind" text NOT NULL,
	"step" integer,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"output_tokens" integer NOT NULL,
	"cache_read_tokens" integer NOT NULL,
	"cache_write_tokens" integer NOT NULL,
	"thinking_tokens" integer,
	"tools" jsonb NOT NULL,
	"stop_reason" text,
	"duration_ms" integer NOT NULL,
	"cost_usd" numeric(12, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "usage_turn_kind_step" ON "usage" USING btree ("session_id","turn_seq","kind","step");