import type { ReactNode } from "react";
import type { PastSessionHeader } from "@/tutor/past-sessions";
import { Eyebrow, LinkButton, PrimaryButton, Pill, TextLink } from "./ui";

/**
 * The header above one Session's page (spec #119, reshaped by 2026-11-05 B2a: the list is the Notebook now). Plain
 * markup and links; Resume this Topic is a form post to /api/open, so it works without scripts.
 */

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "numeric", year: "numeric", timeZone: "Asia/Kolkata" });
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "5 Sep 2026": always a three-letter month (Intl prints "Sept" for September). */
export function shortDate(d: Date): string {
  const parts = Object.fromEntries(dateFormat.formatToParts(d).map((p) => [p.type, p.value]));
  return `${Number(parts.day)} ${MONTHS[Number(parts.month) - 1]} ${parts.year}`;
}

/** "4 Nov": the day and month, for a row that sits under a Topic (the year is in the Session's own page). */
export function dayMonth(d: Date): string {
  return shortDate(d).replace(/ \d{4}$/, "");
}

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

function Header({ back, children }: { back: string; children: ReactNode }) {
  return (
    <header className="mb-4 flex flex-col gap-2">
      <TextLink href={back} className="self-start text-sm leading-5">
        ← Notebook
      </TextLink>
      {children}
    </header>
  );
}

/**
 * The top of one Session's page: a back link to the Notebook, then for a Topic Session its Topic, the date
 * last worked on and Resume this Topic (Passed ✓ once passed); for an Earlier attempt (a Topic started over) its date, "read-only" and Go to the current attempt; for an Older session its date, the Topics it
 * touched (or No Topic) and "Older session · read-only", with no Resume.
 */
export function PastSessionHeaderView({ header }: { header: PastSessionHeader }) {
  if (header.kind === "older") {
    return (
      <Header back="/notebook">
        <Eyebrow>Older session · read-only</Eyebrow>
        <h1 className="text-lg font-semibold leading-[26px] text-[var(--ink)]">{shortDate(header.date)}</h1>
        <TopicPills topics={header.topics} />
      </Header>
    );
  }
  if (header.kind === "earlier") {
    return (
      <Header back={`/notebook#note-${header.topicId}`}>
        <Eyebrow>Earlier attempt · {shortDate(header.date)} · read-only</Eyebrow>
        <h1 className="text-lg font-semibold leading-[26px] text-[var(--ink)]">{header.title}</h1>
        <form method="post" action="/api/open" className="self-start text-sm leading-5">
          <input type="hidden" name="topic" value={header.topicId} />
          <LinkButton type="submit">Go to the current attempt</LinkButton>
        </form>
      </Header>
    );
  }
  return (
    <Header back={header.topicId ? `/notebook#note-${header.topicId}` : "/notebook"}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold leading-[26px] text-[var(--ink)]">{header.title}</h1>
          <p className="text-sm leading-5 text-[var(--muted)]">Last worked on {shortDate(header.lastActive)}</p>
          {header.found && header.found.length > 0 && (
            <p data-testid="session-found" className="mt-1 text-sm leading-5">
              {header.found.join(" ")}
            </p>
          )}
        </div>
        {header.passed ? (
          <Pill brand>Passed ✓</Pill>
        ) : (
          <form method="post" action="/api/open">
            {header.topicId && <input type="hidden" name="topic" value={header.topicId} />}
            <PrimaryButton type="submit">{header.topicId ? "Resume this Topic" : "Resume"}</PrimaryButton>
          </form>
        )}
      </div>
    </Header>
  );
}
