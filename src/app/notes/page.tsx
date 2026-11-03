import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { loadNotes } from "@/learner/notes";
import { readTheme } from "../theme-cookie";
import { ReadingPage, SignedInFrame } from "../ui";
import { NotesView } from "./notes-view";

// Built from saved records and the Topic files on every visit. No model call.
export const dynamic = "force-dynamic";

/** The Notes page: a Topic Note for every Topic in course order, filled in once the Topic is passed. */
export default async function NotesPage() {
  const notes = await loadNotes(getDb(), loadCourseMap());
  const theme = await readTheme();
  return (
    <SignedInFrame>
      <ReadingPage current="notes" theme={theme}>
        <NotesView notes={notes} />
      </ReadingPage>
    </SignedInFrame>
  );
}
