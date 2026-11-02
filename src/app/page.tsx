import Link from "next/link";
import { cookies } from "next/headers";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { workspaceSummary } from "@/learner/memory";
import { openQuiz } from "@/learner/quiz";
import { latestTurn, loadCurrentSession } from "@/tutor/turn";
import { Conversation, type PendingTurn } from "./conversation";
import { ThemeToggle } from "./theme-toggle";

// Reads saved progress and the latest Session on every visit. Opening the page makes no model call.
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const db = getDb();
  const map = loadCourseMap();
  const [summary, initial, jar, quiz, turn] = await Promise.all([
    workspaceSummary(db, map),
    loadCurrentSession(db),
    cookies(),
    openQuiz(db, map),
    latestTurn(db),
  ]);
  // A turn that didn't finish: the workspace resumes a cut-off one and offers Retry for a failed one.
  const pending: PendingTurn = turn && turn.status !== "finished" ? { status: turn.status, error: turn.error } : null;
  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col p-4 sm:p-6">
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-semibold">Study Workspace</h1>
        <nav className="flex gap-4">
          <ThemeToggle initial={jar.get("theme")?.value === "dark" ? "dark" : "light"} />
          <Link href="/sessions" className="text-sm text-stone-500 hover:underline dark:text-stone-400">
            Past Sessions
          </Link>
        </nav>
      </header>
      <Conversation initial={initial} summary={summary} quiz={quiz} pending={pending} />
    </main>
  );
}
