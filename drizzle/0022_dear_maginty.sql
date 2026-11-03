CREATE TABLE "library_refresh_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"watermark" text,
	"added" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failed" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "library_refresh_one_running" ON "library_refresh_runs" USING btree ((true)) WHERE status = 'running';