import { and, count, eq, gte, lt } from "drizzle-orm";
import { emailLinkSends } from "@/db/schema";
import type { Db } from "@/db/types";
import { inviteEmail } from "./invites";

// Limits on sign-in emails (ADR 0014), behind Better Auth's per-IP rate limit on the request
// itself. These two protect what an address limit cannot: a victim's inbox from many machines, and
// the Resend account's free daily quota (100) from anyone. Google sign-in is never limited here.

/** Sign-in emails one address may get in an hour. */
export const PER_ADDRESS = { sends: 3, minutes: 60 };
/** Sign-in emails the whole site sends in a day: under Resend's free 100, so the account is never pushed past it. */
export const DAILY = { sends: 90 };
/** How long a send row is kept. */
const KEEP_HOURS = 24;

const minutesBefore = (now: Date, minutes: number) => new Date(now.getTime() - minutes * 60_000);

const encoder = new TextEncoder();

/**
 * How an address is stored: HMAC-SHA256 of the trimmed, lowercase address under BETTER_AUTH_SECRET,
 * in hex. Never the address, and keyed, because a plain hash of an email is reversed by hashing a list
 * of addresses.
 */
export async function emailHash(email: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(inviteEmail(email))));
  return Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** A claim's answer: send it, or the code of the limit it hit. */
export type EmailClaim = "ok" | "email_link_throttled" | "email_link_daily_cap";

/**
 * Claims one sign-in email to this address before it is sent, as `claimLoginTry` does for passcodes:
 * the send is saved first and then counted with every other, so requests sent all at once each see the
 * ones before them and no more than the limit go out. The whole site's day is checked first (its
 * answer is the longer wait), then the address's hour. A refused claim is removed again, and rows
 * older than a day are deleted. The warning for the daily cap names no address.
 */
export async function claimEmailSend(db: Db, email: string, secret: string, now = new Date()): Promise<EmailClaim> {
  const hash = await emailHash(email, secret);
  const [{ id }] = await db.insert(emailLinkSends).values({ emailHash: hash, sentAt: now }).returning({ id: emailLinkSends.id });
  const [all] = await db.select({ n: count() }).from(emailLinkSends).where(gte(emailLinkSends.sentAt, minutesBefore(now, KEEP_HOURS * 60)));
  const [mine] = await db
    .select({ n: count() })
    .from(emailLinkSends)
    .where(and(eq(emailLinkSends.emailHash, hash), gte(emailLinkSends.sentAt, minutesBefore(now, PER_ADDRESS.minutes))));
  await db.delete(emailLinkSends).where(lt(emailLinkSends.sentAt, minutesBefore(now, KEEP_HOURS * 60)));
  // Both counts include this claim.
  const refused: EmailClaim | null = all.n > DAILY.sends ? "email_link_daily_cap" : mine.n > PER_ADDRESS.sends ? "email_link_throttled" : null;
  if (!refused) return "ok";
  if (refused === "email_link_daily_cap") console.warn(`email_link_daily_cap: ${DAILY.sends} sign-in emails in the last day; email sign-in rests until the oldest is a day old`);
  await db.delete(emailLinkSends).where(eq(emailLinkSends.id, id));
  return refused;
}
