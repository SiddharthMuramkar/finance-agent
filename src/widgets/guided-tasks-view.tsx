import { taskStates, type TaskState } from "./guided-tasks";

// The pure drawing of Guided Tasks: a light "Things to try" list (#533), with each task tried, next or for later.
// No numbers and no status words like "Current task": it is play, not homework. Colours come from the tokens only.

const MARK: Record<TaskState, string> = {
  done: "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-ink)]",
  current: "border-[var(--brand)] bg-[var(--brand)]",
  todo: "border-[var(--border)] bg-transparent",
};

/** What a screen reader hears after each task: soft words, never a homework status. */
const WORDS: Record<TaskState, string> = { done: "Tried", current: "Try next", todo: "Later" };

/** `reached` tasks are done; the next one is current; the rest are to do. */
export function GuidedTasksFigure({ tasks, reached }: { tasks: string[]; reached: number }) {
  const states = taskStates(tasks.length, reached);
  return (
    <div className="py-2" data-testid="guided-tasks">
      <p className="text-xs font-medium text-[var(--muted)]">Things to try</p>
      <ul className="mt-2 space-y-2" aria-label="Things to try">
        {tasks.map((text, i) => (
          <li
            key={i}
            data-state={states[i]}
            aria-current={states[i] === "current" ? "step" : undefined}
            className="flex items-start gap-3 text-sm leading-5"
          >
            {states[i] === "done" ? (
              <span aria-hidden className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-xs ${MARK.done}`}>
                ✓
              </span>
            ) : (
              <span aria-hidden className="mt-px flex size-5 shrink-0 items-center justify-center">
                <span className={`size-2 rounded-full border ${MARK[states[i]]}`} />
              </span>
            )}
            <span className={states[i] === "done" ? "text-[var(--muted)] line-through" : states[i] === "current" ? "font-medium" : "text-[var(--muted)]"}>
              {text}
            </span>
            <span className="sr-only">{WORDS[states[i]]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
