import { notFound } from "next/navigation";
import { deniedPeople, peopleWithAccess, pendingInvites, waitingRequests } from "@/auth/access";
import { signupOpen } from "@/auth/invites";
import { signedInAdmin as signedInOwner } from "@/auth/owner";
import { getDb } from "@/db/client";
import { tutorSpeed } from "@/tutor/speed";
import { spendByPerson } from "@/tutor/spend";
import { accountFor } from "../account";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";
import { AdminView } from "./admin-view";
import { adminDone } from "./done";

export const dynamic = "force-dynamic";

/**
 * /admin (ADR 0014): the owner approves, denies and invites, sees what each person's Tutor costs (Spend) and how fast it
 * answers (Tutor speed, spec 2026-11-12 A9). Only the owner's own Google or email-link session sees it
 * (signedInOwner: never the passcode); everyone else gets the not-found page, as for an address that isn't there. The
 * check runs before anything streams, so the 404 is a real one: that is why this page has no loading.tsx, whose
 * skeleton would send a 200 first. The changes themselves are form posts to /api/admin/*, which check the owner again.
 */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ done?: string | string[] }> }) {
  const owner = await signedInOwner();
  if (!owner) notFound();
  const db = getDb();
  const now = new Date();
  const [waiting, people, invited, denied, open, spend, speed, theme, account, { done }] = await Promise.all([
    waitingRequests(db),
    peopleWithAccess(db),
    pendingInvites(db),
    deniedPeople(db),
    signupOpen(db),
    spendByPerson(db, now),
    tutorSpeed(db, now),
    readTheme(),
    accountFor(db, owner.learner),
    searchParams,
  ]);
  return (
    <SignedInFrame>
      <ReadingPage theme={theme} account={account}>
        <AdminView waiting={waiting} people={people} invited={invited} denied={denied} signupOpen={open} spend={spend} speed={speed} done={adminDone(done)} />
      </ReadingPage>
    </SignedInFrame>
  );
}
