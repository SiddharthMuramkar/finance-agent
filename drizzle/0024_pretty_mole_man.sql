CREATE TABLE "library_documents" (
	"source_id" text NOT NULL,
	"ref" text NOT NULL,
	"published_at" timestamp with time zone,
	"updated_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "library_documents_source_id_ref_pk" PRIMARY KEY("source_id","ref")
);
--> statement-breakpoint
CREATE TABLE "library_pictures" (
	"url" text PRIMARY KEY NOT NULL,
	"text" text,
	"model" text NOT NULL,
	"stop_reason" text,
	"problems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"read_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "library_documents" ADD CONSTRAINT "library_documents_source_id_library_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."library_sources"("id") ON DELETE no action ON UPDATE no action;