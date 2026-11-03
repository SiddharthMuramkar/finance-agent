import type { TopicOverview } from "@/course/navigator";
import { BackToPathButton, JumpButton } from "./jump-button";

const STATUS: Record<TopicOverview["status"], string> = { not_started: "Not started", in_progress: "In progress", passed: "Passed" };
const STEP: Record<string, string> = { story: "story", concept: "concept", your_turn: "your turn", check: "Check", reveal: "reveal", principle: "principle" };
/** A Topic planned in the outline but not written yet. */
export type ComingTopic = { id: string; title: string; stage: TopicOverview["stage"] };

const STAGE: Record<TopicOverview["stage"], string> = { foundation: "Foundation", follow: "Follow", judge: "Judge", analyse: "Analyse" };

/**
 * The Course Map page: every Topic as a stop on the default path, its Checks marked along the
 * way, and the Learner's place. Built from saved progress only, so it looks the same on every visit.
 */
export function CourseMapView({ topics, coming = [] }: { topics: TopicOverview[]; coming?: ComingTopic[] }) {
  const title = (id: string) => topics.find((t) => t.id === id)?.title ?? id;
  const current = topics.find((t) => t.current);
  const defaultTopic = topics.find((t) => t.onDefaultPath);
  return (
    <div>
      {current && defaultTopic && !current.onDefaultPath && (
        <div className="mb-6 rounded-lg border border-stone-300 p-4 text-sm dark:border-stone-700">
          <p>
            You chose <strong>{current.title}</strong>. The default path continues with {defaultTopic.title}.
          </p>
          <BackToPathButton />
        </div>
      )}
      <ol className="relative border-l border-stone-300 dark:border-stone-700">
        {topics.map((t) => (
          <li key={t.id} data-topic={t.id} className="mb-8 ml-6">
            <span
              aria-hidden
              className={`absolute -left-[7px] mt-1.5 h-3.5 w-3.5 rounded-full border-2 ${
                t.status === "passed"
                  ? "border-teal-700 bg-teal-700 dark:border-teal-400 dark:bg-teal-400"
                  : t.current
                    ? "border-teal-700 bg-stone-50 dark:border-teal-400 dark:bg-stone-950"
                    : "border-stone-400 bg-stone-50 dark:border-stone-600 dark:bg-stone-950"
              }`}
            />
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-medium">{t.title}</h2>
              <span className="text-xs text-stone-500 dark:text-stone-400">
                {STAGE[t.stage]} · {STATUS[t.status]}
                {t.step && t.status === "in_progress" ? ` · at the ${STEP[t.step]} step` : ""}
              </span>
              {t.current && <span className="rounded bg-teal-100 px-1.5 py-0.5 text-xs text-teal-900 dark:bg-teal-900 dark:text-teal-100">You are here</span>}
            </div>
            <ul aria-label={`Checks in ${t.title}`} className="mt-2 flex flex-wrap gap-1.5">
              {t.checks.map((c, i) => (
                <li
                  key={c.id}
                  data-check={c.passed ? "passed" : c.here ? "here" : "open"}
                  title={c.passed ? "Passed" : c.here ? "Your place" : "Not passed yet"}
                  className={`rounded border px-1.5 py-0.5 text-xs tabular-nums ${
                    c.passed
                      ? "border-teal-700 text-teal-800 dark:border-teal-400 dark:text-teal-300"
                      : c.here
                        ? "border-stone-900 dark:border-stone-100"
                        : "border-stone-300 text-stone-500 dark:border-stone-700 dark:text-stone-400"
                  }`}
                >
                  Check {i + 1}
                  {c.passed ? " ✓" : ""}
                </li>
              ))}
            </ul>
            {t.status !== "passed" && t.unmetPrerequisites.length > 0 && (
              <p className="mt-2 text-xs text-stone-500 dark:text-stone-400">Not yet passed: {t.unmetPrerequisites.map(title).join(", ")}</p>
            )}
            {t.status !== "passed" && !t.current && <JumpButton topicId={t.id} title={t.title} unmet={t.unmetPrerequisites.map(title)} />}
          </li>
        ))}
      </ol>
      {coming.length > 0 && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-medium">Coming ({coming.length} more Topics, in path order)</summary>
          <ol className="mt-3 space-y-1.5 text-stone-500 dark:text-stone-400">
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

/** The progress view: each Topic's status and how many of its Checks are passed. */
export function ProgressView({ topics }: { topics: TopicOverview[] }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-stone-300 text-left text-xs text-stone-500 dark:border-stone-700 dark:text-stone-400">
          <th className="py-2 pr-2 font-normal">Topic</th>
          <th className="py-2 pr-2 font-normal">Stage</th>
          <th className="py-2 pr-2 font-normal">Status</th>
          <th className="py-2 font-normal">Checks passed</th>
        </tr>
      </thead>
      <tbody>
        {topics.map((t) => (
          <tr key={t.id} className="border-b border-stone-200 dark:border-stone-800">
            <td className="py-2 pr-2">{t.title}</td>
            <td className="py-2 pr-2">{STAGE[t.stage]}</td>
            <td className="py-2 pr-2">
              <span data-status={t.status}>{STATUS[t.status]}</span>
            </td>
            <td className="py-2 tabular-nums">
              {t.checks.filter((c) => c.passed).length} of {t.checks.length}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
