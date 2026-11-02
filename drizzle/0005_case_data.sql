CREATE TABLE "case_data_points" (
	"case_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"date" date NOT NULL,
	"value" double precision NOT NULL,
	CONSTRAINT "case_data_points_case_id_dataset_id_date_pk" PRIMARY KEY("case_id","dataset_id","date")
);
--> statement-breakpoint
CREATE TABLE "case_datasets" (
	"case_id" text NOT NULL,
	"dataset_id" text NOT NULL,
	"label" text NOT NULL,
	"unit" text NOT NULL,
	"source" text NOT NULL,
	"source_url" text NOT NULL,
	"checked_on" date NOT NULL,
	"check_note" text NOT NULL,
	CONSTRAINT "case_datasets_case_id_dataset_id_pk" PRIMARY KEY("case_id","dataset_id")
);
