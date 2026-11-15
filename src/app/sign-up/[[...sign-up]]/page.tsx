import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DEFAULT_DESTINATION, SIGN_IN_PATH } from "@/auth/destination";
import { clerkOn } from "@/auth/gates";
import { AuthPage } from "../../sign-in/auth-page";

/**
 * Where a Waitlist invitation lands (issue #33): Clerk's <SignUp/>, which reads the invitation's `__clerk_ticket` from
 * the address and offers what the Clerk instance has turned on. A catch-all, so Clerk's own steps draw here too. Who
 * may join is Clerk's call (Waitlist mode: only an invitation gets through), and a new account lands on /study, where
 * its Learner is made. Without Clerk there is nothing to finish, so the page sends the person to /sign-in.
 */
export default async function SignUpPage() {
  if (!clerkOn(process.env)) redirect(SIGN_IN_PATH);
  return (
    <AuthPage title="Create your account" current="join">
      {/* Clerk's catch-all components read the address, which Next.js knows only at request time. */}
      <Suspense>
        <SignUp forceRedirectUrl={DEFAULT_DESTINATION} />
      </Suspense>
    </AuthPage>
  );
}
