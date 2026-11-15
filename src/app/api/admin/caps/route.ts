import { getDb } from "@/db/client";
import { saveCaps } from "@/tutor/quota";
import { onlyPost, ownerPost } from "../owner-post";

export const runtime = "nodejs";

/**
 * /admin's Spend caps (decision #13), for the owner only (ownerPost): one field per cap in CAP_FIELDS (quota.ts), by its
 * `settings` key. All are saved or none: a missing or out-of-range value saves nothing. A new turn reads them at once.
 */
export async function POST(request: Request) {
  return ownerPost(request, async (form) => ((await saveCaps(getDb(), (key) => form.get(key)?.toString() ?? null)) ? "caps_saved" : "bad_caps"));
}

export async function GET() {
  return onlyPost();
}
