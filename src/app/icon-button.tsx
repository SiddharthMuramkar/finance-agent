// The icon-only button (kept apart from ui.tsx so the client ThemeMenu can use it without importing the header).

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

/**
 * A button that is only an icon, at least 32x32. label names it for screen readers (aria-label) and as a tooltip;
 * pressed marks a toggle that is on (aria-pressed).
 */
export function IconButton({ label, pressed, className = "", type = "button", children, ...props }: Omit<React.ComponentProps<"button">, "aria-label"> & { label: string; pressed?: boolean }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={`pressable inline-flex min-h-8 min-w-8 items-center justify-center rounded text-[var(--muted)] hover:bg-[var(--hairline)] hover:text-[var(--ink)] disabled:opacity-50 ${pressed ? "bg-[var(--brand-tint)] text-[var(--brand)]" : ""} ${focusRing} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
