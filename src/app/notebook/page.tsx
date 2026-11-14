import { signedInLearner } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { loadNotebook } from "@/learner/notebook";
import { accountFor } from "../account";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";
import { NotebookView } from "./notebook-view";

// Built from saved records and the Topic files on every visit. No model call.
export const dynamic = "force-dynamic";

/** The Notebook: one row per Topic with a Session or a note (`?all=1` lists every Topic), then the Older sessions. */
export default async function NotebookPage({ searchParams }: { searchParams: Promise<{ all?: string | string[] }> }) {
  const all = (await searchParams).all === "1";
  const learner = await signedInLearner();
  const notebook = await loadNotebook(getDb(), loadCourseMap(), learner.id, { all });
  const theme = await readTheme();
  return (
    <SignedInFrame>
      <ReadingPage current="notebook" theme={theme} account={await accountFor(getDb(), learner)}>
        <NotebookView notebook={notebook} showAll={all} />
      </ReadingPage>
    </SignedInFrame>
  );
}
