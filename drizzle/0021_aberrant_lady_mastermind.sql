CREATE TABLE "note_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"topic_id" text NOT NULL,
	"kind" text NOT NULL,
	"text" text,
	"session_id" integer,
	"turn_seq" integer,
	"widget_index" integer,
	"widget_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "note_items" ADD CONSTRAINT "note_items_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "note_items_topic" ON "note_items" USING btree ("topic_id");