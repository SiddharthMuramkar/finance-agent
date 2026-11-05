// One row of a pop-up menu (the Theme menu, the Widget pager's "All" list): a flat full-width row, so the menu reads as a
// list while each row is still a real button.

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ring)]";

export function MenuItem({ className = "", type = "button", ...props }: React.ComponentProps<"button">) {
  return (
    <button
      type={type}
      role="menuitem"
      data-affordance="button"
      className={`flex min-h-8 w-full items-center gap-2 rounded px-3 text-left text-[length:var(--text-ui)] text-[var(--ink)] hover:bg-[var(--hairline)] disabled:opacity-55 ${focusRing} ${className}`.trim()}
      {...props}
    />
  );
}
