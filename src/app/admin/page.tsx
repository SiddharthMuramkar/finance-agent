import { notFound } from "next/navigation";
import { clerkDirectory } from "@/auth/clerk-directory";
import { signedInAdmin } from "@/auth/owner";
import { getDb } from "@/db/client";
import { tutorSpeed } from "@/tutor/speed";
import { spendByPerson } from "@/tutor/spend";
import { accountFor } from "../account";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";
import { AdminView } from "./admin-view";

export const dynamic = "force-dynamic";

/**
 * /admin (issue #33): what each person's Tutor costs (Spend) and how fast it answers (Tutor speed, spec 2026-11-12 A9),
 * read only. Who may come in is Clerk's (its Waitlist and Users pages, linked here). Only a Clerk session whose token
 * says admin sees it (signedInAdmin: never the passcode); everyone else gets the not-found page, as for an address
 * that isn't there, before Clerk is asked about anyone. The check runs before anything streams, so the 404 is a real
 * one: that is why this page has no loading.tsx, whose skeleton would send a 200 first.
 */
export default async function AdminPage() {
  const admin = await signedInAdmin();
  if (!admin) notFound();
  const db = getDb();
  const now = new Date();
  const [spend, speed, theme] = await Promise.all([spendByPerson(db, now), tutorSpeed(db, now), readTheme()]);
  const directory = await clerkDirectory(spend.people.map((p) => p.userId));
  const account = accountFor({ kind: "learner", via: "account", ...admin });
  return (
    <SignedInFrame>
      <ReadingPage theme={theme} account={account}>
        <AdminView spend={spend} speed={speed} directory={directory} you={admin.identity.userId} />
      </ReadingPage>
    </SignedInFrame>
  );
}
