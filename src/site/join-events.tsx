"use client";

import { useEffect } from "react";
import { track } from "@/app/analytics";

/**
 * Join pressed, with the place it was pressed in (spec 2026-11-12 E10, kept for the Signal site). Every "Join early
 * access" button on the public pages is server markup marked `data-join`, so one listener on the document hears every
 * press and reads the place from the nearest `data-site-section` (nav, hero, closing, case and so on). It sends no
 * personal data: the event name and the place only. Drawn once, in the site layout; it renders nothing.
 */
export function SiteJoinEvents() {
  useEffect(() => {
    const onPress = (event: MouseEvent) => {
      const join = event.target instanceof Element ? event.target.closest("[data-join]") : null;
      if (!join) return;
      track("home_join_pressed", { section: join.closest("[data-site-section]")?.getAttribute("data-site-section") ?? "other" });
    };
    document.addEventListener("click", onPress, true);
    return () => document.removeEventListener("click", onPress, true);
  }, []);
  return null;
}
