import type { TopicOverview } from "./navigator";

/** The Course Map's summary line: "<n> in progress · <n> passed · <n> to go · Next: <title>" (Next left out when nothing comes next). */
export function progressSummary(topics: Pick<TopicOverview, "status">[], next: string | null): string {
  const count = (status: TopicOverview["status"]) => topics.filter((t) => t.status === status).length;
  return [`${count("in_progress")} in progress`, `${count("passed")} passed`, `${count("not_started")} to go`, ...(next ? [`Next: ${next}`] : [])].join(" · ");
}
