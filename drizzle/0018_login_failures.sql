CREATE TABLE "login_failures" (
	"id" serial PRIMARY KEY NOT NULL,
	"ip" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_failures_at" ON "login_failures" USING btree ("at");