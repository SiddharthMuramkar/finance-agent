import { START_OVER_CONFIRM } from "@/auth/learners";
import { PROFILE_PRIVACY, ProfileForm, type ProfileValues } from "../profile/profile-form";
import { DEFAULT_PREF, type ThemePref } from "../theme";
import { AppearanceSettings, DeveloperDetailsSwitch, StartOverButton } from "./settings-controls";

const section = "border-t border-[var(--hairline)] pt-6";
const heading = "mb-2 text-base font-semibold leading-6";

/**
 * The Settings page's body: About you (the Learner Profile form), Show developer details and Start
 * over, with Appearance (Light, Dark or Match my Mac) after About you. The header's Theme menu shares its choice. No model call.
 */
export function SettingsView({ profile, developerDetails, theme = DEFAULT_PREF }: { profile: ProfileValues; developerDetails: boolean; theme?: ThemePref }) {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold leading-7">Settings</h1>
      <section id="about-you" aria-labelledby="about-you-heading" className={section}>
        <h2 id="about-you-heading" className={heading}>
          About you
        </h2>
        <p className="measure mb-2 text-sm leading-5">Share a little about your life so the Tutor can show how an idea applies to you when you ask. Every answer is optional.</p>
        <p className="measure mb-4 text-xs leading-4 text-[var(--muted)]">{PROFILE_PRIVACY}</p>
        <ProfileForm mode="page" initial={profile} />
      </section>
      <section id="appearance" aria-labelledby="appearance-heading" className={section}>
        <h2 id="appearance-heading" className={heading}>
          Appearance
        </h2>
        <AppearanceSettings initial={theme} />
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
        <p className="measure mb-3 text-sm leading-5">Begin again as a new learner, from the Welcome. Your current progress, Notes and Sessions are kept, not deleted.</p>
        <StartOverButton confirmValue={START_OVER_CONFIRM} />
      </section>
      <p className="text-xs leading-4 text-[var(--muted)]" data-testid="emoji-credit">
        Emoji artwork: Fluent Emoji by Microsoft, MIT License,{" "}
        <a href="https://github.com/microsoft/fluentui-emoji" className="underline" target="_blank" rel="noreferrer">
          https://github.com/microsoft/fluentui-emoji
        </a>
      </p>
    </div>
  );
}
