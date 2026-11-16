import type { TopicOverview } from "@/course/navigator";
import { backAt } from "@/tutor/park-items";
import { progressSummary } from "@/course/progress-summary";
import { ButtonLink } from "../primitives";
import { TAUGHT_LIVE } from "@/site/copy";
import { Card, Chevron, Eyebrow, Tag } from "../ui";
import { BackToPathButton, DoFirstLink, TopicRow, WhatComesNextButton } from "./jump-button";

const STATUS: Record<TopicOverview["status"], string> = { not_started: "Not started", in_progress: "In progress", passed: "Passed" };
const STEP: Record<string, string> = { story: "story", concept: "concept", explore: "explore", your_turn: "your turn", check: "Check", reveal: "reveal", principle: "principle" };
/** A Topic planned in the outline but not written yet; a Spine Topic keeps its number and length (spec C6). */
export type ComingTopic = { id: string; title: string; stage: TopicOverview["stage"]; spine?: number; minutes?: number };
/** The Recommended next card: What comes next, as the Course Navigator works it out. */
export type RecommendedNext = { topicId: string; label: string };

const STAGE: Record<TopicOverview["stage"], string> = { spine: "Spine", foundation: "Foundation", follow: "Follow", judge: "Judge", analyse: "Analyse" };
const LATER_STAGES = ["follow", "judge", "analyse"] as const;

/**
 * The marker beside a Topic (Terrastack's numbered steps): its two-digit place in its group, in the accent on the
 * Learner's current Topic and muted otherwise; a passed Topic shows a check in --success instead. Decorative: the Tag says the status.
 */
function Marker({ topic, place }: { topic: TopicOverview; place: number }) {
  const state = topic.status === "passed" ? "passed" : topic.current ? "current" : "todo";
  return (
    <span aria-hidden="true" data-marker={state} className={`mt-[3px] w-6 shrink-0 text-[12px] font-semibold leading-4 tabular-nums ${state === "current" ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>
      {state === "passed" ? (
        <svg viewBox="0 0 16 16" className="h-4 w-4 text-[var(--success)]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 8.5l3.2 3L13 4.5" />
        </svg>
      ) : (
        String(place).padStart(2, "0")
      )}
    </span>
  );
}

/** A Spine Topic's number (spec F2): two digits in the key-number blue, written or coming. Decorative: the list is numbered. */
function SpineNumber({ n }: { n: number }) {
  return (
    <span aria-hidden="true" data-spine-number={n} className="mt-[3px] w-6 shrink-0 text-[12px] font-semibold leading-4 tabular-nums text-key-number">
      {String(n).padStart(2, "0")}
    </span>
  );
}

/** "Used in Spine Topic 4", "Used in Spine Topics 2 and 4", "Used in Spine Topics 1, 8 and 9": which Spine Topics use the idea (spec C6). */
export function usedInWords(numbers: readonly number[]): string {
  if (numbers.length === 1) return `Used in Spine Topic ${numbers[0]}`;
  return `Used in Spine Topics ${numbers.slice(0, -1).join(", ")} and ${numbers[numbers.length - 1]}`;
}

/** "n of m passed", for a group's summary line. */
const passedCount = (group: TopicOverview[]) => `${group.filter((t) => t.status === "passed").length} of ${group.length} passed`;

/**
 * One Topic row: a whole-row link under a hairline, with its numbered marker. A passed row opens the Topic's Session
 * read-only (the Notebook when it has none); the current row opens the current Topic; any other row chooses it. It
 * shows the status as a static Tag and the Checks passed as "n of m" with a segmented bar; unpassed prerequisites are
 * "Do first" links. A Topic not written ahead says it is taught live by the AI Tutor; it opens like any other.
 */
function Row({ t, place, sessionId, title }: { t: TopicOverview; place: number; sessionId: number | undefined; title: (id: string) => string }) {
  const mode = t.status === "passed" ? "passed" : t.current ? "current" : "choose";
  return (
    <TopicRow
      topicId={t.id}
      title={t.title}
      mode={mode}
      status={t.status}
      href={mode === "passed" ? (sessionId ? `/sessions/${sessionId}` : "/notebook") : "/study"}
      unmet={t.unmetPrerequisites.map((id) => ({ id, title: title(id) }))}
      lead={t.spine !== undefined ? <SpineNumber n={t.spine} /> : <Marker topic={t} place={place} />}
    >
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-4 text-[var(--muted)]">
        <Tag tone={t.status === "passed" ? "success" : t.status === "in_progress" ? "brand" : "neutral"}>{STATUS[t.status]}</Tag>
        {t.minutes !== undefined && <span data-minutes={t.minutes}>{t.minutes} min</span>}
        {t.step && t.status === "in_progress" && <span>Teaching Step: {STEP[t.step]}</span>}
        {t.current && <span className="font-semibold text-[var(--accent)]">You are here</span>}
        {t.parkedUntil && <span data-parked={t.id}>Parked · back {backAt(t.parkedUntil)}</span>}
        {!!t.usedInSpine?.length && <span data-used-in-spine={t.usedInSpine.join(" ")}>{usedInWords(t.usedInSpine)}</span>}
        {t.taughtLive && <span data-taught-live>{TAUGHT_LIVE}</span>}
      </p>
      <div className="mt-3 flex items-center gap-2">
        <ul aria-label={`Checks in ${t.title}`} className="flex flex-1 gap-1">
          {t.checks.map((c) => (
            <li
              key={c.id}
              data-segment={c.passed ? "filled" : "empty"}
              data-here={c.here ? "" : undefined}
              title={c.passed ? "Passed" : c.here ? "Your place" : "Not passed yet"}
              className={`h-1 flex-1 rounded-[2px] ${c.passed ? "bg-[var(--accent-fill)]" : c.here ? "bg-[var(--accent-fill)] opacity-40" : "bg-[var(--dim)]"}`}
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

/** A disclosure row on a hairline (Enjoy): no box and no lift, a wash on hover. Group and Coming summaries share it. */
const SUMMARY = "flex min-h-11 cursor-pointer items-center border-b border-[var(--rule)] px-2 text-sm leading-5 transition-colors duration-[var(--dur-ui)] hover:bg-[var(--wash)]";

/** A collapsible group of Topic rows, open when it holds the Learner's focus Topic. The rows sit in columns under hairlines. */
function Group({ label, topics, open, attrs, children }: { label: React.ReactNode; topics: TopicOverview[]; open: boolean; attrs?: Record<string, string>; children: React.ReactNode }) {
  return (
    <details open={open} className="group" {...attrs}>
      <summary className={`${SUMMARY} justify-between gap-3`}>
        <span className="flex items-center gap-2 font-medium">
          <Chevron />
          {label}
        </span>
        <span className="text-xs tabular-nums text-[var(--muted)]">{passedCount(topics)}</span>
      </summary>
      <ol className="card-grid border-b border-[var(--rule)] pb-8 pt-5">{children}</ol>
    </details>
  );
}

/** One row of the Spine: a written Spine Topic, or one still to be written, in its place by number. */
type SpineRow = { spine: number } & ({ written: TopicOverview } | { coming: ComingTopic & { spine: number } });

/** A Spine row not written yet (spec C6, C8): listed in its place with its number and length, but nothing to open. */
function ComingSpineRow({ t }: { t: ComingTopic & { spine: number } }) {
  return (
    <li data-coming={t.id} data-status="coming" className="flex gap-3 border-t border-[var(--rule)] px-3 pb-4 pt-3">
      <SpineNumber n={t.spine} />
      <div className="min-w-0 flex-1">
        <h3 className="text-[15px] font-medium leading-[22px] text-[var(--muted)]">{t.title}</h3>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs leading-4 text-[var(--muted)]">
          <Tag>Coming</Tag>
          {t.minutes !== undefined && <span data-minutes={t.minutes}>{t.minutes} min</span>}
        </p>
      </div>
    </li>
  );
}

/** The Spine's progress (spec F2: Course Map progress in blue): one segment per Spine Topic, passed ones filled, and "n of m passed". */
function SpineProgress({ passed, total }: { passed: number; total: number }) {
  return (
    <div data-spine-progress className="flex min-w-[12rem] flex-1 items-center gap-2 sm:max-w-xs">
      <ul aria-label={`${passed} of ${total} Spine Topics passed`} className="flex flex-1 gap-1">
        {Array.from({ length: total }, (_, i) => (
          <li key={i} data-segment={i < passed ? "filled" : "empty"} className={`h-1 flex-1 rounded-[2px] ${i < passed ? "bg-[var(--accent-fill)]" : "bg-[var(--dim)]"}`} />
        ))}
      </ul>
      <span className="text-xs tabular-nums text-[var(--muted)]">
        {passed} of {total} passed
      </span>
    </div>
  );
}

/**
 * The Course Map page (spec C6). It starts with one Recommended next card (What comes next). Then the Spine, the default
 * path, as one numbered list of its fifteen rows, each with its state, its length and "You are here"; a Spine Topic not
 * written yet still lists, as Coming. Then the Electives (Foundation Topics), grouped by Subject in collapsible sections,
 * each row saying which Spine Topics use its idea; then Follow, Judge and Analyse as their own sections. A group is
 * closed unless it holds the Learner's current Topic (or, with none, the recommended one). Built from saved progress
 * only, so it looks the same on every visit.
 */
export function CourseMapView({
  topics,
  coming = [],
  recommended,
  sessions = {},
  assignmentOpen = false,
}: {
  topics: TopicOverview[];
  /** Whether the Learner has passed the Spine, which opens the Assignment (spec #68). */
  assignmentOpen?: boolean;
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
  const rows = (group: TopicOverview[]) => group.map((t, i) => <Row key={t.id} t={t} place={i + 1} sessionId={sessions[t.id]} title={title} />);
  const foundation = topics.filter((t) => t.stage === "foundation");
  const subjects = [...new Set(foundation.map((t) => t.subject ?? "Other"))];
  // The Spine in its own order: written rows are Topics to open, the rest are Coming in their place.
  const spineRows: SpineRow[] = [
    ...topics.flatMap((t) => (t.stage === "spine" && t.spine !== undefined ? [{ spine: t.spine, written: t }] : [])),
    ...coming.flatMap((t) => (t.stage === "spine" && t.spine !== undefined ? [{ spine: t.spine, coming: { ...t, spine: t.spine } }] : [])),
  ].sort((a, b) => a.spine - b.spine);
  const spinePassed = spineRows.filter((r) => "written" in r && r.written.status === "passed").length;
  const comingLater = coming.filter((t) => t.stage !== "spine");
  const recommendedTopic = recommended ? topics.find((t) => t.id === recommended.topicId) : undefined;
  const nextTitle = recommendedTopic?.title ?? null;
  return (
    <div>
      <h1 className="type-h1">Course Map</h1>
      <p data-progress-summary className="mt-2 text-sm leading-5 text-[var(--muted)]">
        {progressSummary(topics, nextTitle)}
      </p>
      <div className="mt-8 grid items-start gap-[var(--gap)] empty:hidden md:grid-cols-2">
      {recommended && (
        <div data-recommended-next>
          {/* The page's one box (ADR 0018): a hairline edge and a muted eyebrow. */}
          <Card className="!border-[var(--line)]">
            <Eyebrow className="mb-1">Recommended next</Eyebrow>
            {recommendedTopic && (
              <p className="mb-4 text-sm leading-5 text-[var(--muted)]">
                {recommendedTopic.spine !== undefined
                  ? `Spine Topic ${recommendedTopic.spine}${recommendedTopic.minutes !== undefined ? ` · ${recommendedTopic.minutes} minutes` : ""}`
                  : (recommendedTopic.subject ?? STAGE[recommendedTopic.stage])}
                {recommendedTopic.status === "in_progress" && recommendedTopic.step ? ` · Teaching Step: ${STEP[recommendedTopic.step]}` : ""}
              </p>
            )}
            <WhatComesNextButton label={recommended.label} />
          </Card>
        </div>
      )}
      {current && defaultTopic && !current.onDefaultPath && (
        // A hairline, not the ink rule: it sits beside the page's one box and must not outweigh it.
        <Card variant="rule" className="!border-[var(--rule)] text-sm leading-5">
          <p>
            You chose <strong>{current.title}</strong>. The default path continues with {defaultTopic.title}.
          </p>
          <BackToPathButton />
        </Card>
      )}
      </div>
      {spineRows.length > 0 && (
        <section data-stage="spine" aria-labelledby="stage-spine" className="mt-12">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
            <h2 id="stage-spine" className="type-h2">
              Spine
            </h2>
            <SpineProgress passed={spinePassed} total={spineRows.length} />
          </div>
          <p className="mb-4 text-sm leading-5 text-[var(--muted)]">The default path: {spineRows.length} short Topics that teach valuation in order.</p>
          <ol data-spine aria-label="Spine Topics" className="border-b border-[var(--rule)]">
            {spineRows.map((r) =>
              "written" in r ? (
                <Row key={r.written.id} t={r.written} place={r.spine} sessionId={sessions[r.written.id]} title={title} />
              ) : (
                <ComingSpineRow key={r.coming.id} t={r.coming} />
              ),
            )}
          </ol>
        </section>
      )}
      {spineRows.length > 0 && (
        <section data-stage="assignment" aria-labelledby="stage-assignment" className="mt-12">
          <h2 id="stage-assignment" className="type-h2">
            Assignment
          </h2>
          {assignmentOpen ? (
            <div className="mt-2 flex flex-col items-start gap-3">
              <p className="text-sm leading-5 text-[var(--muted)]">Value a listed Indian company you pick, from its annual report: your Own Case.</p>
              <ButtonLink href="/assignment" variant="secondary" size="sm" data-assignment-link>
                Value a company you pick
              </ButtonLink>
            </div>
          ) : (
            <p className="mt-2 text-sm leading-5 text-[var(--muted)]">Opens once you pass every Spine Topic: then you value a company you pick.</p>
          )}
        </section>
      )}
      {foundation.length > 0 && (
        <section data-stage="foundation" aria-labelledby="stage-foundation" className="mt-12">
          <h2 id="stage-foundation" className="type-h2">
            Electives
          </h2>
          <p className="mb-4 mt-2 text-sm leading-5 text-[var(--muted)]">Open any of these at any time.</p>
          <div className="border-t border-[var(--rule)]">
            {subjects.map((subject) => {
              const inSubject = foundation.filter((t) => (t.subject ?? "Other") === subject);
              return (
                <Group key={subject} label={subject} topics={inSubject} open={holdsFocus(inSubject)} attrs={{ "data-subject": subject }}>
                  {rows(inSubject)}
                </Group>
              );
            })}
          </div>
        </section>
      )}
      {LATER_STAGES.map((stage) => {
        const inStage = topics.filter((t) => t.stage === stage);
        if (!inStage.length) return null;
        return (
          <section key={stage} data-stage={stage} aria-labelledby={`stage-${stage}`} className="mt-12">
            <h2 id={`stage-${stage}`} className="type-h2 mb-4">
              {STAGE[stage]}
            </h2>
            <div className="border-t border-[var(--rule)]">
              <Group label={`${inStage.length} Topics`} topics={inStage} open={holdsFocus(inStage)}>
                {rows(inStage)}
              </Group>
            </div>
          </section>
        );
      })}
      {comingLater.length > 0 && (
        <details className="group mt-12 border-t border-[var(--rule)] text-sm">
          <summary className={`${SUMMARY} gap-2 font-medium`}>
            <Chevron />
            Coming ({comingLater.length} more Topics, in path order)
          </summary>
          <ol className="divide-y divide-[var(--rule)] border-b border-[var(--rule)] text-[var(--muted)]">
            {comingLater.map((t) => (
              <li key={t.id} data-coming={t.id} className="px-2 py-2.5 leading-5">
                {t.title} <span className="text-xs">· {STAGE[t.stage]} · coming</span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
