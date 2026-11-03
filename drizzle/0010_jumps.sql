ALTER TABLE "learner_state" ADD COLUMN "entered_by_jump" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "turns" ADD COLUMN "entered_by_jump" boolean DEFAULT false NOT NULL;