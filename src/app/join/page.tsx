import { Waitlist } from "@clerk/nextjs";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/app/site-metadata";
import { JOIN_PATH, SIGN_IN_PATH } from "@/auth/destination";
import { clerkOn } from "@/auth/gates";
import { joining } from "@/site/copy";
import { LegalLinks } from "../(site)/site-chrome";
import { testBedCard } from "../sign-in/provider-card";
import { AuthPage, authNote } from "../sign-in/auth-page";

/**
 * /join, where a Visitor joins the waitlist (issues #33, #76): Clerk's <Waitlist/>, which takes their email and thanks
 * them in place, under the page's own heading and what happens next (free, reviewed by hand, an email when you're in,
 * a laptop or a phone). The Owner lets them in from the Clerk Dashboard, and Clerk emails the invitation, which lands on
 * /sign-up. Public: the proxy lets it through signed out. On the test bed a plain stand-in takes the card's place
 * (testBedCard); anywhere else without Clerk nobody can join, so the page sends the person to /sign-in. Before the card,
 * Privacy, Terms and the contact address (issue #77), so a Visitor knows what happens to their email before giving it.
 */
export const metadata: Metadata = pageMetadata({ title: joining.join.title, path: JOIN_PATH });

export default async function JoinPage() {
  const card = clerkOn(process.env) ? <Waitlist /> : await testBedCard("waitlist");
  if (!card) redirect(SIGN_IN_PATH);
  const { title, lede, next } = joining.join;
  return (
    <AuthPage title={title}>
      <div className="flex flex-col gap-2">
        <p className={authNote}>{lede}</p>
        <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-5 text-[var(--ink-2)]">
          {next.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="text-sm leading-5 text-[var(--ink-2)]">
          <LegalLinks />
        </div>
      </div>
      {card}
    </AuthPage>
  );
}
