import type { TopicOverview } from "@/course/navigator";
import { Card, Eyebrow, KeyValueRow, Pill } from "../ui";
import { BackToPathButton, JumpButton } from "./jump-button";

const STATUS: Record<TopicOverview["status"], string> = { not_started: "Not started", in_progress: "In progress", passed: "Passed" };
const STEP: Record<string, string> = { story: "story", concept: "concept", explore: "explore", your_turn: "your turn", check: "Check", reveal: "reveal", principle: "principle" };
/** A Topic planned in the outline but not written yet. */
export type ComingTopic = { id: string; title: string; stage: TopicOverview["stage"] };

const STAGE: Record<TopicOverview["stage"], string> = { foundation: "Foundation", follow: "Follow", judge: "Judge", analyse: "Analyse" };
const STAGE_ORDER = ["foundation", "follow", "judge", "analyse"] as const;

/** Dot beside a Topic (spec §5.6): todo = field fill with a brand-line ring, current = brand fill, passed = brand fill with a check. */
function Dot({ topic }: { topic: TopicOverview }) {
  const state = topic.status === "passed" ? "passed" : topic.current ? "current" : "todo";
  const look = state === "todo" ? "border-[var(--brand-line)] bg-[var(--field)]" : "border-[var(--brand)] bg-[var(--brand)]";
  return (
    <span aria-hidden data-dot={state} className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${look}`}>
      {state === "passed" && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5 text-[var(--brand-ink)]" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.5l2.5 2.5 4.5-5" />
        </svg>
      )}
    </span>
  );
}

/**
 * The Course Map page: Topics grouped by Stage in course order, each group a list in default-path
 * order with a dot for todo, current or passed. Foundation rows carry a Subject pill. Built from
 * saved progress only, so it looks the same on every visit.
 */
export function CourseMapView({ topics, coming = [] }: { topics: TopicOverview[]; coming?: ComingTopic[] }) {
  const title = (id: string) => topics.find((t) => t.id === id)?.title ?? id;
  const current = topics.find((t) => t.current);
  const defaultTopic = topics.find((t) => t.onDefaultPath);
  return (
    <div>
      {current && defaultTopic && !current.onDefaultPath && (
        <Card className="mb-6 text-sm leading-5">
          <p>
            You chose <strong>{current.title}</strong>. The default path continues with {defaultTopic.title}.
          </p>
          <BackToPathButton />
        </Card>
      )}
      {STAGE_ORDER.map((stage) => {
        const inStage = topics.filter((t) => t.stage === stage);
        if (!inStage.length) return null;
        return (
          <section key={stage} data-stage={stage} aria-labelledby={`stage-${stage}`} className="mb-8">
            <h2 id={`stage-${stage}`} className="mb-2 text-base font-semibold leading-6">
              {STAGE[stage]}
            </h2>
            <ol className="border-t border-[var(--hairline)]">
              {inStage.map((t) => (
                <li key={t.id} data-topic={t.id} className="flex gap-3 border-b border-[var(--hairline)] py-3">
                  <Dot topic={t} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <h3 className="font-medium leading-5">{t.title}</h3>
                      {t.subject && <Pill brand>{t.subject}</Pill>}
                      <span className="text-xs leading-4 text-[var(--muted)]">
                        {STATUS[t.status]}
                        {t.step && t.status === "in_progress" ? ` · Teaching Step: ${STEP[t.step]}` : ""}
                      </span>
                      {t.current && <Pill>You are here</Pill>}
                    </div>
                    <ul aria-label={`Checks in ${t.title}`} className="mt-2 flex flex-wrap gap-1.5">
                      {t.checks.map((c, i) => (
                        <li
                          key={c.id}
                          data-check={c.passed ? "passed" : c.here ? "here" : "open"}
                          title={c.passed ? "Passed" : c.here ? "Your place" : "Not passed yet"}
                          className={`rounded border px-1.5 py-0.5 text-xs tabular-nums ${
                            c.passed
                              ? "border-[var(--brand)] text-[var(--brand)]"
                              : c.here
                                ? "border-[var(--ink)] text-[var(--ink)]"
                                : "border-[var(--border)] text-[var(--muted)]"
                          }`}
                        >
                          Check {i + 1}
                          {c.passed ? " ✓" : ""}
                        </li>
                      ))}
                    </ul>
                    {t.status !== "passed" && t.unmetPrerequisites.length > 0 && (
                      <p className="mt-2 text-xs leading-4 text-[var(--muted)]">Not yet passed: {t.unmetPrerequisites.map(title).join(", ")}</p>
                    )}
                    {t.status !== "passed" && !t.current && <JumpButton topicId={t.id} title={t.title} unmet={t.unmetPrerequisites.map(title)} />}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
      {coming.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">Coming ({coming.length} more Topics, in path order)</summary>
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

/**
 * The Progress page's body: a title, a one-line summary ("<n> in progress · <n> passed · Next: <title>",
 * Next being What comes next's Topic), then each Topic's status and how many of its Checks are passed.
 * Every row's title opens its Topic: a plain form post to /api/open, so it works without scripts.
 */
export function ProgressView({ topics, next = null }: { topics: TopicOverview[]; next?: string | null }) {
  const count = (status: TopicOverview["status"]) => topics.filter((t) => t.status === status).length;
  const summary = [`${count("in_progress")} in progress`, `${count("passed")} passed`, ...(next ? [`Next: ${next}`] : [])].join(" · ");
  return (
    <div>
      <h1 className="text-xl font-semibold leading-7">Progress</h1>
      <p data-progress-summary className="mb-6 mt-1 text-sm leading-5 text-[var(--muted)]">
        {summary}
      </p>
      <Eyebrow className="mb-2">Topics</Eyebrow>
      <div>
        {topics.map((t) => (
          <KeyValueRow
            key={t.id}
            label={
              <>
                <form method="post" action="/api/open" className="inline">
                  <input type="hidden" name="topic" value={t.id} />
                  <button type="submit" data-open-topic={t.id} className="text-left text-[var(--ink)] underline decoration-[var(--hairline)] underline-offset-4 hover:text-[var(--brand)] hover:decoration-current">{t.title}</button>
                </form>{" "}
                <span className="text-xs">· {STAGE[t.stage]}</span>
              </>
            }
            value={
              <span className="flex items-center gap-3">
                <span className="tabular-nums text-[var(--muted)]">
                  {t.checks.filter((c) => c.passed).length} of {t.checks.length}
                </span>
                <Pill brand={t.status !== "not_started"}>
                  <span data-status={t.status}>{STATUS[t.status]}</span>
                </Pill>
              </span>
            }
          />
        ))}
      </div>
    </div>
  );
}
