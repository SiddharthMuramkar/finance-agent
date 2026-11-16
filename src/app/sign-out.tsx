"use client";

import { useClerk } from "@clerk/nextjs";
import { createContext, use, type FormEvent, type ReactNode } from "react";

// Sign out (issue #33). While Clerk runs, its session lives in Clerk's own cookies, which only Clerk's browser SDK ends
// (useClerk().signOut()); the passcode door's `fa_access` cookie is ours, ended by POST /api/logout. A developer's
// machine may hold both, so a Clerk sign-out posts there too.

const ClerkOnContext = createContext(false);

/** Marks the page as running Clerk. The root layout puts it inside ClerkProvider, which it draws only while clerkOn. */
export function ClerkOn({ children }: { children: ReactNode }) {
  return <ClerkOnContext value={true}>{children}</ClerkOnContext>;
}

/** True when this page runs Clerk (inside ClerkOn). */
export function useClerkOn(): boolean {
  return use(ClerkOnContext);
}

/**
 * The sign-out form around a submit button: a plain POST to /api/logout (its 303 lands on Home), never a link, so a
 * prefetch or a crawler can't sign anyone out. While Clerk runs, pressing it ends the passcode cookie too, then Clerk's
 * session, and Clerk lands on Home.
 */
export function SignOutForm({ children }: { children: ReactNode }) {
  return useClerkOn() ? (
    <ClerkSignOutForm>{children}</ClerkSignOutForm>
  ) : (
    <form action="/api/logout" method="post" className="contents">
      {children}
    </form>
  );
}

function ClerkSignOutForm({ children }: { children: ReactNode }) {
  const clerk = useClerk();
  async function signOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await fetch("/api/logout", { method: "POST", redirect: "manual" }).catch(() => {});
    await clerk.signOut({ redirectUrl: "/" });
  }
  return (
    <form action="/api/logout" method="post" onSubmit={signOut} className="contents">
      {children}
    </form>
  );
}
