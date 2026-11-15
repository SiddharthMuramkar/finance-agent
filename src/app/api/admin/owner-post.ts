import { NextResponse } from "next/server";
import { type Admin as Owner, signedInAdmin as signedInOwner } from "@/auth/owner";
import { sameOrigin } from "@/auth/same-origin";
import { type AdminDone, doneAddress } from "../../admin/done";

// The one guard in front of every change on /admin (ADR 0014). Plain form posts with a 303 back to the page, as Sign
// out and Start over are, so they work without scripts.

/**
 * Runs an owner's change, in this order: another site's post is refused (403, before anything is read), then anyone
 * but the owner's own Better Auth session gets a 404, as for an address that isn't there (a signed-in Learner, the
 * owner's passcode, a waiting person); then `act` reads the form. A code from `act` answers 303 to
 * /admin?done=<code>#<section>; a Response from it (a 400 for a malformed form) is sent as it is. Every change repeats
 * safely, so a double submit changes nothing.
 */
export async function ownerPost(request: Request, act: (form: FormData, owner: Owner) => Promise<AdminDone | Response>): Promise<Response> {
  if (!sameOrigin(request)) {
    return new NextResponse("Admin changes must come from this site.", { status: 403, headers: { "content-type": "text/plain" } });
  }
  const owner = await signedInOwner();
  if (!owner) return new NextResponse("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  const form = await request.formData().catch(() => null);
  if (!form) return badRequest("Send the form from /admin.");
  const result = await act(form, owner);
  if (result instanceof Response) return result;
  return NextResponse.redirect(new URL(doneAddress(result), request.url), 303);
}

/** A form /admin would never send: 400 with a plain reason, nothing changed. */
export function badRequest(reason: string): Response {
  return new NextResponse(reason, { status: 400, headers: { "content-type": "text/plain" } });
}

/** An admin change is never a GET, so link prefetching or a crawler can't make one. */
export function onlyPost(): Response {
  return new NextResponse(null, { status: 405, headers: { allow: "POST" } });
}
