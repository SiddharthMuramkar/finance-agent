import { taskStates, type TaskState } from "./guided-tasks";

// The pure drawing of Guided Tasks: the redesign's stepper, with each task to do, current or done.
// Colours come from the tokens only.

const DOT: Record<TaskState, string> = {
  done: "border-[var(--brand)] bg-[var(--brand)] text-[var(--brand-ink)]",
  current: "border-[var(--brand)] bg-transparent text-[var(--brand)]",
  todo: "border-[var(--border)] bg-transparent text-[var(--muted)]",
};

const WORDS: Record<TaskState, string> = { done: "Done", current: "Current task", todo: "To do" };

/** `reached` tasks are done; the next one is current; the rest are to do. */
export function GuidedTasksFigure({ tasks, reached }: { tasks: string[]; reached: number }) {
  const states = taskStates(tasks.length, reached);
  return (
    <div className="py-2" data-testid="guided-tasks">
      <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">Try this · practice only</p>
      <ol className="mt-2 space-y-2" aria-label="Guided Tasks">
        {tasks.map((text, i) => (
          <li
            key={i}
            data-state={states[i]}
            aria-current={states[i] === "current" ? "step" : undefined}
            className="flex items-start gap-3 text-sm leading-5"
          >
            <span aria-hidden className={`mt-px flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-medium ${DOT[states[i]]}`}>
              {states[i] === "done" ? "✓" : i + 1}
            </span>
            <span className={states[i] === "done" ? "text-[var(--muted)] line-through" : states[i] === "current" ? "font-medium" : "text-[var(--muted)]"}>
              {text}
            </span>
            <span className="sr-only">{WORDS[states[i]]}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
