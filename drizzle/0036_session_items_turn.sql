ALTER TABLE "session_items" ADD COLUMN "turn_id" integer;--> statement-breakpoint
ALTER TABLE "session_items" ADD COLUMN "stored_by" text;--> statement-breakpoint
ALTER TABLE "session_items" ADD CONSTRAINT "session_items_turn_id_turns_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turns"("id") ON DELETE set null ON UPDATE no action;