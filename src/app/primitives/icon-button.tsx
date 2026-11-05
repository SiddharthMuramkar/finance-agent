// The icon-only button: a round raised surface (spec A3a). Kept apart from the header so the client ThemeMenu can use it.

/**
 * A round button that is only an icon, 36x36. label names it for screen readers (aria-label) and as a tooltip (title);
 * pressed marks a toggle that is on (aria-pressed).
 */
export function IconButton({ label, pressed, className = "", type = "button", children, ...props }: Omit<React.ComponentProps<"button">, "aria-label"> & { label: string; pressed?: boolean }) {
  return (
    <button type={type} data-affordance="icon" aria-label={label} title={label} aria-pressed={pressed} className={`btn btn-icon ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
