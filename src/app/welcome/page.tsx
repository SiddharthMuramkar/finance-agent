import { redirect } from "next/navigation";
import { signedInLearner } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { showsWelcome } from "@/learner/welcome";
import { accountFor } from "../account";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";
import { WelcomeView, welcomePanel } from "./welcome-view";

export const dynamic = "force-dynamic";

/**
 * The Welcome, at /welcome: a new Learner's first page (sign-in and Start over land here through the Study
 * Workspace). A Learner with any Session, or who has already chosen a Topic, goes to the Study Workspace
 * instead. Your first Topic is the first Topic on the default path (Percent). No model call.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ panel?: string | string[] }> }) {
  const learner = await signedInLearner();
  if (!(await showsWelcome(getDb(), learner.id))) redirect("/study");
  const firstTopic = loadCourseMap().topics[0];
  return (
    <SignedInFrame>
      <ReadingPage theme={await readTheme()} account={await accountFor(getDb(), learner)}>
        <WelcomeView panel={welcomePanel((await searchParams).panel)} firstTopic={firstTopic} />
      </ReadingPage>
    </SignedInFrame>
  );
}
