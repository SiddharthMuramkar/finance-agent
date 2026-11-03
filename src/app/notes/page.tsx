import { currentLearnerId } from "@/auth/session";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { loadNotes } from "@/learner/notes";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";
import { NotesView } from "./notes-view";

// Built from saved records and the Topic files on every visit. No model call.
export const dynamic = "force-dynamic";

/** The Notes page: the Topic Notes in course order, only the Topics with a note unless `?all=1` (Show all Topics). */
export default async function NotesPage({ searchParams }: { searchParams: Promise<{ all?: string | string[] }> }) {
  const showAll = (await searchParams).all === "1";
  const notes = await loadNotes(getDb(), loadCourseMap(), await currentLearnerId());
  const theme = await readTheme();
  return (
    <SignedInFrame>
      <ReadingPage current="notes" theme={theme}>
        <NotesView notes={notes} showAll={showAll} />
      </ReadingPage>
    </SignedInFrame>
  );
}
