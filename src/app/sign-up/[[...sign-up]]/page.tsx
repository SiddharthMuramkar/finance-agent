import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { pageMetadata } from "@/app/site-metadata";
import { DEFAULT_DESTINATION, JOIN_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/auth/destination";
import { clerkOn } from "@/auth/gates";
import { e2eEnabled } from "@/dev/e2e-mode";
import { joining } from "@/site/copy";
import { TextLink } from "../../ui";
import { testBedCard } from "../../sign-in/provider-card";
import { AuthPage, authNote } from "../../sign-in/auth-page";

type Props = { params?: Promise<{ "sign-up"?: string[] }>; searchParams?: Promise<{ __clerk_ticket?: string | string[] }> };

/**
 * Where a waitlist invitation lands (issues #33, #76): Clerk's <SignUp/>, which reads the invitation's `__clerk_ticket`
 * from the address and offers what the Clerk instance has turned on. A catch-all, so Clerk's own steps
 * (/sign-up/verify-email-address, /sign-up/sso-callback) draw here too. Who may join is Clerk's call (Waitlist mode:
 * only an invitation gets through), and a new account lands on /study, where its Learner is made.
 * - /sign-up itself with no invitation: a line saying an invitation is needed, with a link to the waitlist, and no card.
 * - On the test bed, a plain stand-in takes the card's place (testBedCard).
 * - Anywhere else without Clerk there is nothing to finish, so the page sends the person to /sign-in.
 */
export const metadata: Metadata = pageMetadata({ title: joining.signUp.title, path: SIGN_UP_PATH });

export default async function SignUpPage({ params, searchParams }: Props = {}) {
  const on = clerkOn(process.env);
  if (!on && !e2eEnabled(process.env)) redirect(SIGN_IN_PATH);
  const [{ "sign-up": step } = {}, { __clerk_ticket: ticket } = {}] = await Promise.all([params, searchParams]);
  const { title, noInvitation, toWaitlist } = joining.signUp;

  if (!step?.length && !ticket) {
    return (
      <AuthPage title={title}>
        <p className={authNote}>{noInvitation}</p>
        <TextLink href={JOIN_PATH} className="self-start text-sm">
          {toWaitlist}
        </TextLink>
      </AuthPage>
    );
  }

  const card = on ? (
    // Clerk's catch-all components read the address, which Next.js knows only at request time.
    <Suspense>
      <SignUp forceRedirectUrl={DEFAULT_DESTINATION} />
    </Suspense>
  ) : (
    await testBedCard("sign-up")
  );
  if (!card) redirect(SIGN_IN_PATH);
  return <AuthPage title={title}>{card}</AuthPage>;
}
