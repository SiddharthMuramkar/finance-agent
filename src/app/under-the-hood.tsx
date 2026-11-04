import type { TurnUsage } from "@/tutor/usage";
import { Chevron } from "./ui";

const n = (v: number) => v.toLocaleString("en-US");
const usd = (v: number | null) => (v === null ? "unpriced" : `$${v.toFixed(v < 0.01 ? 4 : 3)}`);
const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/**
 * The reply checks' line (spec #229, ticket #239): the words the Learner saw, the checks the draft failed, and
 * whether code retried or fell back. Turns from before the checks have none.
 */
export function replyCheckLine(rc: NonNullable<TurnUsage["replyCheck"]>): string {
  const failed = rc.failed.length ? `Failed ${rc.failed.join(", ")}.` : "Passed every check.";
  const then = rc.fallback ? (rc.retried ? " Retried once, then fell back." : " Fell back with no retry.") : rc.retried ? " Retried once, and the retry passed." : "";
  return `Reply checks: ${rc.words} words. ${failed}${then}`;
}

/** The "under the hood" panel: the loop steps, tools, tokens and cost of one Tutor turn. */
export function UnderTheHood({ usage }: { usage: TurnUsage }) {
  const cell = "px-2 py-1 text-right tabular-nums";
  return (
    <details data-testid="under-the-hood" className="group mt-2 text-xs text-[var(--muted)]">
      <summary className="flex cursor-pointer select-none list-none items-center gap-1.5 [&::-webkit-details-marker]:hidden">
        <Chevron />
        <span>
        Under the hood: {usage.steps.length} {usage.steps.length === 1 ? "step" : "steps"}, {n(usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens)} tokens in,{" "}
        {n(usage.outputTokens)} out, {usd(usage.costUsd)}, {secs(usage.durationMs)}
        </span>
      </summary>
      <div className="mt-2 overflow-x-auto rounded border border-[var(--border)] p-2">
        <p className="mb-2">
          Model {usage.model}. {usage.tools.length ? `Tools called: ${usage.tools.join(", ")}.` : "No tools called."} Each step is one request to the model; a tool call
          makes a new step.
        </p>
        {usage.replyCheck && (
          <p data-testid="reply-check-line" className="mb-2">
            {replyCheckLine(usage.replyCheck)}
          </p>
        )}
        <table className="w-full min-w-[34rem] border-collapse">
          <thead>
            <tr className="border-b border-[var(--border)]">
              <th className="px-2 py-1 text-left font-medium">Step</th>
              <th className="px-2 py-1 text-left font-medium">Tools</th>
              <th className={`${cell} font-medium`}>In</th>
              <th className={`${cell} font-medium`}>Out</th>
              <th className={`${cell} font-medium`}>Thinking</th>
              <th className={`${cell} font-medium`}>Cache read</th>
              <th className={`${cell} font-medium`}>Cache write</th>
              <th className={`${cell} font-medium`}>Time</th>
              <th className={`${cell} font-medium`}>Cost</th>
            </tr>
          </thead>
          <tbody>
            {usage.steps.map((s) => (
              <tr key={s.step}>
                <td className="px-2 py-1">{s.step}</td>
                <td className="px-2 py-1">{s.tools.join(", ") || "none"}</td>
                <td className={cell}>{n(s.inputTokens)}</td>
                <td className={cell}>{n(s.outputTokens)}</td>
                <td className={cell}>{s.thinkingTokens === null ? "n/a" : n(s.thinkingTokens)}</td>
                <td className={cell}>{n(s.cacheReadTokens)}</td>
                <td className={cell}>{n(s.cacheWriteTokens)}</td>
                <td className={cell}>{secs(s.durationMs)}</td>
                <td className={cell}>{usd(s.costUsd)}</td>
              </tr>
            ))}
            <tr className="border-t border-[var(--border)] font-medium">
              <td className="px-2 py-1" colSpan={2}>
                Turn
              </td>
              <td className={cell}>{n(usage.inputTokens)}</td>
              <td className={cell}>{n(usage.outputTokens)}</td>
              <td className={cell}>{usage.thinkingTokens === null ? "n/a" : n(usage.thinkingTokens)}</td>
              <td className={cell}>{n(usage.cacheReadTokens)}</td>
              <td className={cell}>{n(usage.cacheWriteTokens)}</td>
              <td className={cell}>{secs(usage.durationMs)}</td>
              <td className={cell}>{usd(usage.costUsd)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  );
}
