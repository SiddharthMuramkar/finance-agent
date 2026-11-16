/**
 * The browser test bed's stand-in for Clerk's card (issue #76). Clerk is off on the test bed (clerkOn), so /join and
 * /sign-up draw this plain box where Clerk's <Waitlist/> or <SignUp/> would go, and the page's own words around it can
 * be tested. It does nothing. Only src/app/sign-in/provider-card.tsx loads it, behind a NODE_ENV test the build
 * removes (src/auth/no-test-identity.test.ts); `data-clerk-stand-in` is the mark scripts/check-no-e2e-in-build.mjs
 * looks for in a build.
 */
export function ClerkStandIn({ kind }: { kind: "waitlist" | "sign-up" }) {
  return (
    <div data-clerk-stand-in={kind} className="rounded-lg border border-dashed border-[var(--line)] p-4 text-sm text-[var(--muted)]">
      {kind === "waitlist" ? "Clerk’s waitlist form draws here." : "Clerk’s sign-up form draws here."} (Test bed only.)
    </div>
  );
}
