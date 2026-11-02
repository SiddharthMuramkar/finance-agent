import Link from "next/link";
import { loadCourseMap } from "@/course/map";
import { courseOverview } from "@/course/navigator";
import { getDb } from "@/db/client";
import { loadProgress } from "@/learner/memory";
import { CourseMapView } from "./course-map-view";

// Reads saved progress on every visit. No model call.
export const dynamic = "force-dynamic";

/** The Course Map: Topics as stops, Checks along the way, and the Learner's place. */
export default async function CourseMapPage() {
  const topics = courseOverview(loadCourseMap(), await loadProgress(getDb()));
  return (
    <main className="mx-auto max-w-2xl p-4 sm:p-6">
      <header className="mb-6 flex items-baseline justify-between gap-4">
        <h1 className="text-lg font-semibold">Course Map</h1>
        <nav className="flex gap-4 text-sm text-stone-500 dark:text-stone-400">
          <Link href="/progress" className="hover:underline">
            Progress
          </Link>
          <Link href="/" className="hover:underline">
            Study Workspace
          </Link>
        </nav>
      </header>
      <CourseMapView topics={topics} />
    </main>
  );
}
