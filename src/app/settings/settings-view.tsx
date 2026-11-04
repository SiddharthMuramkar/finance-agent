import { START_OVER_CONFIRM } from "@/auth/learners";
import { PROFILE_PRIVACY, ProfileForm, type ProfileValues } from "../profile/profile-form";
import { DeveloperDetailsSwitch, StartOverButton } from "./settings-controls";

const section = "border-t border-[var(--hairline)] pt-6";
const heading = "mb-2 text-base font-semibold leading-6";

/**
 * The Settings page's body: About you (the Learner Profile form), Show developer details and Start
 * over. Dark mode stays in the header. No model call.
 */
export function SettingsView({ profile, developerDetails }: { profile: ProfileValues; developerDetails: boolean }) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold leading-7">Settings</h1>
      <section id="about-you" aria-labelledby="about-you-heading" className={section}>
        <h2 id="about-you-heading" className={heading}>
          About you
        </h2>
        <p className="mb-2 text-sm leading-5">Share a little about your life so the Tutor can show how an idea applies to you when you ask. Every answer is optional.</p>
        <p className="mb-4 text-xs leading-4 text-[var(--muted)]">{PROFILE_PRIVACY}</p>
        <ProfileForm mode="page" initial={profile} />
      </section>
      <section id="developer-details" aria-labelledby="developer-details-heading" className={section}>
        <h2 id="developer-details-heading" className={heading}>
          Developer details
        </h2>
        <DeveloperDetailsSwitch initial={developerDetails} />
      </section>
      <section id="start-over" aria-labelledby="start-over-heading" className={section}>
        <h2 id="start-over-heading" className={heading}>
          Start over
        </h2>
        <p className="mb-3 text-sm leading-5">Begin again as a new learner, from the Welcome. Your current progress, Notes and Sessions are kept, not deleted.</p>
        <StartOverButton confirmValue={START_OVER_CONFIRM} />
      </section>
    </div>
  );
}
