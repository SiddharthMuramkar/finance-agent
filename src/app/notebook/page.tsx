import { currentLearnerId } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { loadNotebook } from "@/learner/notebook";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";
import { NotebookView } from "./notebook-view";

// Built from saved records and the Topic files on every visit. No model call.
export const dynamic = "force-dynamic";

/** The Notebook: one row per Topic with a Session or a note (`?all=1` lists every Topic), then the Older sessions. */
export default async function NotebookPage({ searchParams }: { searchParams: Promise<{ all?: string | string[] }> }) {
  const all = (await searchParams).all === "1";
  const notebook = await loadNotebook(getDb(), loadCourseMap(), await currentLearnerId(), { all });
  const theme = await readTheme();
  return (
    <SignedInFrame>
      {/* The header highlights "notes" until A5 gives the Notebook its own link. */}
      <ReadingPage current="notes" theme={theme}>
        <NotebookView notebook={notebook} showAll={all} />
      </ReadingPage>
    </SignedInFrame>
  );
}
