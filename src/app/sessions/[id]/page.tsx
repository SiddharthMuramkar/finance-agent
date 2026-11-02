import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { loadSession } from "@/tutor/transcript";
import { OldReply } from "../../old-reply";
import { UnderTheHood } from "../../under-the-hood";

export const dynamic = "force-dynamic";

/** One old Session, read-only. No model call. */
export default async function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const lines = await loadSession(getDb(), id);
  if (lines.length === 0) notFound();
  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 text-lg font-semibold">Session {id}</h1>
      <ol className="flex flex-col gap-4">
        {lines.map((line, i) => (
          <li key={i} className={line.role === "user" ? "self-end rounded-lg bg-stone-200 px-3 py-2 dark:bg-stone-800" : ""}>
            {line.role === "user" ? line.text : <OldReply text={line.text} />}
            {line.usage && <UnderTheHood usage={line.usage} />}
          </li>
        ))}
      </ol>
      <Link href="/sessions" className="mt-8 inline-block text-sm text-stone-500 hover:underline">
        All Sessions
      </Link>
    </main>
  );
}
