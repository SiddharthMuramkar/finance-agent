/** The line under a plot: how to read it, then the value under the pointer or focus, with its unit. */
export function Readout({ text, testid = "plot-readout" }: { text: string | null; testid?: string }) {
  return (
    <p data-testid={testid} className="mt-1 min-h-5 text-sm leading-5 tabular-nums">
      {text ?? <span className="text-[var(--muted)]">Hover over or tap the chart to read a value.</span>}
    </p>
  );
}
