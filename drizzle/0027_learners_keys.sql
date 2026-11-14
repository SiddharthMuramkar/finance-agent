-- Per-Learner keys (spec #119, "Keys that change"). Every key below now includes the Learner, so two
-- Learners can each hold the same Topic, quiz attempt number, settled Insight, Review card, saved note
-- item and running turn. Every existing row belongs to the owner, so no existing pair can clash.
--
-- Topic progress: keyed by (Learner, Topic). The code live before this change upserts it on the old
-- one-column key, so between applying this migration and the new code's deploy such a write fails
-- (the Tutor and the quiz both report "not saved" and the Learner can try again).
ALTER TABLE "topic_progress" DROP CONSTRAINT "topic_progress_pkey";--> statement-breakpoint
ALTER TABLE "topic_progress" ADD CONSTRAINT "topic_progress_learner_id_topic_id_pk" PRIMARY KEY("learner_id","topic_id");--> statement-breakpoint
-- The place on the Course Map and the Learner Profile: one row per Learner. Their `id` stays the key
-- the live code upserts on (the Learner's id; the owner's row is 1).
CREATE UNIQUE INDEX "learner_state_one_per_learner" ON "learner_state" USING btree ("learner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "learner_profile_one_per_learner" ON "learner_profile" USING btree ("learner_id");--> statement-breakpoint
-- Quiz attempt numbers count each Learner's own attempts at a Check.
DROP INDEX "quiz_attempts_check_no";--> statement-breakpoint
CREATE UNIQUE INDEX "quiz_attempts_check_no" ON "quiz_attempts" USING btree ("learner_id","check_id","attempt_no");--> statement-breakpoint
-- The Insight is settled once per Learner.
DROP INDEX "insight_attempts_topic";--> statement-breakpoint
DROP INDEX "insight_attempts_settled_once";--> statement-breakpoint
CREATE INDEX "insight_attempts_topic" ON "insight_attempts" USING btree ("learner_id","topic_id");--> statement-breakpoint
CREATE UNIQUE INDEX "insight_attempts_settled_once" ON "insight_attempts" USING btree ("learner_id","topic_id") WHERE "insight_attempts"."released" in ('found', 'told');--> statement-breakpoint
-- One running turn per Learner: another Learner's turn runs alongside.
DROP INDEX "turns_one_running";--> statement-breakpoint
CREATE UNIQUE INDEX "turns_one_running" ON "turns" USING btree ("learner_id") WHERE status = 'running';--> statement-breakpoint
-- A Review card per (Learner, question), and a saved reply or Widget once per Learner and place.
-- Their code is scoped by Learner in a later ticket; the keys change here, with the others.
ALTER TABLE "review_cards" DROP CONSTRAINT "review_cards_pkey";--> statement-breakpoint
ALTER TABLE "review_cards" ADD CONSTRAINT "review_cards_learner_id_question_id_pk" PRIMARY KEY("learner_id","question_id");--> statement-breakpoint
DROP INDEX "note_items_saved_once";--> statement-breakpoint
CREATE UNIQUE INDEX "note_items_saved_once" ON "note_items" USING btree ("learner_id","topic_id","kind",coalesce("session_id", -1),coalesce("turn_seq", -1),coalesce("widget_index", -99)) WHERE "note_items"."kind" <> 'line';
