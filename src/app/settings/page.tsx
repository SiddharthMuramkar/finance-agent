import { signedInLearner } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { loadProfile } from "@/learner/profile";
import { loadYourTopics } from "@/learner/your-topics";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

/** Settings: Account, Appearance, About you, Your Topics, Show developer details and Start over, for the signed-in Learner. No model call. */
export default async function SettingsPage() {
  const learner = await signedInLearner();
  const [p, theme, topics] = await Promise.all([loadProfile(getDb(), learner.id), readTheme(), loadYourTopics(getDb(), loadCourseMap(), learner.id)]);
  return (
    <SignedInFrame>
      <ReadingPage current="settings" theme={theme} account={{ name: learner.name }}>
        <SettingsView
          profile={{ work: p.work ?? "", location: p.location ?? "", loan: p.loan ?? "", savingFor: p.savingFor ?? "" }}
          developerDetails={learner.showDeveloperDetails}
          theme={theme}
          account={{ name: learner.name }}
          topics={topics}
        />
      </ReadingPage>
    </SignedInFrame>
  );
}
