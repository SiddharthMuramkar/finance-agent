import { Waitlist } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { SIGN_IN_PATH } from "@/auth/destination";
import { clerkOn } from "@/auth/gates";
import { AuthPage, authNote } from "../sign-in/auth-page";

/**
 * /join, where a stranger asks for early access (issue #33): Clerk's <Waitlist/>, which takes their email and thanks
 * them in place. The owner lets them in from the Clerk Dashboard, and Clerk emails the invitation, which lands on
 * /sign-up. Public: the proxy lets it through signed out. Without Clerk nobody can join, so the page sends the person to
 * /sign-in (the passcode form in the test bed).
 */
export default async function JoinPage() {
  if (!clerkOn(process.env)) redirect(SIGN_IN_PATH);
  return (
    <AuthPage title="Join early access">
      <p className={authNote}>Leave your email and we&apos;ll write when your place is ready.</p>
      <Waitlist />
    </AuthPage>
  );
}
