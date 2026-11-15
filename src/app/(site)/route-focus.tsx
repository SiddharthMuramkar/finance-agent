"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Spec 7.1 and 9.4: on every route change, focus moves to the page's h1 (`.page-h1`, tabindex -1), so a keyboard or
 * screen-reader user starts at the new page's title. The first load keeps the browser's own focus. Renders nothing.
 */
export function RouteFocus() {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const h1 = document.querySelector<HTMLElement>("main .page-h1");
    h1?.focus({ preventScroll: true });
  }, [pathname]);
  return null;
}
