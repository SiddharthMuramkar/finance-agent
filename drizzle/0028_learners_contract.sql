ALTER TABLE "check_results" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "insight_attempts" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "learner_profile" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "learner_state" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "misconceptions" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "note_items" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "pasted_texts" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "review_cards" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "review_log" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "session_items" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "topic_progress" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "turns" ALTER COLUMN "learner_id" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "widget_state" ALTER COLUMN "learner_id" DROP DEFAULT;