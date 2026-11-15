import { defineConfig } from "drizzle-kit";

// Migrations use the direct (unpooled) connection; the app uses the pooled one.
// Every migration is expand-then-contract (old code runs on the new schema until promote): add in one PR,
// drop/rename/NOT NULL in a later one. Never `drizzle-kit push`. Rules: docs/agents/migrations.md.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
});
