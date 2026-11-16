-- #118 Library licences for a product built to sell. Data only, no schema change (expand-safe: live code reads no Yale row by name).
-- Open Yale Courses' terms bar a tutor service that charges a fee, so the two lecture Sources leave the Library until
-- written permission is on file. Passages first, then their documents, then the Source rows (foreign keys).
DELETE FROM "library_passages" WHERE "source_id" IN ('yale-econ-251', 'yale-econ-252');--> statement-breakpoint
DELETE FROM "library_documents" WHERE "source_id" IN ('yale-econ-251', 'yale-econ-252');--> statement-breakpoint
DELETE FROM "library_sources" WHERE "id" IN ('yale-econ-251', 'yale-econ-252');--> statement-breakpoint
-- The blog carries no licence: its link is the fair-use statute it is quoted under, not the NYU site guide (that covers pages.stern.nyu.edu only).
UPDATE "library_sources" SET "licence_url" = 'https://uscode.house.gov/view.xhtml?req=granuleid:USC-prelim-title17-section107&num=0&edition=prelim' WHERE "id" = 'damodaran-blog';--> statement-breakpoint
-- BM25 statistics are built with the index (Neon lakebase_text); rebuild it so ranking stops counting the deleted rows.
-- VACUUM cannot run inside the migration's transaction; REINDEX can. PGlite (tests) has no BM25 index and skips this.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'library_passages_bm25' AND relkind = 'i') THEN
    EXECUTE 'REINDEX INDEX library_passages_bm25';
  END IF;
END $$;
