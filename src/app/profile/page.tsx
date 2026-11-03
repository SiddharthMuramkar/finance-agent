import Link from "next/link";
import { getDb } from "@/db/client";
import { loadProfile } from "@/learner/profile";
import { readTheme } from "../theme-cookie";
import { Eyebrow, ReadingPage, SignedInFrame } from "../ui";
import { PROFILE_PRIVACY, ProfileForm } from "./profile-form";

export const dynamic = "force-dynamic";

/** "About you": edit the Learner Profile. No model call. */
export default async function ProfilePage() {
  const p = await loadProfile(getDb());
  const theme = await readTheme();
  return (
    <SignedInFrame>
      <ReadingPage current="progress" theme={theme}>
        <Eyebrow className="mb-2">About you</Eyebrow>
        <p className="mb-2 text-sm leading-5">Share a little about your life so the Tutor can pick everyday examples that fit you. Every answer is optional.</p>
        <p className="mb-4 text-xs leading-4 text-[var(--muted)]">{PROFILE_PRIVACY}</p>
        <ProfileForm mode="page" initial={{ work: p.work ?? "", location: p.location ?? "", loan: p.loan ?? "", savingFor: p.savingFor ?? "" }} />
        <p className="mt-6 text-xs leading-4">
          <Link href="/progress" className="text-[var(--muted)] underline underline-offset-4 hover:text-[var(--brand)]">
            Back to Progress
          </Link>
        </p>
      </ReadingPage>
    </SignedInFrame>
  );
}
