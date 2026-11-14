// The icon-only button: a 32px square ghost (ADR 0013). Kept apart from the header so the client ThemeToggle can use it.

/**
 * A button that is only an icon, 32x32, transparent until hovered, its SVG drawn at 16px with a 1.75 stroke. label names
 * it for screen readers (aria-label); tip is its tooltip (title), which is the label unless given; pressed marks a toggle
 * that is on (aria-pressed).
 */
export function IconButton({
  label,
  tip,
  pressed,
  className = "",
  type = "button",
  children,
  ...props
}: Omit<React.ComponentProps<"button">, "aria-label" | "title"> & { label: string; tip?: string; pressed?: boolean }) {
  return (
    <button type={type} data-affordance="icon" aria-label={label} title={tip ?? label} aria-pressed={pressed} className={`btn btn-icon ${className}`.trim()} {...props}>
      {children}
    </button>
  );
}
