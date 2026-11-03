import { cookies } from "next/headers";
import type { Theme } from "./theme-toggle";

/** The Learner's saved dark or light choice, read from the `theme` cookie (server only). Pass it to AppHeader. */
export async function readTheme(): Promise<Theme> {
  return (await cookies()).get("theme")?.value === "dark" ? "dark" : "light";
}
