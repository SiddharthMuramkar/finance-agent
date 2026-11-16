import { NextResponse } from "next/server";
import { signedInAdmin } from "@/auth/owner";
import { sameOrigin } from "@/auth/same-origin";
import { getDb } from "@/db/client";
import { saveCaps } from "@/tutor/quota";
import { doneAddress } from "../../../admin/done";

export const runtime = "nodejs";

const plain = (body: string, status: number) => new NextResponse(body, { status, headers: { "content-type": "text/plain" } });

/**
 * /admin's Spend caps (decision #13): one field per cap in CAP_FIELDS (quota.ts), by its `settings` key. A plain form
 * post with a 303 back to /admin?done=<code>#caps, so it works without scripts. In this order: another site's post is
 * refused (403, before anything is read); then anyone but the admin gets a 404, as for an address that isn't there
 * (signedInAdmin, issue #33: a Clerk session whose token says admin, never a passcode); then the form is read. All
 * caps are saved or none: a missing or out-of-range value saves nothing. A new turn reads them at once. Saving again
 * changes nothing, so a double submit is safe.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return plain("Admin changes must come from this site.", 403);
  if (!(await signedInAdmin())) return plain("Not found", 404);
  const form = await request.formData().catch(() => null);
  if (!form) return plain("Send the form from /admin.", 400);
  const saved = await saveCaps(getDb(), (key) => form.get(key)?.toString() ?? null);
  return NextResponse.redirect(new URL(doneAddress(saved ? "caps_saved" : "bad_caps"), request.url), 303);
}

/** An admin change is never a GET, so link prefetching or a crawler can't make one. */
export function GET() {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
