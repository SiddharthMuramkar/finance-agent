import { isSignedIn } from "@/auth/session";
import { LandingPage } from "./_landing/landing";

// Home: every visit to "/" opens it, signed in or out. Never cached as a page (the proxy lets "/" through
// for strangers, and next.config.ts sends no-store), because the same address serves both kinds of visitor.
export const dynamic = "force-dynamic";

export default async function HomePage() {
  // The signed-in check comes first, so a signed-out visitor never triggers a read of Learner data.
  return <LandingPage signedIn={await isSignedIn()} />;
}
