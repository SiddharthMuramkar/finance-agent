import { redirect } from "next/navigation";
import { signedInLearner } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { firstTopic } from "@/course/navigator";
import { getDb } from "@/db/client";
import { showsWelcome } from "@/learner/welcome";
import { currentAccount } from "../account";
import { ReadingPage } from "../ui";
import { WelcomeView, welcomePanel } from "./welcome-view";

export const dynamic = "force-dynamic";

/**
 * The Welcome, at /welcome: a new Learner's first page (sign-in and Start over land here through the Study
 * Workspace). A Learner with any Session, or who has already chosen a Topic, goes to the Study Workspace
 * instead. Your first Topic is the first Topic on the default path: Spine Topic 1 once it is written (spec C6), and
 * until then the first Topic in outline order (Percent). No model call.
 */
export default async function WelcomePage({ searchParams }: { searchParams: Promise<{ panel?: string | string[] }> }) {
  const learner = await signedInLearner();
  if (!(await showsWelcome(getDb(), learner.id))) redirect("/study");
  const map = loadCourseMap();
  const first = firstTopic(map) ?? map.topics[0];
  return (
    <ReadingPage account={await currentAccount()}>
      <WelcomeView panel={welcomePanel((await searchParams).panel)} firstTopic={first} />
    </ReadingPage>
  );
}
