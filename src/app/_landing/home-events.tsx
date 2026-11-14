"use client";

import { useEffect } from "react";
import { track } from "../analytics";

/**
 * Join pressed, with the section it was pressed in (spec 2026-11-12 E10). Home's Join early access buttons are server
 * markup (chrome.tsx's HomeMainButton, marked `data-join`), so one listener on the document hears every press and reads
 * the section from the nearest `data-home-section` (header, hero, closing). It sends no personal data: the event name
 * and the section only. Drawn once on Home; it renders nothing.
 */
export function HomeJoinEvents() {
  useEffect(() => {
    const onPress = (event: MouseEvent) => {
      const join = event.target instanceof Element ? event.target.closest("[data-join]") : null;
      if (!join) return;
      track("home_join_pressed", { section: join.closest("[data-home-section]")?.getAttribute("data-home-section") ?? "other" });
    };
    document.addEventListener("click", onPress, true);
    return () => document.removeEventListener("click", onPress, true);
  }, []);
  return null;
}
