import Link from "next/link";
import { Eyebrow, Pill } from "./ui";

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "5 Sep 2026": always a three-letter month (Intl prints "Sept" for September). */
export function shortDate(d: Date): string {
  const parts = Object.fromEntries(dateFormat.formatToParts(d).map((p) => [p.type, p.value]));
  return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.year}`;
}

/** One Session in the Past Sessions list: eyebrow, a title from its first Topic and date, a pill per Topic and the Widget count. */
export function SessionCard({ id, number, createdAt, topics, widgets }: { id: number; number: number; createdAt: Date; topics: string[]; widgets: number }) {
  const date = shortDate(createdAt);
  const title = topics.length ? `${topics[0]}, ${date}` : `Session ${number}, ${date}`;
  return (
    <Link
      href={`/sessions/${id}`}
      className="flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4 transition-colors duration-200 hover:border-[var(--brand-line)] hover:bg-[var(--brand-tint)]"
    >
      <Eyebrow>
        Session {number} · {date.toUpperCase()}
      </Eyebrow>
      <span className="text-base font-medium leading-6 text-[var(--ink)]">{title}</span>
      <span className="flex flex-wrap gap-2">
        {topics.map((t) => (
          <Pill key={t} brand>
            {t}
          </Pill>
        ))}
        <Pill>
          {widgets} {widgets === 1 ? "Widget" : "Widgets"}
        </Pill>
      </span>
    </Link>
  );
}
