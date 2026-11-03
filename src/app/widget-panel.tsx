"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { CaseData } from "@/case-data/case-data";
import { fetchCaseData, splitReference, type CaseLoad } from "@/widgets/case-data-client";
import { useCaseLoad } from "@/widgets/case-data-provider";
import { Credit, SourcedTag } from "@/widgets/case-data-view";
import { widgetParts, widgetProblems } from "@/widgets/check";
import { SavedTicksContext, type SavedTicks } from "@/widgets/saved-ticks";
import { widgetKey } from "@/widgets/widget-state";
import { allTasksTicked } from "@/widgets/widget-reading";
import { Chip, Eyebrow, SecondaryButton } from "./ui";
import { SaveToNotes, type SaveTarget } from "./save-to-notes";
import { useWidgetStore } from "./widget-states";
import { WidgetView } from "./widget-view";
import { FoldedRow } from "./workspace-parts";

/**
 * One Widget in the conversation. key is `${messageId}:${index}`; number counts Widgets across the conversation from 1.
 * The Topic's own explore Widget (shown by code, never written in a reply) has key "explore", number 0 and `explore` set.
 */
export type WidgetItem = {
  key: string;
  number: number;
  code: string;
  complete: boolean;
  explore?: true;
  /** A written-ahead Widget the Tutor opened: its id in the Topic file, which is its Widget key. */
  writtenAhead?: string;
  save?: SaveTarget & { kind: "widget" };
  /** The keys of earlier Widgets with the same title that this one updated in place (see updatedInPlace). */
  replaces?: string[];
};

/** True when the Widget is the one `key` names: its own key, or that of an earlier Widget it updated in place. */
export const holdsKey = (item: WidgetItem, key: string | undefined): boolean => key !== undefined && (item.key === key || !!item.replaces?.includes(key));

/**
 * The Widgets with each update made in place: a Tutor Widget with the same title as an earlier one takes that
 * one's tab (its place in the list) instead of adding a tab, and keeps the earlier keys, so the earlier reply's
 * chip opens it too. The explore Widget is never matched.
 */
export function updatedInPlace(widgets: readonly WidgetItem[]): WidgetItem[] {
  const out: { item: WidgetItem; title: string | undefined }[] = [];
  for (const item of widgets) {
    const title = item.explore ? undefined : widgetParts(item.code).title?.trim() || undefined;
    const at = title ? out.findIndex((o) => o.title === title) : -1;
    if (at === -1) out.push({ item, title });
    else out[at] = { item: { ...item, replaces: [...(out[at].item.replaces ?? []), out[at].item.key] }, title };
  }
  return out.map((o) => o.item);
}

export const EXPLORE_KEY = "explore";

/** Tailwind's lg breakpoint: from here the panel carries the explore Widget; below it, the conversation column does. */
const LAPTOP = "(min-width: 1024px)";

/** The width a server render assumes: a laptop, as the layout is desktop-first. Tests render the narrow case with NarrowScreen. */
const ServerWidth = createContext<"laptop" | "narrow">("laptop");

/** Renders its children as on a screen below the laptop breakpoint, where no screen is measured (the server, tests). */
export function NarrowScreen({ children }: { children: ReactNode }) {
  return <ServerWidth.Provider value="narrow">{children}</ServerWidth.Provider>;
}

const watchWidth = (changed: () => void) => {
  const query = window.matchMedia(LAPTOP);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
};

/**
 * Whether the screen is at least laptop width, kept up to date as it resizes. The explore Widget is drawn in one
 * place only, chosen by this, so it is mounted once: no hidden copy keeps its own sliders or fetches its own data.
 */
function useLaptopWidth(): boolean {
  const server = useContext(ServerWidth) === "laptop";
  return useSyncExternalStore(watchWidth, () => window.matchMedia(LAPTOP).matches, () => server);
}

/** The Topic's explore Widget as a panel item. In an old Session, `sessionId` tells the server which Topic it was played under. */
export const exploreItem = (code: string, sessionId?: number): WidgetItem => ({
  key: EXPLORE_KEY,
  number: 0,
  code,
  complete: true,
  explore: true,
  save: { kind: "widget", widgetIndex: -1, ...(sessionId !== undefined && { sessionId }) },
});

/** Each Case a Widget's Case Data references read, by Case id; null for one the server did not give. */
export type SourcedCases = Record<string, CaseData | null>;

/**
 * Loads each Case the references read, once each, through the server's as-of rule (nothing dated after the
 * Case's as-of date until its reveal has been shown). Never rejects. `loadCase` defaults to the browser fetch.
 */
export async function loadSourcedCases(datasets: readonly string[], loadCase: CaseLoad = (caseId) => fetchCaseData(caseId)): Promise<SourcedCases> {
  const caseIds = [...new Set(datasets.flatMap((ref) => splitReference(ref)?.caseId ?? []))];
  const cases = await Promise.all(caseIds.map((caseId) => loadCase(caseId)));
  return Object.fromEntries(caseIds.map((caseId, i) => [caseId, cases[i]]));
}

/** The Cases a Widget's Case Data references read, through the page's shared Case loads; undefined while they load. */
function useSourcedCases(datasets: readonly string[], loadCase: CaseLoad): SourcedCases | undefined {
  const wanted = datasets.join(" ");
  const [loaded, setLoaded] = useState<{ wanted: string; cases: SourcedCases }>();
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    loadSourcedCases(wanted.split(" "), loadCase).then((cases) => {
      if (live) setLoaded({ wanted, cases });
    });
    return () => {
      live = false;
    };
  }, [wanted, loadCase]);
  return loaded?.wanted === wanted ? loaded.cases : undefined;
}

/**
 * The thin amber strip under a Widget that draws Case Data through Query("case_data"): a line per dataset with the
 * Sourced tag, its label and its ⓘ credit, plus what stays withheld until the reveal. Nothing while the data
 * loads, and no line for a dataset the server does not have or withholds: the Widget's own line under the chart
 * already says its data could not be loaded, and why.
 */
export function SourcedStrip({ datasets, cases }: { datasets: readonly string[]; cases: SourcedCases | undefined }) {
  const lines = datasets.flatMap((ref) => {
    const parts = splitReference(ref);
    const data = parts && cases?.[parts.caseId];
    const dataset = data?.datasets.find((d) => d.id === parts?.datasetId);
    return data && dataset ? [{ ref, data, dataset }] : [];
  });
  if (!lines.length) return null;
  return (
    <div className="mt-2 space-y-1" data-testid="sourced-strip">
      {lines.map(({ ref, data, dataset }) => (
        <div key={ref} data-kind="sourced" className="rounded-md border-l-4 border-[var(--src-line)] bg-[var(--src-tint)] px-2 py-1 text-sm">
          <SourcedTag /> {dataset.label} <Credit dataset={dataset} />
          {!data.revealed && <span className="block text-xs text-[var(--muted)]">Data after {data.asOf} is withheld until the reveal.</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * How a Widget tells the Tutor what the Learner found (spec #119, "Tell the Tutor what I found"): `tell` runs a
 * widget report turn for the Widget key, and `busy` is true while a turn runs. Only the Study Workspace gives it;
 * elsewhere (Notes, Older sessions, Home) no Widget offers the button.
 */
export type WidgetReport = { tell: (key: string) => void; busy: boolean };

export const WidgetReportContext = createContext<WidgetReport | null>(null);

/** The words on the button under a Widget whose Guided Tasks are all ticked. */
export const TELL_THE_TUTOR = "Tell the Tutor what I found →";

/**
 * A Widget with the Sourced strip for the Case Data it draws through Query("case_data"), and its quiet "Save to
 * notes" beneath it. Each Case it reads comes from the page's shared Case Data cache, for its Queries, its charts
 * and its strip together. Mount it with a key per Widget: its sliders start afresh then.
 *
 * In the Study Workspace its slider values and ticked Guided Tasks are saved with the Session under its Widget key
 * (Widget state, see widget-states.tsx), so it draws as the Learner left it after a reload or a tab switch, and
 * Save to notes keeps the same values under the same key. Elsewhere they are kept only while it is on screen.
 */
export function WidgetWithSave({ item, bare = true }: { item: WidgetItem; bare?: boolean }) {
  const settings = useRef<Record<string, number>>({});
  const loadCase = useCaseLoad();
  const store = useWidgetStore();
  // Only a finished Widget has a key: a streaming one's title may not be complete yet.
  const key = store && item.complete ? (item.writtenAhead ?? widgetKey(widgetParts(item.code).title, item.explore)) : undefined;
  // What it starts from is read once, as it mounts: later saves come from the Widget itself.
  const [start] = useState(() => (key ? store?.saved(key) : undefined));
  // The ticked Guided Tasks so far, kept here too, so Tell the Tutor what I found shows the moment the last one ticks.
  const [ticked, setTicked] = useState<readonly string[]>(() => start?.ticked ?? []);
  const ticks = useMemo<SavedTicks | null>(
    () =>
      store && key
        ? {
            ticked: start?.ticked ?? [],
            onTicked: (done) => {
              store.save(key, { ticked: done });
              setTicked((now) => [...new Set([...now, ...done])]);
            },
          }
        : null,
    [store, key, start],
  );
  const report = useContext(WidgetReportContext);
  const canReport = !!report && !!key && item.complete && allTasksTicked(item.code, ticked);
  const onSettings = (s: Record<string, number>) => {
    settings.current = s;
    if (store && key) store.save(key, { values: s });
  };
  // Only a finished Widget that passes the check is drawn, so only its Case Data gets the strip.
  const datasets = useMemo(() => (item.complete && !widgetProblems(item.code).length ? widgetParts(item.code).datasets : []), [item.code, item.complete]);
  const cases = useSourcedCases(datasets, loadCase);
  return (
    <>
      <SavedTicksContext.Provider value={ticks}>
        <WidgetView code={item.code} complete={item.complete} bare={bare} onSettings={onSettings} loadCase={loadCase} initialValues={start?.values} />
      </SavedTicksContext.Provider>
      <SourcedStrip datasets={datasets} cases={cases} />
      {canReport && (
        <div className="mt-3">
          <SecondaryButton onClick={() => report.tell(key)} disabled={report.busy} data-testid="tell-the-tutor">
            {TELL_THE_TUTOR}
          </SecondaryButton>
        </div>
      )}
      {item.save && item.complete && (
        <div className="mt-2">
          <SaveToNotes
            target={key ? { ...item.save, widgetKey: key } : item.save}
            getSettings={() => (key && store?.saved(key)?.values) || settings.current}
            what="Widget"
          />
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

/** OpenUI's ready-made charts and table, which draw whatever numbers they are given. */
const KIT_FIGURES = new Set(["Table", "BarChart", "LineChart", "AreaChart", "HorizontalBarChart", "RadarChart", "PieChart", "RadialChart", "SingleStackedBarChart", "ScatterChart"]);

/**
 * What a Widget shows, for the card's eyebrow, read by the parser: the code its numbers come from (a component or
 * Widget tool of ours: Present value, Case Data, Calculator, Formula); else "Illustration", for a ready-made chart
 * or table whose numbers none of our code supplies, so the Tutor typed them as a made-up example; else the
 * current Topic's title.
 */
export function widgetConcept(code: string, topicTitle: string | undefined): string {
  const { components, tools } = widgetParts(code);
  const parts = new Set<string>([...components, ...tools]);
  const uses = (...names: string[]) => names.some((name) => parts.has(name));
  if (uses("AnnuityChart", "annuity_schedule")) return "Present value";
  if (uses("HistoryChart", "case_data")) return "Case Data";
  if (uses("Calculator", "calculate", "calculate_range")) return "Calculator";
  if (uses("FormulaCard")) return "Formula";
  if (components.some((name) => KIT_FIGURES.has(name))) return "Illustration";
  return topicTitle ?? "Widget";
}

/**
 * The card's eyebrow: "Explore" over the explore Widget; the current Topic's title over a finished Widget the
 * check refuses, which shows only the fallback note, so nothing is drawn to name; else the concept its parts
 * show (widgetConcept). A refused Widget with a kit chart would otherwise read "Illustration" over the note.
 */
function eyebrowFor(item: WidgetItem, topicTitle: string | undefined): string {
  if (item.explore) return "Explore";
  if (item.complete && widgetProblems(item.code).length) return topicTitle ?? "Widget";
  return widgetConcept(item.code, topicTitle);
}

/**
 * Which Widget the panel shows: the one picked, else the newest (`newest` names it by key when it is not last,
 * as when it updated an earlier tab in place). Picking flashes the card border for 1s.
 * `clear` forgets the pick, so a new turn's Widget shows on its own.
 */
export function useWidgetPicker(widgets: WidgetItem[], newest?: string) {
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
  const shown = widgets.find((w) => holdsKey(w, picked)) ?? widgets.find((w) => holdsKey(w, newest)) ?? widgets.at(-1);
  return { shown, picked, pick, flashing, clear: () => setPicked(undefined) };
}

/** What a Widget is called on its tab and chip: "Explore" for the explore Widget, else its title, never a number. */
export function widgetName(item: WidgetItem): string {
  if (item.explore) return "Explore";
  return widgetParts(item.code).title?.trim() || "Untitled Widget";
}

/** The chip standing where a Widget belongs in a reply: "Open: <title> →"; it shows that Widget in the panel. */
export function WidgetChip({ item, active, onPick }: { item: WidgetItem; active: boolean; onPick: (key: string) => void }) {
  const name = widgetName(item);
  return (
    <span className="my-3 block">
      <Chip active={active} onClick={() => onPick(item.key)} data-testid="widget-chip" className="max-w-full" title={name}>
        <span className="min-w-0 truncate">{item.complete ? `Open: ${name} →` : `${name} (drawing…)`}</span>
      </Chip>
    </span>
  );
}

/**
 * A quiz Check in the panel: its own tab, first in the row ("Check 1 of 2"), and the quiz under it. `selected`
 * shows the quiz instead of a Widget. The quiz stays mounted while another tab is shown, so answers picked
 * so far, or a marking on screen, survive a look at a Widget.
 */
export type CheckTab = { name: string; selected: boolean; onPick: () => void; body: ReactNode };

/**
 * The Widget panel beside the conversation: a tab per Widget, named by title (from two on), then one card with a concept
 * eyebrow and the Widget, or a dashed empty box before the Tutor has built any. With an open quiz Check, its tab
 * comes first and the row always shows. Read-only callers can leave out onPick's side effects; the panel never
 * calls the model.
 */
export function WidgetPanel({
  widgets,
  shown,
  flashing = false,
  onPick,
  topicTitle,
  check,
}: {
  widgets: WidgetItem[];
  shown: WidgetItem | undefined;
  flashing?: boolean;
  onPick: (key: string) => void;
  topicTitle?: string;
  check?: CheckTab;
}) {
  const laptop = useLaptopWidth();
  if (!shown && !check) {
    return <p className="rounded-lg border border-dashed border-[var(--border)] p-6 text-sm leading-5 text-[var(--muted)]">Widgets for this Topic will appear here.</p>;
  }
  const checkShown = !!check && (check.selected || !shown);
  // Below the laptop breakpoint the explore Widget stands in the conversation column instead (PinnedExplore),
  // so the panel draws no copy of its own there and says where it went.
  const elsewhere = shown?.explore && !laptop;
  return (
    <>
      {(check || widgets.length >= 2 || widgets.some((w) => w.explore)) && (
        // One line of tabs that scrolls sideways, never wrapping; a long title is cut short with an ellipsis (full title on hover).
        <div className="mb-3 flex flex-nowrap gap-2 overflow-x-auto pb-1" role="group" aria-label="Widgets in this Session">
          {check && (
            <Chip active={checkShown} onClick={check.onPick} className="shrink-0" data-testid="check-tab">
              {check.name}
            </Chip>
          )}
          {widgets.map((w) => (
            <Chip
              key={w.key}
              active={!checkShown && w.key === shown?.key}
              onClick={() => onPick(w.key)}
              className={`max-w-56 shrink-0 ${w.explore ? "max-lg:hidden" : ""}`}
              title={widgetName(w)}
              data-testid={w.explore ? "explore-chip" : undefined}
            >
              <span className="min-w-0 truncate">{widgetName(w)}</span>
            </Chip>
          ))}
        </div>
      )}
      {check && (
        <section aria-label={check.name} data-testid="check-card" hidden={!checkShown} className="rounded-lg border border-[var(--border)] p-4">
          {check.body}
        </section>
      )}
      {shown && !checkShown && elsewhere && (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-6 text-sm leading-5 text-[var(--muted)]">
          The Explore Widget is in the conversation, under the Topic bar.
        </p>
      )}
      {shown && !checkShown && !elsewhere && (
        <section data-testid="widget-card" className={`rounded-lg border p-4 transition-colors duration-200 ${flashing ? "border-[var(--brand)]" : "border-[var(--border)]"}`}>
          {/* Remounts per Widget, so each one fades in over 200ms. */}
          <div key={shown.key} className="transition-opacity duration-200 starting:opacity-0">
            <Eyebrow className="mb-1">{eyebrowFor(shown, topicTitle)}</Eyebrow>
            <WidgetWithSave item={shown} />
          </div>
        </section>
      )}
    </>
  );
}

/**
 * The explore Widget as a card in the conversation column, for widths below the laptop breakpoint, where the
 * panel does not carry it; nothing at a laptop width. A folded row, open to start, so the Learner can tuck it away
 * and read the conversation.
 */
export function PinnedExplore({ item }: { item: WidgetItem }) {
  if (useLaptopWidth()) return null;
  return (
    <div data-testid="explore-card">
      <FoldedRow label={`Explore · ${widgetParts(item.code).title ?? "Widget"}`} open>
        <WidgetWithSave item={item} />
      </FoldedRow>
    </div>
  );
}
