import { eq } from "drizzle-orm";
import { z } from "zod";
import { learnerProfile } from "@/db/schema";
import type { Db } from "@/db/types";

/**
 * Learner Profile: what the Learner chooses to share about their own life. The Tutor gets it
 * when a Session opens and uses it only to choose everyday examples, never as advice.
 */

export const PROFILE_MAX_CHARS = 200;

export type ProfileField = "work" | "location" | "loan" | "savingFor";

/** The four questions, in the order the card and the edit page ask them. */
export const PROFILE_FIELDS: { key: ProfileField; label: string; hint: string }[] = [
  { key: "work", label: "Work", hint: "For example: nurse, software engineer, runs a small shop." },
  { key: "location", label: "Where you live", hint: "A city or country is enough." },
  { key: "loan", label: "Any loan", hint: "For example: a home loan, a car loan, student debt." },
  { key: "savingFor", label: "What you are saving for", hint: "For example: a deposit on a flat, a child's school fees." },
];

export type Profile = Record<ProfileField, string | null> & { offerDismissed: boolean };

/** One field: trimmed, at most 200 characters, and empty means "not shared" (null). */
const field = z
  .string()
  .nullish()
  .transform((v) => (v ?? "").trim())
  .pipe(z.string().max(PROFILE_MAX_CHARS, `Keep each answer to ${PROFILE_MAX_CHARS} characters or fewer.`))
  .transform((v) => (v === "" ? null : v));

export const profileInput = z.object({ work: field, location: field, loan: field, savingFor: field });
export type ProfileInput = z.output<typeof profileInput>;

const EMPTY: Profile = { work: null, location: null, loan: null, savingFor: null, offerDismissed: false };

export async function loadProfile(db: Db): Promise<Profile> {
  const [row] = await db.select().from(learnerProfile).where(eq(learnerProfile.id, 1));
  if (!row) return EMPTY;
  return { work: row.work, location: row.location, loan: row.loan, savingFor: row.savingFor, offerDismissed: row.offerDismissed };
}

/** Saves all four answers. Saving also ends the first-visit offer, even if every answer was cleared. */
export async function saveProfile(db: Db, input: ProfileInput, now: Date = new Date()): Promise<void> {
  const values = { ...input, offerDismissed: true, updatedAt: now };
  await db.insert(learnerProfile).values({ id: 1, ...values }).onConflictDoUpdate({ target: learnerProfile.id, set: values });
}

/** "Not now" on the first-visit card: the card is never offered again. Answers already saved are kept. */
export async function dismissProfileOffer(db: Db, now: Date = new Date()): Promise<void> {
  await db
    .insert(learnerProfile)
    .values({ id: 1, offerDismissed: true, updatedAt: now })
    .onConflictDoUpdate({ target: learnerProfile.id, set: { offerDismissed: true, updatedAt: now } });
}

export function hasProfile(p: Profile): boolean {
  return PROFILE_FIELDS.some((f) => p[f.key] !== null);
}

/** The first-visit card shows until the Learner saves or says "Not now". */
export function shouldOfferProfile(p: Profile): boolean {
  return !p.offerDismissed && !hasProfile(p);
}

export const PROFILE_BLOCK_HEADING =
  "Learner Profile (shared by the Learner; use it only to choose everyday examples, in the Learner's currency when an example is about their life, and never as advice):";

/** The Tutor's own block in a Session's opening message; null when the Learner has shared nothing. */
export async function profileBlock(db: Db): Promise<string | null> {
  const p = await loadProfile(db);
  if (!hasProfile(p)) return null;
  const lines = PROFILE_FIELDS.filter((f) => p[f.key] !== null).map((f) => `- ${f.label}: ${p[f.key]}`);
  return [PROFILE_BLOCK_HEADING, ...lines].join("\n");
}
