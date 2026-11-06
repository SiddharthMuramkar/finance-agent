import { signedInLearner } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadProfile } from "@/learner/profile";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

/** Settings: About you, Show developer details and Start over, for the signed-in Learner. No model call. */
export default async function SettingsPage() {
  const learner = await signedInLearner();
  const [p, theme] = await Promise.all([loadProfile(getDb(), learner.id), readTheme()]);
  return (
    <SignedInFrame>
      <ReadingPage current="settings" theme={theme} account={{ name: learner.name }}>
        <SettingsView
          profile={{ work: p.work ?? "", location: p.location ?? "", loan: p.loan ?? "", savingFor: p.savingFor ?? "" }}
          developerDetails={learner.showDeveloperDetails}
          theme={theme}
          account={{ name: learner.name }}
        />
      </ReadingPage>
    </SignedInFrame>
  );
}
