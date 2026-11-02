-- pgvector for Voyage embeddings (on every Neon plan; PGlite loads it in tests).
CREATE EXTENSION IF NOT EXISTS vector;
--> statement-breakpoint
CREATE TABLE "library_passages" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_id" text NOT NULL,
	"ref" text NOT NULL,
	"heading" text NOT NULL,
	"url" text NOT NULL,
	"published_on" date,
	"text" text NOT NULL,
	"licence" text NOT NULL,
	"credit" text NOT NULL,
	"search" "tsvector" GENERATED ALWAYS AS (to_tsvector('english', heading || ' ' || text)) STORED NOT NULL,
	"embedding" vector(1024),
	"embedded_with" text
);
--> statement-breakpoint
CREATE TABLE "library_sources" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"licence" text NOT NULL,
	"licence_url" text NOT NULL,
	"credit" text NOT NULL,
	"url" text NOT NULL,
	"fetched_on" date NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_passages" ADD CONSTRAINT "library_passages_source_id_library_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."library_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "library_passages_source_ref" ON "library_passages" USING btree ("source_id","ref");--> statement-breakpoint
CREATE INDEX "library_passages_search" ON "library_passages" USING gin ("search");--> statement-breakpoint
-- BM25 keyword ranking through Neon's lakebase_text, where it exists (confirmed on the Free plan, 2 Nov 2026).
-- Elsewhere (PGlite in tests) search ranks with Postgres full-text search on the GIN index above.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'lakebase_text') THEN
    CREATE EXTENSION IF NOT EXISTS lakebase_text;
    EXECUTE 'CREATE INDEX IF NOT EXISTS library_passages_bm25 ON library_passages USING lakebase_bm25 (search) WITH (default_limit = 100, prefilter = true)';
  END IF;
END $$;
