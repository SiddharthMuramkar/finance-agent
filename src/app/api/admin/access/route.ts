import { approveAccess, denyAccess } from "@/auth/access";
import { getDb } from "@/db/client";
import { type AdminDone, DENY_CONFIRM } from "../../../admin/done";
import { badRequest, onlyPost, ownerPost } from "../owner-post";

export const runtime = "nodejs";

/**
 * /admin's Approve, Deny and Remove access (ADR 0014), for the owner only (ownerPost). Fields: `userId` and `action`,
 * "approve" or "deny"; a deny also needs `confirm=deny`, which only the confirm step sends. Deny and Remove access are
 * one action: the person is denied and signed out at once, and their Learner is kept. Approve makes or restores their
 * Learner straight away. Logs carry user ids only, never an email.
 */
export async function POST(request: Request) {
  return ownerPost(request, async (form, owner): Promise<AdminDone | Response> => {
    const userId = form.get("userId");
    const action = form.get("action");
    if (typeof userId !== "string" || !userId) return badRequest("Say who to approve or deny.");
    if (action === "approve") {
      const learner = await approveAccess(getDb(), userId);
      const done = learner === "no_user" ? "gone" : learner ? "approved" : "approved_no_learner";
      console.info(`Admin: approve user ${userId}: ${done}`);
      return done;
    }
    if (action === "deny") {
      if (form.get("confirm") !== DENY_CONFIRM) return badRequest("Confirm Deny first.");
      const result = await denyAccess(getDb(), userId, { ownerUserId: owner.identity.userId });
      const done = result === "denied" ? "denied" : result === "no_user" ? "gone" : "owner_stays";
      console.info(`Admin: deny user ${userId}: ${done}`);
      return done;
    }
    return badRequest("The action is approve or deny.");
  });
}

export async function GET() {
  return onlyPost();
}
