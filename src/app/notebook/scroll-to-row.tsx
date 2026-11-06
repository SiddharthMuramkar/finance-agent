"use client";

import { useEffect } from "react";

/**
 * Scrolls `/notebook#note-<topicId>` to that Topic's row once the rows are drawn (B2b fix round). The page streams in
 * behind loading.tsx, so Next's own hash scroll runs on the skeleton, finds no row and drops it; this runs when the rows
 * mount, and again if the hash moves to another row. Only row anchors (`note-…`); anything else is left to the browser.
 */
export function ScrollToRow() {
  useEffect(() => {
    const toRow = () => {
      // Topic ids are plain ASCII, so the raw hash is the row's id; a hand-typed `%` must not throw.
      const id = window.location.hash.slice(1);
      if (!id.startsWith("note-")) return;
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    };
    toRow();
    window.addEventListener("hashchange", toRow);
    return () => window.removeEventListener("hashchange", toRow);
  }, []);
  return null;
}
