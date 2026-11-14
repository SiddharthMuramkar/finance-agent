CREATE TABLE "pasted_texts" (
	"id" serial PRIMARY KEY NOT NULL,
	"turn_id" integer NOT NULL,
	"session_id" integer,
	"text" text NOT NULL,
	"words" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pasted_texts" ADD CONSTRAINT "pasted_texts_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pasted_texts" ADD CONSTRAINT "pasted_texts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pasted_texts_turn" ON "pasted_texts" USING btree ("turn_id");--> statement-breakpoint
CREATE INDEX "pasted_texts_session" ON "pasted_texts" USING btree ("session_id");