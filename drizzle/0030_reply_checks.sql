CREATE TABLE "reply_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"session_id" integer NOT NULL,
	"turn_seq" integer NOT NULL,
	"words" integer NOT NULL,
	"cap" integer NOT NULL,
	"draft_problems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"retry_problems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"correction" text,
	"retried" boolean DEFAULT false NOT NULL,
	"fallback" boolean DEFAULT false NOT NULL,
	"stopped" boolean DEFAULT false NOT NULL,
	"rejected_seqs" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"shown_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reply_checks" ADD CONSTRAINT "reply_checks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reply_checks_turn" ON "reply_checks" USING btree ("session_id","turn_seq");