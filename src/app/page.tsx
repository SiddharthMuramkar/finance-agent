import Link from "next/link";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { workspaceSummary } from "@/learner/memory";
import { loadCurrentSession } from "@/tutor/turn";
import { Conversation } from "./conversation";

// Reads saved progress and the latest Session on every visit. Opening the page makes no model call.
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const db = getDb();
  const [summary, initial] = await Promise.all([workspaceSummary(db, loadCourseMap()), loadCurrentSession(db)]);
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col p-6">
      <header className="mb-6 flex items-baseline justify-between">
        <h1 className="text-lg font-semibold">Study Workspace</h1>
        <Link href="/sessions" className="text-sm text-stone-500 hover:underline">
          Past Sessions
        </Link>
      </header>
      <Conversation initial={initial} summary={summary} />
    </main>
  );
}
