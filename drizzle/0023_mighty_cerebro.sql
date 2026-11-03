CREATE TABLE "learner_profile" (
	"id" integer PRIMARY KEY NOT NULL,
	"work" text,
	"location" text,
	"loan" text,
	"saving_for" text,
	"offer_dismissed" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
