import { signedInLearner } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { loadNotebook } from "@/learner/notebook";
import { loadOwnCaseNotes } from "@/learner/own-cases";
import { currentAccount } from "../account";
import { ReadingPage } from "../ui";
import { NotebookView } from "./notebook-view";

// Built from saved records and the Topic files on every visit. No model call.
export const dynamic = "force-dynamic";

/** The Notebook: one row per Topic with a Session or a note (`?all=1` lists every Topic), then the Older sessions. */
export default async function NotebookPage({ searchParams }: { searchParams: Promise<{ all?: string | string[] }> }) {
  const all = (await searchParams).all === "1";
  const learner = await signedInLearner();
  const db = getDb();
  const [notebook, ownCases] = await Promise.all([loadNotebook(db, loadCourseMap(), learner.id, { all }), loadOwnCaseNotes(db, learner.id)]);
  return (
    <ReadingPage current="notebook" account={await currentAccount()}>
      <NotebookView notebook={notebook} showAll={all} ownCases={ownCases} />
    </ReadingPage>
  );
}
