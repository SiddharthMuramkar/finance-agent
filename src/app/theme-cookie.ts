import { cookies } from "next/headers";
import { THEME_COOKIE, parsePref, type ThemePref } from "./theme";

/** The Learner's saved theme choice, read from the `theme` cookie (server only). Pass it to AppHeader. */
export async function readTheme(): Promise<ThemePref> {
  return parsePref((await cookies()).get(THEME_COOKIE)?.value);
}
