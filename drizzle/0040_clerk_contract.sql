-- The Clerk contract step (issue #33, PR C). Hand-ordered: drizzle-kit wrote `DROP TABLE "user" CASCADE` before the
-- learners foreign key, and that CASCADE drops the key first, so its own `DROP CONSTRAINT` then fails. Here the column
-- goes first, then each table, children before parents, with no CASCADE: an object nobody knew about fails the
-- migration, which rolls back, rather than being dropped with it. login_failures (the test door) stays.
-- A held lock fails the build after 5 s instead of queueing every query behind it (the migrator runs in one transaction).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "learners" DROP CONSTRAINT "learners_auth_user_id_user_id_fk";--> statement-breakpoint
DROP INDEX "learners_one_active_per_auth_user";--> statement-breakpoint
ALTER TABLE "learners" DROP COLUMN "auth_user_id";--> statement-breakpoint
DROP TABLE "access_denials";--> statement-breakpoint
DROP TABLE "session";--> statement-breakpoint
DROP TABLE "account";--> statement-breakpoint
DROP TABLE "verification";--> statement-breakpoint
DROP TABLE "user";--> statement-breakpoint
DROP TABLE "invites";--> statement-breakpoint
DROP TABLE "rate_limit";--> statement-breakpoint
DROP TABLE "email_link_sends";--> statement-breakpoint
DROP TABLE "model_comparison_answers";--> statement-breakpoint
DROP TABLE "model_comparison_runs";
