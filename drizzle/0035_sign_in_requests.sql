CREATE TABLE "access_denials" (
	"user_id" text PRIMARY KEY NOT NULL,
	"denied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_link_sends" (
	"id" serial PRIMARY KEY NOT NULL,
	"email_hash" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
ALTER TABLE "access_denials" ADD CONSTRAINT "access_denials_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "email_link_sends_hash_sent" ON "email_link_sends" USING btree ("email_hash","sent_at");--> statement-breakpoint
CREATE INDEX "email_link_sends_sent" ON "email_link_sends" USING btree ("sent_at");