import { signedInLearner } from "@/auth/session";
import { getDb } from "@/db/client";
import { loadProfile } from "@/learner/profile";
import { accountFor } from "../account";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

/** Settings: About you, Show developer details and Start over, for the signed-in Learner. No model call. */
export default async function SettingsPage() {
  const learner = await signedInLearner();
  const [p, theme, account] = await Promise.all([loadProfile(getDb(), learner.id), readTheme(), accountFor(getDb(), learner)]);
  return (
    <SignedInFrame>
      <ReadingPage current="settings" theme={theme} account={account}>
        <SettingsView
          profile={{ work: p.work ?? "", location: p.location ?? "", loan: p.loan ?? "", savingFor: p.savingFor ?? "" }}
          developerDetails={learner.showDeveloperDetails}
          theme={theme}
          account={account}
        />
      </ReadingPage>
    </SignedInFrame>
  );
}
