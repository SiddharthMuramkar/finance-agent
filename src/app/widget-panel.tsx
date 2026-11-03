"use client";

import { useEffect, useRef, useState } from "react";
import { widgetParts } from "@/widgets/check";
import { Chip, Eyebrow } from "./ui";
import { WidgetView } from "./widget-view";

/** One Widget in the conversation. key is `${messageId}:${index}`; number counts Widgets across the conversation from 1. */
export type WidgetItem = { key: string; number: number; code: string; complete: boolean };

/** What a Widget's components show, for the card's eyebrow: read by the parser, else the current Topic's title. */
export function widgetConcept(code: string, topicTitle: string | undefined): string {
  const { components } = widgetParts(code);
  if (components.includes("AnnuityChart")) return "Present value";
  if (components.includes("HistoryChart")) return "Case Data";
  if (components.includes("Calculator")) return "Calculator";
  return topicTitle ?? "Widget";
}

/**
 * Which Widget the panel shows: the one picked, else the newest. Picking flashes the card border for 1s.
 * `clear` forgets the pick, so a new turn's Widget shows on its own.
 */
export function useWidgetPicker(widgets: WidgetItem[]) {
  const [picked, setPicked] = useState<string>();
  const [flashing, setFlashing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const pick = (key: string) => {
    setPicked(key);
    setFlashing(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlashing(false), 1000);
  };
  const shown = widgets.find((w) => w.key === picked) ?? widgets.at(-1);
  return { shown, pick, flashing, clear: () => setPicked(undefined) };
}

/** The chip standing where a Widget belongs in a reply; it shows that Widget in the panel. */
export function WidgetChip({ item, active, onPick }: { item: WidgetItem; active: boolean; onPick: (key: string) => void }) {
  return (
    <span className="my-3 block">
      <Chip active={active} onClick={() => onPick(item.key)} data-testid="widget-chip">
        Widget {item.number} {item.complete ? "→" : "(drawing…)"}
      </Chip>
    </span>
  );
}

/**
 * The Widget panel beside the conversation: a chip per Widget (from two on), then one card with a concept
 * eyebrow and the Widget, or a dashed empty box before the Tutor has built any. Read-only callers can
 * leave out onPick's side effects; the panel never calls the model.
 */
export function WidgetPanel({
  widgets,
  shown,
  flashing = false,
  onPick,
  topicTitle,
}: {
  widgets: WidgetItem[];
  shown: WidgetItem | undefined;
  flashing?: boolean;
  onPick: (key: string) => void;
  topicTitle?: string;
}) {
  if (!shown) {
    return <p className="rounded-lg border border-dashed border-[var(--border)] p-6 text-sm leading-5 text-[var(--muted)]">Widgets the Tutor builds appear here.</p>;
  }
  return (
    <>
      {widgets.length >= 2 && (
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Widgets in this Session">
          {widgets.map((w) => (
            <Chip key={w.key} active={w.key === shown.key} onClick={() => onPick(w.key)}>
              {widgetParts(w.code).title ?? `Widget ${w.number}`}
            </Chip>
          ))}
        </div>
      )}
      <section data-testid="widget-card" className={`rounded-lg border p-4 transition-colors duration-200 ${flashing ? "border-[var(--brand)]" : "border-[var(--border)]"}`}>
        {/* Remounts per Widget, so each one fades in over 200ms. */}
        <div key={shown.key} className="transition-opacity duration-200 starting:opacity-0">
          <Eyebrow className="mb-1">{widgetConcept(shown.code, topicTitle)}</Eyebrow>
          <WidgetView code={shown.code} complete={shown.complete} bare />
        </div>
      </section>
    </>
  );
}
