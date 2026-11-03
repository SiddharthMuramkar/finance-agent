import Link from "next/link";
import type { ReactNode } from "react";
import type { PastSessionHeader, PastSessions } from "@/tutor/past-sessions";
import { Eyebrow, Pill, primaryButtonClass } from "./ui";

/**
 * Past Sessions (spec #119, "Pages › Past Sessions"): the list, one row per Topic Session newest first and
 * the Older sessions as their own group, and the header above one Session's page. Plain markup and links;
 * Resume this Topic is a form post to /api/open, so it works without scripts.
 */

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "5 Sep 2026": always a three-letter month (Intl prints "Sept" for September). */
export function shortDate(d: Date): string {
  const parts = Object.fromEntries(dateFormat.formatToParts(d).map((p) => [p.type, p.value]));
  return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.year}`;
}

const ROW = "flex flex-col gap-2 rounded-lg border border-[var(--border)] p-4 transition-colors duration-200 hover:border-[var(--brand-line)] hover:bg-[var(--brand-tint)]";

function TopicPills({ topics }: { topics: string[] }) {
  return (
    <span className="flex flex-wrap gap-2">
      {topics.length ? (
        topics.map((t) => (
          <Pill key={t} brand>
            {t}
          </Pill>
        ))
      ) : (
        <Pill>No Topic</Pill>
      )}
    </span>
  );
}

/** Every Topic Session, the most recently worked on first, then the Older sessions under their own heading. */
export function PastSessionsList({ past }: { past: PastSessions }) {
  if (past.topics.length === 0 && past.older.length === 0) return <p className="text-sm leading-5 text-[var(--muted)]">No Sessions yet.</p>;
  return (
    <div className="flex flex-col gap-8">
      {past.topics.length > 0 && (
        <ul className="flex flex-col gap-3">
          {past.topics.map((s) => (
            <li key={s.id}>
              <Link href={`/sessions/${s.id}`} className={ROW}>
                <span className="text-base font-medium leading-6 text-[var(--ink)]">{s.title}</span>
                <span className="text-sm leading-5 text-[var(--muted)]">Last worked on {shortDate(s.lastActive)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {past.older.length > 0 && (
        <section aria-labelledby="older-sessions" className="flex flex-col gap-3">
          <h2 id="older-sessions" className="text-sm font-semibold leading-5 text-[var(--muted)]">
            Older sessions
          </h2>
          <ul className="flex flex-col gap-3">
            {past.older.map((s) => (
              <li key={s.id}>
                <Link href={`/sessions/${s.id}`} className={ROW}>
                  <Eyebrow>Older session · {shortDate(s.date).toUpperCase()}</Eyebrow>
                  <TopicPills topics={s.topics} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Header({ children }: { children: ReactNode }) {
  return (
    <header className="mb-4 flex flex-col gap-2">
      <Link href="/sessions" className="self-start text-sm leading-5 text-[var(--brand)] hover:underline">
        ← Past Sessions
      </Link>
      {children}
    </header>
  );
}

/**
 * The top of one Session's page: a back link to Past Sessions, then for a Topic Session its Topic, the date
 * last worked on and Resume this Topic (Passed ✓ once passed); for an Older session its date, the Topics it
 * touched (or No Topic) and "Older session · read-only", with no Resume.
 */
export function PastSessionHeaderView({ header }: { header: PastSessionHeader }) {
  if (header.kind === "older") {
    return (
      <Header>
        <Eyebrow>Older session · read-only</Eyebrow>
        <h1 className="text-xl font-semibold leading-7 text-[var(--ink)]">{shortDate(header.date)}</h1>
        <TopicPills topics={header.topics} />
      </Header>
    );
  }
  return (
    <Header>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold leading-7 text-[var(--ink)]">{header.title}</h1>
          <p className="text-sm leading-5 text-[var(--muted)]">Last worked on {shortDate(header.lastActive)}</p>
        </div>
        {header.passed ? (
          <Pill brand>Passed ✓</Pill>
        ) : (
          <form method="post" action="/api/open">
            {header.topicId && <input type="hidden" name="topic" value={header.topicId} />}
            <button type="submit" className={primaryButtonClass}>
              {header.topicId ? "Resume this Topic" : "Resume"}
            </button>
          </form>
        )}
      </div>
    </Header>
  );
}
