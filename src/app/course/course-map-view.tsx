import type { TopicOverview } from "@/course/navigator";
import { backAt } from "@/tutor/park-items";
import { progressSummary } from "@/course/progress-summary";
import { Card, Chevron, Eyebrow, Pill, Tag } from "../ui";
import { BackToPathButton, DoFirstLink, TopicRow, WhatComesNextButton } from "./jump-button";

const STATUS: Record<TopicOverview["status"], string> = { not_started: "Not started", in_progress: "In progress", passed: "Passed" };
const STEP: Record<string, string> = { story: "story", concept: "concept", explore: "explore", your_turn: "your turn", check: "Check", reveal: "reveal", principle: "principle" };
/** A Topic planned in the outline but not written yet. */
export type ComingTopic = { id: string; title: string; stage: TopicOverview["stage"] };
/** The Recommended next card: What comes next, as the Course Navigator works it out. */
export type RecommendedNext = { topicId: string; label: string };

const STAGE: Record<TopicOverview["stage"], string> = { foundation: "Foundation", follow: "Follow", judge: "Judge", analyse: "Analyse" };
const LATER_STAGES = ["follow", "judge", "analyse"] as const;

/** Dot beside a Topic (spec §5.6): todo = small brand-line dot, current = brand fill, passed = brand fill with a check. */
function Dot({ topic }: { topic: TopicOverview }) {
  const state = topic.status === "passed" ? "passed" : topic.current ? "current" : "todo";
  // A todo Topic is a small solid dot, not an empty ring, so the marker never reads as a radio button or checkbox.
  const look = state === "todo" ? "m-[5px] mt-[9px] h-1.5 w-1.5 bg-[var(--brand-line)]" : "mt-1 h-4 w-4 border-2 border-[var(--brand)] bg-[var(--brand)]";
  return (
    <span aria-hidden data-dot={state} className={`flex shrink-0 items-center justify-center self-start rounded-full ${look}`}>
      {state === "passed" && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-[var(--brand-ink)]" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.5l2.5 2.5 4.5-5" />
        </svg>
      )}
    </span>
  );
}

/** "n of m passed", for a group's summary line. */
const passedCount = (group: TopicOverview[]) => `${group.filter((t) => t.status === "passed").length} of ${group.length} passed`;

/**
 * One Topic card: a whole-card link. A passed card opens the Topic's Session read-only (Past Sessions when it
 * has none); the current card opens the current Topic; any other card chooses it. It shows the status as a
 * static Tag and the Checks passed as "n of m" with a segmented bar; unpassed prerequisites are "Do first" links.
 */
function Row({ t, sessionId, title }: { t: TopicOverview; sessionId: number | undefined; title: (id: string) => string }) {
  const mode = t.status === "passed" ? "passed" : t.current ? "current" : "choose";
  return (
    <TopicRow
      topicId={t.id}
      title={t.title}
      mode={mode}
      status={t.status}
      href={mode === "passed" ? (sessionId ? `/sessions/${sessionId}` : "/sessions") : "/study"}
      unmet={t.unmetPrerequisites.map((id) => ({ id, title: title(id) }))}
      lead={<Dot topic={t} />}
    >
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-4 text-[var(--muted)]">
        <Tag tone={t.status === "passed" ? "mint" : t.status === "in_progress" ? "brand" : "neutral"}>{STATUS[t.status]}</Tag>
        {t.step && t.status === "in_progress" && <span>Teaching Step: {STEP[t.step]}</span>}
        {t.current && <Pill>You are here</Pill>}
        {t.parkedUntil && <span data-parked={t.id}>Parked · back {backAt(t.parkedUntil)}</span>}
      </p>
      <div className="mt-2 flex items-center gap-2">
        <ul aria-label={`Checks in ${t.title}`} className="flex flex-1 gap-1">
          {t.checks.map((c) => (
            <li
              key={c.id}
              data-segment={c.passed ? "filled" : "empty"}
              data-here={c.here ? "" : undefined}
              title={c.passed ? "Passed" : c.here ? "Your place" : "Not passed yet"}
              className={`h-1.5 flex-1 rounded-full ${c.passed ? "bg-[var(--mint)]" : "bg-[var(--hairline)]"} ${c.here ? "ring-1 ring-[var(--brand)]" : ""}`}
            />
          ))}
        </ul>
        <span className="text-xs tabular-nums text-[var(--muted)]">
          {t.checks.filter((c) => c.passed).length} of {t.checks.length}
        </span>
      </div>
      {t.status !== "passed" && t.unmetPrerequisites.length > 0 && (
        <p className="mt-2 text-xs leading-4 text-[var(--muted)]">
          {"Do first: "}
          {t.unmetPrerequisites.map((id, i) => (
            <span key={id}>
              {i > 0 && ", "}
              <DoFirstLink topicId={id} title={title(id)} />
            </span>
          ))}
        </p>
      )}
    </TopicRow>
  );
}

/** A collapsible group of Topic rows, open when it holds the Learner's focus Topic. */
function Group({ label, topics, open, attrs, children }: { label: React.ReactNode; topics: TopicOverview[]; open: boolean; attrs?: Record<string, string>; children: React.ReactNode }) {
  return (
    <details open={open} className="group mb-3" {...attrs}>
      <summary className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-[var(--edge)] bg-[var(--field)] px-3 py-2 text-sm leading-5 shadow-[0_2px_0_var(--edge)] hover:bg-[var(--brand-tint)] active:translate-y-px active:shadow-none">
        <span className="flex items-center gap-2 font-medium">
          <Chevron />
          {label}
        </span>
        <span className="text-xs text-[var(--muted)]">{passedCount(topics)}</span>
      </summary>
      <ol className="card-grid mt-3">{children}</ol>
    </details>
  );
}

/**
 * The Course Map page. It starts with one Recommended next card (What comes next). Foundation Topics are
 * grouped by Subject in collapsible sections, and Follow, Judge and Analyse are their own sections; the
 * group holding the Learner's current Topic (or, with none, the recommended one) is open. Built from saved
 * progress only, so it looks the same on every visit.
 */
export function CourseMapView({
  topics,
  coming = [],
  recommended,
  sessions = {},
}: {
  topics: TopicOverview[];
  coming?: ComingTopic[];
  /** What comes next; null once every Topic is passed. */
  recommended: RecommendedNext | null;
  /** Each Topic's live Session, by Topic id: a passed row opens it read-only. */
  sessions?: Record<string, number>;
}) {
  const title = (id: string) => topics.find((t) => t.id === id)?.title ?? id;
  const current = topics.find((t) => t.current);
  const defaultTopic = topics.find((t) => t.onDefaultPath);
  const focus = current?.id ?? recommended?.topicId;
  const holdsFocus = (group: TopicOverview[]) => group.some((t) => t.id === focus);
  const rows = (group: TopicOverview[]) => group.map((t) => <Row key={t.id} t={t} sessionId={sessions[t.id]} title={title} />);
  const foundation = topics.filter((t) => t.stage === "foundation");
  const subjects = [...new Set(foundation.map((t) => t.subject ?? "Other"))];
  const recommendedTopic = recommended ? topics.find((t) => t.id === recommended.topicId) : undefined;
  const nextTitle = recommendedTopic?.title ?? null;
  return (
    <div>
      <h1 className="text-xl font-semibold leading-7">Course Map</h1>
      <p data-progress-summary className="mb-6 mt-1 text-sm leading-5 text-[var(--muted)]">
        {progressSummary(topics, nextTitle)}
      </p>
      <div className="mb-6 grid items-start gap-3 empty:hidden md:grid-cols-2">
      {recommended && (
        <div data-recommended-next>
          <Card>
            <Eyebrow className="mb-1">Recommended next</Eyebrow>
            {recommendedTopic && (
              <p className="mb-3 text-sm leading-5 text-[var(--muted)]">
                {recommendedTopic.subject ?? STAGE[recommendedTopic.stage]}
                {recommendedTopic.status === "in_progress" && recommendedTopic.step ? ` · Teaching Step: ${STEP[recommendedTopic.step]}` : ""}
              </p>
            )}
            <WhatComesNextButton label={recommended.label} />
          </Card>
        </div>
      )}
      {current && defaultTopic && !current.onDefaultPath && (
        <Card className="text-sm leading-5">
          <p>
            You chose <strong>{current.title}</strong>. The default path continues with {defaultTopic.title}.
          </p>
          <BackToPathButton />
        </Card>
      )}
      </div>
      {foundation.length > 0 && (
        <section data-stage="foundation" aria-labelledby="stage-foundation" className="mb-8">
          <h2 id="stage-foundation" className="mb-2 text-base font-semibold leading-6">
            Foundation
          </h2>
          {subjects.map((subject) => {
            const inSubject = foundation.filter((t) => (t.subject ?? "Other") === subject);
            return (
              <Group key={subject} label={subject} topics={inSubject} open={holdsFocus(inSubject)} attrs={{ "data-subject": subject }}>
                {rows(inSubject)}
              </Group>
            );
          })}
        </section>
      )}
      {LATER_STAGES.map((stage) => {
        const inStage = topics.filter((t) => t.stage === stage);
        if (!inStage.length) return null;
        return (
          <section key={stage} data-stage={stage} aria-labelledby={`stage-${stage}`} className="mb-8">
            <h2 id={`stage-${stage}`} className="mb-2 text-base font-semibold leading-6">
              {STAGE[stage]}
            </h2>
            <Group label={`${inStage.length} Topics`} topics={inStage} open={holdsFocus(inStage)}>
              {rows(inStage)}
            </Group>
          </section>
        );
      })}
      {coming.length > 0 && (
        <details className="group mt-4 text-sm">
          <summary className="flex cursor-pointer items-center gap-2 rounded-xl border border-[var(--edge)] bg-[var(--field)] px-3 py-2 font-medium shadow-[0_2px_0_var(--edge)] hover:bg-[var(--brand-tint)] active:translate-y-px active:shadow-none">
            <Chevron />
            Coming ({coming.length} more Topics, in path order)
          </summary>
          <ol className="mt-3 space-y-1.5 text-[var(--muted)]">
            {coming.map((t) => (
              <li key={t.id} data-coming={t.id}>
                {t.title} <span className="text-xs">· {STAGE[t.stage]} · coming</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
