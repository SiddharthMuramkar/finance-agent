"use client";

import { useEffect, useRef, useState } from "react";
import { widgetParts } from "@/widgets/check";
import { Chip, Eyebrow } from "./ui";
import { SaveToNotes, type SaveTarget } from "./save-to-notes";
import { WidgetView } from "./widget-view";
import { FoldedRow } from "./workspace-parts";

/**
 * One Widget in the conversation. key is `${messageId}:${index}`; number counts Widgets across the conversation from 1.
 * The Topic's own explore Widget (shown by code, never written in a reply) has key "explore", number 0 and `explore` set.
 */
export type WidgetItem = { key: string; number: number; code: string; complete: boolean; explore?: true; save?: SaveTarget & { kind: "widget" } };

export const EXPLORE_KEY = "explore";

/** The Topic's explore Widget as a panel item. In an old Session, `sessionId` tells the server which Topic it was played under. */
export const exploreItem = (code: string, sessionId?: number): WidgetItem => ({
  key: EXPLORE_KEY,
  number: 0,
  code,
  complete: true,
  explore: true,
  save: { kind: "widget", widgetIndex: -1, ...(sessionId !== undefined && { sessionId }) },
});

/**
 * A Widget with its quiet "Save to notes" beneath it. The numbers on its sliders are kept as the Learner
 * moves them, so a saved Widget reopens as they left it. Mount it with a key per Widget: its sliders start afresh then.
 */
export function WidgetWithSave({ item, bare = true }: { item: WidgetItem; bare?: boolean }) {
  const settings = useRef<Record<string, number>>({});
  return (
    <>
      <WidgetView code={item.code} complete={item.complete} bare={bare} onSettings={(s) => (settings.current = s)} />
      {item.save && item.complete && (
        <div className="mt-2">
          <SaveToNotes target={item.save} getSettings={() => settings.current} what="Widget" />
        </div>
      )}
    </>
  );
}

/**
 * The Tutor's Widgets with the explore Widget among them, standing after the first `after` of them (those
 * drawn before explore began), so a newer Widget from the Tutor still opens on its own after it.
 */
export function withExplore(widgets: WidgetItem[], explore: { code: string } | null | undefined, after: number, sessionId?: number): WidgetItem[] {
  return explore ? [...widgets.slice(0, after), exploreItem(explore.code, sessionId), ...widgets.slice(after)] : widgets;
}

/**
 * How many of the Tutor's Widgets came before the explore Widget appeared: counted when it first appears,
 * so a page that opens at explore puts it after all of them. Null while there is none.
 */
export function useExploreAnchor(explore: unknown, tutorWidgetCount: number): number {
  const [anchor, setAnchor] = useState<number | null>(explore ? tutorWidgetCount : null);
  if (explore && anchor === null) setAnchor(tutorWidgetCount);
  if (!explore && anchor !== null) setAnchor(null);
  return anchor ?? tutorWidgetCount;
}

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
  // Below the laptop breakpoint the explore Widget stands in the conversation column instead (PinnedExplore),
  // so the panel hides its own copy there and says where it went.
  const hiddenBelowLaptop = shown.explore ? "max-lg:hidden" : "";
  return (
    <>
      {(widgets.length >= 2 || widgets.some((w) => w.explore)) && (
        <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Widgets in this Session">
          {widgets.map((w) => (
            <Chip key={w.key} active={w.key === shown.key} onClick={() => onPick(w.key)} className={w.explore ? "max-lg:hidden" : ""} data-testid={w.explore ? "explore-chip" : undefined}>
              {w.explore ? "Explore" : (widgetParts(w.code).title ?? `Widget ${w.number}`)}
            </Chip>
          ))}
        </div>
      )}
      {shown.explore && (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-6 text-sm leading-5 text-[var(--muted)] lg:hidden">
          The Explore Widget is in the conversation, under the status card.
        </p>
      )}
      <section data-testid="widget-card" className={`rounded-lg border p-4 transition-colors duration-200 ${hiddenBelowLaptop} ${flashing ? "border-[var(--brand)]" : "border-[var(--border)]"}`}>
        {/* Remounts per Widget, so each one fades in over 200ms. */}
        <div key={shown.key} className="transition-opacity duration-200 starting:opacity-0">
          <Eyebrow className="mb-1">{shown.explore ? "Explore" : widgetConcept(shown.code, topicTitle)}</Eyebrow>
          <WidgetWithSave item={shown} />
        </div>
      </section>
    </>
  );
}

/**
 * The explore Widget as a card in the conversation column, for widths below the laptop breakpoint, where the
 * panel does not carry it. A folded row, open to start, so the Learner can tuck it away and read the conversation.
 */
export function PinnedExplore({ item }: { item: WidgetItem }) {
  return (
    <div className="lg:hidden" data-testid="explore-card">
      <FoldedRow label={`Explore · ${widgetParts(item.code).title ?? "Widget"}`} open>
        <WidgetWithSave item={item} />
      </FoldedRow>
    </div>
  );
}
