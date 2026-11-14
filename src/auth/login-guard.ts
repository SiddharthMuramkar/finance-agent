import { and, count, eq, gte, lt } from "drizzle-orm";
import { loginFailures } from "@/db/schema";
import type { Db } from "@/db/types";

/** Wrong guesses one address may make in a window before it is refused, even with the right passcode. */
export const PER_ADDRESS = { failures: 5, minutes: 15 };
/**
 * Wrong guesses from all addresses together, against guessing from many machines. Past this, logins are
 * slowed rather than stopped: each address gets one try per PER_ADDRESS window, so whoever holds the
 * passcode can still sign in on a new device while someone keeps guessing.
 */
export const OVERALL = { failures: 50, minutes: 60 };
/** How long a failure row is kept. */
const KEEP_HOURS = 24;

const minutesBefore = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000);

/** The caller's address. On Vercel the first x-forwarded-for entry is set by the platform. */
export function callerAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/**
 * Claims a login try for this address before the passcode is compared: the try is saved first and then
 * counted with every other, so tries sent all at once each see the ones before them and no more than the
 * limit get compared. A refused try is removed again. Returns the claimed try's id, or null when refused.
 */
export async function claimLoginTry(db: Db, ip: string, now = new Date()): Promise<number | null> {
  const [{ id }] = await db.insert(loginFailures).values({ ip, at: now }).returning({ id: loginFailures.id });
  const [all] = await db.select({ n: count() }).from(loginFailures).where(gte(loginFailures.at, minutesBefore(now, OVERALL.minutes)));
  const [mine] = await db
    .select({ n: count() })
    .from(loginFailures)
    .where(and(eq(loginFailures.ip, ip), gte(loginFailures.at, minutesBefore(now, PER_ADDRESS.minutes))));
  // Both counts include this try.
  const limit = all.n > OVERALL.failures ? 1 : PER_ADDRESS.failures;
  if (mine.n <= limit) return id;
  await db.delete(loginFailures).where(eq(loginFailures.id, id));
  return null;
}

/** The claimed try had the right passcode: it is not a wrong guess, so it is removed. */
export async function loginSucceeded(db: Db, tryId: number) {
  await db.delete(loginFailures).where(eq(loginFailures.id, tryId));
}

/** The claimed try had a wrong passcode: its row stays as the failure (never the guess itself); rows older than a day go. */
export async function loginFailed(db: Db, now = new Date()) {
  await db.delete(loginFailures).where(lt(loginFailures.at, minutesBefore(now, KEEP_HOURS * 60)));
}
