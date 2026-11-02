import { and, count, eq, gte, lt } from "drizzle-orm";
import { loginFailures } from "@/db/schema";
import type { Db } from "@/db/types";

/** Wrong guesses one address may make in a window before it is refused, even with the right passcode. */
export const PER_ADDRESS = { failures: 5, minutes: 15 };
/** Wrong guesses from all addresses together before every login is refused, against guessing from many machines. */
export const OVERALL = { failures: 50, minutes: 60 };
/** How long a failure row is kept. */
const KEEP_HOURS = 24;

const minutesBefore = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000);

/** The caller's address. On Vercel the first x-forwarded-for entry is set by the platform. */
export function callerAddress(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** Whether a login may be tried now from this address. */
export async function loginAllowed(db: Db, ip: string, now = new Date()): Promise<boolean> {
  const [mine] = await db
    .select({ n: count() })
    .from(loginFailures)
    .where(and(eq(loginFailures.ip, ip), gte(loginFailures.at, minutesBefore(now, PER_ADDRESS.minutes))));
  if (mine.n >= PER_ADDRESS.failures) return false;
  const [all] = await db.select({ n: count() }).from(loginFailures).where(gte(loginFailures.at, minutesBefore(now, OVERALL.minutes)));
  return all.n < OVERALL.failures;
}

/** Records a wrong passcode from this address (never the guess itself) and drops rows older than a day. */
export async function recordLoginFailure(db: Db, ip: string, now = new Date()) {
  await db.insert(loginFailures).values({ ip, at: now });
  await db.delete(loginFailures).where(lt(loginFailures.at, minutesBefore(now, KEEP_HOURS * 60)));
}
