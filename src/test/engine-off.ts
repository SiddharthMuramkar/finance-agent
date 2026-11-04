import { eq } from "drizzle-orm";
import { settings } from "@/db/schema";
import type { Db } from "@/db/types";
import { readSettings } from "@/tutor/session-log";

/**
 * Turns the widget engine off in a test database. New Sessions freeze the engine's instructions and tools by default
 * (spec #229, ticket #242); a test of the Widget-writing path, which engine-off Sessions keep, calls this first.
 */
export async function engineOff(db: Db) {
  await readSettings(db);
  await db.update(settings).set({ value: "off" }).where(eq(settings.key, "widget_engine"));
}
