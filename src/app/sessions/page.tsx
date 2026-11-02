import Link from "next/link";
import { getDb } from "@/db/client";
import { listSessions } from "@/tutor/turn";

export const dynamic = "force-dynamic";

/** Every Session, newest first. Old Sessions stay readable. */
export default async function SessionsPage() {
  const sessions = await listSessions(getDb());
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-lg font-semibold">Past Sessions</h1>
      <ul className="flex flex-col gap-2">
        {sessions.map((s) => (
          <li key={s.id}>
            <Link href={`/sessions/${s.id}`} className="hover:underline">
              Session {s.id}, started {s.createdAt.toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" })}
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/" className="mt-8 inline-block text-sm text-stone-500 hover:underline">
        Back to the Study Workspace
      </Link>
    </main>
  );
}
