import type { ReactNode } from "react";
import { e2eEnabled } from "@/dev/e2e-mode";

/**
 * What draws in place of Clerk's card while Clerk is off (issue #76): on the browser test bed, a plain stand-in
 * (src/dev/clerk-stand-in.tsx), so the joining pages' copy is tested in CI; anywhere else, nothing (null), and the page
 * sends the person on. The stand-in is loaded behind a NODE_ENV test, which the build replaces, so it never reaches a
 * production build (scripts/check-no-e2e-in-build.mjs checks).
 */
export async function testBedCard(kind: "waitlist" | "sign-up"): Promise<ReactNode | null> {
  if (process.env.NODE_ENV !== "production" && e2eEnabled(process.env)) {
    const { ClerkStandIn } = await import("@/dev/clerk-stand-in");
    return <ClerkStandIn kind={kind} />;
  }
  return null;
}
