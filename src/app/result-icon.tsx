// The tick or cross beside a result's words, on its own so that a light view (Home's section 3 Quick try, through
// quick-try-view.tsx) draws it without pulling in the Topic bar and its menus (workspace-parts.tsx re-exports it).
// Server-safe: no "use client".

/**
 * Right or wrong as an icon beside the words that say it (ADR 0015: status is never colour alone): a tick in --success,
 * a cross in --danger. Decorative: the words carry the meaning. `className` sizes it (16px unless given).
 */
export function ResultIcon({ ok, className = "size-4" }: { ok: boolean; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      data-result={ok ? "right" : "wrong"}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 ${ok ? "text-[var(--success)]" : "text-[var(--danger)]"} ${className}`}
    >
      <path d={ok ? "M13 4.5 6.5 11 3 7.5" : "M12 4 4 12M4 4l8 8"} />
    </svg>
  );
}
