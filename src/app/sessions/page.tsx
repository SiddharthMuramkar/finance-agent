import { cookies } from "next/headers";
import { getDb } from "@/db/client";
import { listSessions } from "@/tutor/transcript";
import { loadSessionSummaries } from "@/tutor/session-summary";
import { SessionCard } from "../session-card";
import { AppHeader, SignedInFrame } from "../ui";

export const dynamic = "force-dynamic";

/** Every Session, newest first. Old Sessions stay readable. */
export default async function SessionsPage() {
  const db = getDb();
  const [sessions, summaries, jar] = await Promise.all([listSessions(db), loadSessionSummaries(db), cookies()]);
  // Numbered by order started, so the oldest is Session 1 whatever the ids.
  const numberOf = new Map([...sessions].reverse().map((s, i) => [s.id, i + 1]));
  return (
    <SignedInFrame>
      <main className="mx-auto max-w-[720px] px-4 pb-12 pt-4 lg:pt-6">
        <AppHeader current="sessions" theme={jar.get("theme")?.value === "dark" ? "dark" : "light"} className="mb-6" />
        {sessions.length === 0 ? (
          <p className="text-sm leading-5 text-[var(--muted)]">No Sessions yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sessions.map((s) => {
              const sum = summaries.get(s.id);
              return (
                <li key={s.id}>
                  <SessionCard id={s.id} number={numberOf.get(s.id)!} createdAt={s.createdAt} topics={sum?.topics ?? []} widgets={sum?.widgets ?? 0} />
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </SignedInFrame>
  );
}
