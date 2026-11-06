import { START_OVER_CONFIRM } from "@/auth/learners";
import { PROFILE_PRIVACY, ProfileForm, type ProfileValues } from "../profile/profile-form";
import { DEFAULT_PREF, type ThemePref } from "../theme";
import { Card, SignOutButton, TextLink } from "../ui";
import { AppearanceSettings, DeveloperDetailsSwitch, StartOverButton } from "./settings-controls";

const heading = "mb-2 text-base font-semibold leading-6";

/**
 * The Settings page's body (A5): five cards in a card-grid — Account (who is signed in, and Sign out), Appearance
 * (Light, Dark or Match my Mac; the header's Theme menu shares its choice), About you (the Learner Profile form),
 * Developer details, and Start over (the danger zone, full width, last). B3b inserts Your Topics before Developer
 * details. A Google-linked Learner's Account shows their Google email (from accountFor); a passcode Learner has none, so
 * Account says "Signed in with a passcode". No model call.
 */
export function SettingsView({
  profile,
  developerDetails,
  theme = DEFAULT_PREF,
  account,
}: {
  profile: ProfileValues;
  developerDetails: boolean;
  theme?: ThemePref;
  account: { name: string; email?: string };
}) {
  return (
    <div>
      <h1 className="text-lg font-semibold leading-[26px]">Settings</h1>
      <div className="card-grid mt-3 items-start">
        <Card id="account" aria-labelledby="account-heading">
          <h2 id="account-heading" className={heading}>
            Account
          </h2>
          <p className="text-sm font-medium leading-5">{account.name}</p>
          {account.email ? (
            <p className="text-sm leading-5 text-[var(--muted)]">{account.email}</p>
          ) : (
            <p className="text-sm leading-5 text-[var(--muted)]">Signed in with a passcode</p>
          )}
          <SignOutButton className="mt-3" />
        </Card>
        <Card id="appearance" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading" className={heading}>
            Appearance
          </h2>
          <AppearanceSettings initial={theme} />
        </Card>
        <Card id="about-you" aria-labelledby="about-you-heading">
          <h2 id="about-you-heading" className={heading}>
            About you
          </h2>
          <p className="measure mb-2 text-sm leading-5">Share a little about your life so the Tutor can show how an idea applies to you when you ask. Every answer is optional.</p>
          <p className="measure mb-4 text-xs leading-4 text-[var(--muted)]">{PROFILE_PRIVACY}</p>
          <ProfileForm mode="page" initial={profile} />
        </Card>
        <Card id="developer-details" aria-labelledby="developer-details-heading">
          <h2 id="developer-details-heading" className={heading}>
            Developer details
          </h2>
          <DeveloperDetailsSwitch initial={developerDetails} />
        </Card>
        <Card id="start-over" aria-labelledby="start-over-heading" className="col-span-full bg-[var(--coral-tint)]">
          <h2 id="start-over-heading" className={`${heading} text-[var(--coral-ink)]`}>
            Start over
          </h2>
          <p className="measure mb-3 text-sm leading-5">Begin again as a new learner, from the Welcome. Your current progress, Notes and Sessions are kept, not deleted.</p>
          <StartOverButton confirmValue={START_OVER_CONFIRM} />
        </Card>
      </div>
      <p className="mt-4 text-xs leading-4 text-[var(--muted)]" data-testid="emoji-credit">
        Emoji artwork: Fluent Emoji by Microsoft, MIT License,{" "}
        <TextLink href="https://github.com/microsoft/fluentui-emoji" target="_blank" rel="noreferrer">
          https://github.com/microsoft/fluentui-emoji
        </TextLink>
      </p>
    </div>
  );
}
