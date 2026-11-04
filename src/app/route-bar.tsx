"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

// The thin bar across the top of the window while a page change loads (spec 8.6). A link press starts it; it creeps to 80%
// and waits; when the address changes it runs to the end and fades. It is decorative (aria-hidden): the link's own pending
// dot and the page's loading skeleton carry the state for everyone else.

type Phase = "idle" | "loading" | "done";

/** The internal page a plain left-click would open, or null (new tab, modifier key, download, other site, same page). */
function destination(e: MouseEvent): string | null {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  const a = e.target instanceof Element ? e.target.closest("a") : null;
  if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return null;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  return url.pathname + url.search;
}

export function RouteBar() {
  // useSearchParams needs a Suspense boundary in a statically built layout; the bar draws nothing while it waits.
  return (
    <Suspense fallback={null}>
      <RouteBarInner />
    </Suspense>
  );
}

function RouteBarInner() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [phase, setPhase] = useState<Phase>("idle");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!destination(e)) return;
      clear();
      setPhase("loading");
      // A page that never arrives must not leave the bar hanging.
      later(() => setPhase("idle"), 15_000);
    };
    // Capture phase: next/link calls preventDefault in its own handler, which would otherwise run first.
    document.addEventListener("click", onClick, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      clear();
    };
  }, []);

  // The address changed: finish the run, then fade.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    clear();
    setPhase((p) => (p === "loading" ? "done" : p));
    later(() => setPhase("idle"), 400);
  }, [pathname, search]);

  return (
    <div
      aria-hidden="true"
      data-testid="route-bar"
      data-phase={phase}
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
      style={{ opacity: phase === "idle" ? 0 : 1, transition: "opacity 200ms ease-out" }}
    >
      <div
        className="h-full bg-[var(--brand)]"
        style={{
          width: phase === "idle" ? "0%" : phase === "loading" ? "80%" : "100%",
          transition: phase === "loading" ? "width 700ms cubic-bezier(0.22, 1, 0.36, 1)" : phase === "done" ? "width 150ms ease-out" : "none",
        }}
      />
    </div>
  );
}
