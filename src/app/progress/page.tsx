import Link from "next/link";
import { loadCourseMap } from "@/course/map";
import { courseOverview } from "@/course/navigator";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";
import { ProgressView } from "../course/course-map-view";

export const dynamic = "force-dynamic";

/** Each Topic's status: not started, in progress or passed. No model call. */
export default async function ProgressPage() {
  const topics = courseOverview(loadCourseMap(), await loadProgress(getDb()));
  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-semibold">Progress</h1>
        <nav className="flex gap-4 text-sm text-stone-500 dark:text-stone-400">
          <Link href="/course" className="hover:underline">
            Course Map
          </Link>
          <Link href="/" className="hover:underline">
            Study Workspace
          </Link>
        </nav>
      </header>
      <ProgressView topics={topics} />
    </main>
  );
}
