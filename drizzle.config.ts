import { defineConfig } from "drizzle-kit";

// Migrations use the direct (unpooled) connection; the app uses the pooled one.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL_UNPOOLED ?? "" },
});
