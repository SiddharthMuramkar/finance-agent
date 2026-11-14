import { eq, sql } from "drizzle-orm";
import { approveAccess, isDenied } from "@/auth/access";
import { addInvite, inviteEmail, isInvited } from "@/auth/invites";
import { getDb } from "@/db/client";
import { user } from "@/db/schema";
import type { Db } from "@/db/types";
import type { AdminDone } from "../../../admin/done";
import { onlyPost, ownerPost } from "../owner-post";

export const runtime = "nodejs";

/** The longest email an address can be (RFC 5321), and the longest note kept. */
const EMAIL_MAX = 254;
const NOTE_MAX = 200;

/** A plain shape check (something@something.something, no spaces); Google or the email link proves the address later. */
const looksLikeEmail = (email: string) => email.length <= EMAIL_MAX && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

/**
 * Puts an email on the invite list with the owner's note, never with a Learner name (linking a Learner, the owner's
 * included, stays a CLI job behind INVITES_DB_OK). Someone who already signed in with that email is let in at once, as
 * Approve does, unless the owner denied them: a denial still wins over an invite.
 */
async function invite(db: Db, email: string, note: string | null): Promise<AdminDone> {
  const already = await isInvited(db, email);
  await addInvite(db, email, { note });
  const [found] = await db.select({ id: user.id }).from(user).where(eq(sql`lower(${user.email})`, email)).limit(1);
  if (!found) return already ? "already" : "invited";
  if (await isDenied(db, found.id)) return "invited_denied";
  const learner = await approveAccess(db, found.id);
  return learner === "no_user" ? (already ? "already" : "invited") : learner ? "approved" : "approved_no_learner";
}

/**
 * /admin's Invite an email (ADR 0014), for the owner only (ownerPost). Fields: `email` (compared trimmed and lowercase,
 * like every invite) and an optional `note`. Any other field, such as a Learner name, is ignored. Nothing is emailed.
 */
export async function POST(request: Request) {
  return ownerPost(request, async (form) => {
    const email = inviteEmail(String(form.get("email") ?? ""));
    if (!looksLikeEmail(email)) return "bad_email";
    const note = String(form.get("note") ?? "").trim().slice(0, NOTE_MAX) || null;
    return invite(getDb(), email, note);
  });
}

export async function GET() {
  return onlyPost();
}
