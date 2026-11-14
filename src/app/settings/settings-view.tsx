import { START_OVER_CONFIRM } from "@/auth/learners";
import { PROFILE_PRIVACY, ProfileForm, type ProfileValues } from "../profile/profile-form";
import { DEFAULT_PREF, type ThemePref } from "../theme";
import { Card, SignOutButton, TextLink } from "../ui";
import type { YourTopic } from "@/learner/your-topics";
import { AppearanceSettings, DeveloperDetailsSwitch, StartOverButton } from "./settings-controls";
import { YourTopicsSection } from "./your-topics";

/** A section's heading: Inter Tight 18/24 at 600, under the section's ink rule (ADR 0013). Your Topics repeats it. */
const heading = "mb-3 [font-family:var(--font-display)] text-[18px] font-semibold leading-6 tracking-[-0.012em]";

/**
 * The Settings page's body (A5): six sections, each under Enjoy's ink rule with no box (ADR 0013), the first five in masonry columns (#529) — Account (who is signed in, and Sign out), Appearance
 * (Light or Dark; the header's theme toggle shares its choice), About you (the Learner Profile form),
 * Your Topics (B3b: start one Topic over; its Card fills A5's `id="your-topics"` slot between About you and Developer details),
 * Developer details, and Start over (the danger zone, full width, last). A Learner linked to a Google or email-link account
 * shows that account's email (from accountFor); a passcode Learner has none, so Account says "Signed in with a passcode". No model call.
 */
export function SettingsView({
  profile,
  developerDetails,
  theme = DEFAULT_PREF,
  account,
  topics = [],
}: {
  profile: ProfileValues;
  developerDetails: boolean;
  theme?: ThemePref;
  account: { name: string; email?: string };
  /** The Topics with progress, in course order (loadYourTopics), for Your Topics. */
  topics?: readonly YourTopic[];
}) {
  return (
    <div>
      <h1 className="type-h1">Settings</h1>
      {/* #529: masonry columns (420 px minimum, #470), so a short card stacks under the one above instead of waiting for
          the tall About you card's row to end. At most 3 columns: five cards balance into 3 stacks, so a 4th (1920) stayed
          empty. Start over sits below them, full width. */}
      <div className="mt-8 columns-[420px_3] gap-x-[var(--gap)] [&>*]:mb-[var(--gap)] [&>*]:break-inside-avoid">
        <Card variant="rule" id="account" aria-labelledby="account-heading">
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
        <Card variant="rule" id="appearance" aria-labelledby="appearance-heading">
          <h2 id="appearance-heading" className={heading}>
            Appearance
          </h2>
          <AppearanceSettings initial={theme} />
        </Card>
        <Card variant="rule" id="about-you" aria-labelledby="about-you-heading">
          <h2 id="about-you-heading" className={heading}>
            About you
          </h2>
          <p className="measure mb-2 text-sm leading-5">Share a little about your life so the Tutor can show how an idea applies to you when you ask. Every answer is optional.</p>
          <p className="measure mb-4 text-xs leading-4 text-[var(--muted)]">{PROFILE_PRIVACY}</p>
          <ProfileForm mode="page" initial={profile} />
        </Card>
        {/* Your Topics: B3b's Card fills A5's slot (keeps id="your-topics"). */}
        <YourTopicsSection topics={topics} />
        <Card variant="rule" id="developer-details" aria-labelledby="developer-details-heading">
          <h2 id="developer-details-heading" className={heading}>
            Developer details
          </h2>
          <DeveloperDetailsSwitch initial={developerDetails} />
        </Card>
      </div>
      {/* The danger zone: a danger rule and a danger heading, no red box. */}
      <Card variant="rule" id="start-over" aria-labelledby="start-over-heading" className="mt-8 !border-[var(--danger)]">
        <h2 id="start-over-heading" className={`${heading} text-[var(--danger)]`}>
          Start over
        </h2>
        <p className="measure mb-3 text-sm leading-5">Begin again as a new learner, from the Welcome. Your current progress, Notebook and Sessions are kept, not deleted.</p>
        <StartOverButton confirmValue={START_OVER_CONFIRM} />
      </Card>
      <p className="mt-10 text-xs leading-4 text-[var(--muted)]" data-testid="icon-credit">
        Icons: Lucide, ISC License,{" "}
        <TextLink href="https://lucide.dev" target="_blank" rel="noreferrer">
          https://lucide.dev
        </TextLink>
      </p>
    </div>
  );
}
