import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCourseMap } from "@/course/map";
import { getDb } from "@/db/client";
import { loadSession } from "@/tutor/transcript";
import { OldSession } from "../../old-session";

export const dynamic = "force-dynamic";

/** One old Session, read-only. No model call. */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const lines = await loadSession(getDb(), id, loadCourseMap());
  if (lines.length === 0) notFound();
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-lg font-semibold">Session {id}</h1>
      <OldSession lines={lines} />
      <Link href="/sessions" className="mt-8 inline-block text-sm text-stone-500 hover:underline">
        All Sessions
      </Link>
    </main>
  );
}
