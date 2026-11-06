"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { CaseData } from "@/case-data/case-data";
import { fetchCaseData, splitReference, type CaseLoad } from "@/widgets/case-data-client";
import { useCaseLoad } from "@/widgets/case-data-provider";
import { Credit, SourcedTag } from "@/widgets/case-data-view";
import { isEmojiName, type EmojiName } from "@/emoji/registry";
import { archetypeOf, widgetParts, widgetProblems } from "@/widgets/check";
import { SavedTicksContext, type SavedTicks } from "@/widgets/saved-ticks";
import { widgetKey } from "@/widgets/widget-state";
import { allTasksTicked } from "@/widgets/widget-reading";
import { Button, Chip, Eyebrow, SecondaryButton, type ChipState } from "./ui";
import { track, widgetLane } from "./analytics";
import { SaveToNotes, type SaveTarget } from "./save-to-notes";
import { useWidgetStore } from "./widget-states";
import { WidgetView } from "./widget-view";
import { keepsOwnArrows, WidgetPager, type PagerEntry } from "./widget-pager";
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
  /** The slider values the Widget was opened or shown at (by $variable): its chip puts them back when pressed. */
  preset?: Record<string, number>;
  /** Where the Widget came from: "recipe", "compose" or "fallback" for one the Tutor's tools made; absent for one written in the reply. */
  source?: string;
};

/** How long a chip or card may say "Drawing…" before it admits the Widget did not arrive. */
export const DRAWING_TIMEOUT_MS = 12_000;

/** When each Widget (by key) was first seen drawing, so the timing events measure from the fence, not from the render. */
const drawingSince = new Map<string, number>();

/**
 * Lets the page re-ask for a Widget that never arrived (the Retry on a timed-out chip). The Study Workspace may give
 * it; without one, Retry only gives the Widget another 12 seconds.
 */
export const WidgetRetryContext = createContext<((key: string) => void) | null>(null);

/**
 * True once `drawing` has been true for DRAWING_TIMEOUT_MS since the last token (`received` grows with each) (the Widget's fence or tool call began and nothing
 * finished it). `retry` starts the wait again. Sends widget_timeout once per give-up.
 */
function useDrawingGuard(key: string, drawing: boolean, received = 0) {
  const [timedOut, setTimedOut] = useState(false);
  const [round, setRound] = useState(0);
  const retryWith = useContext(WidgetRetryContext);
  useEffect(() => {
    if (!drawing) return;
    if (!drawingSince.has(key)) drawingSince.set(key, performance.now());
    const timer = setTimeout(() => {
      setTimedOut(true);
      track("widget_timeout", { lane: "fence" });
    }, DRAWING_TIMEOUT_MS);
    return () => clearTimeout(timer);
    // `received` is how much of the Widget has arrived: each new token starts the wait again, so it counts from the last one.
  }, [key, drawing, round, received]);
  return {
    timedOut: timedOut && drawing,
    retry: () => {
      setTimedOut(false);
      setRound((r) => r + 1);
      retryWith?.(key);
    },
  };
}

/** The quiet failure a Widget shows when it has been drawing too long: a plain line and a Retry, never a spinner forever. */
function DrawingFailed({ retry, compact = false }: { retry: () => void; compact?: boolean }) {
  return (
    <div
      data-testid="widget-timeout"
      role="status"
      className={`flex items-center justify-between gap-3 text-sm text-[var(--muted)] ${compact ? "my-3 rounded border border-[var(--border)] px-3 py-1.5" : ""}`}
    >
      <span>The Widget did not arrive.</span>
      <Button variant="secondary" size="sm" onClick={retry} data-testid="widget-retry">
        Retry
      </Button>
    </div>
  );
}

/** True when the Widget is the one `key` names: its own key, or that of an earlier Widget it updated in place. */
export const holdsKey = (item: WidgetItem, key: string | undefined): boolean => key !== undefined && (item.key === key || !!item.replaces?.includes(key));

/**
 * The Widgets with each update made in place: a Tutor Widget with the same title as an earlier one takes that
 * one's tab (its place in the list) instead of adding a tab, and keeps the earlier keys, so the earlier reply's
 * chip opens it too. The explore Widget is never matched by title, but it is one Widget with the written-ahead
 * Widget it is: when the Tutor opens that one too, the two share one tab, the explore Widget's, and its chip opens it.
 */
export function updatedInPlace(widgets: readonly WidgetItem[]): WidgetItem[] {
  const out: { item: WidgetItem; title: string | undefined }[] = [];
  for (const item of widgets) {
    const title = item.explore ? undefined : widgetParts(item.code).title?.trim() || undefined;
    const at = out.findIndex((o) => (title && o.title === title) || (!!item.writtenAhead && o.item.writtenAhead === item.writtenAhead));
    if (at === -1) {
      out.push({ item, title });
      continue;
    }
    const earlier = out[at].item;
    const kept = earlier.explore && !item.explore ? earlier : item;
    const other = kept === item ? earlier : item;
    out[at] = { item: { ...kept, replaces: [...new Set([...(earlier.replaces ?? []), ...(item.replaces ?? []), other.key])] }, title: out[at].title ?? title };
  }
  return out.map((o) => o.item);
}

export const EXPLORE_KEY = "explore";

/** The pager's key for the Check tab; no Widget's key looks like it (theirs are `${messageId}:${index}` or "explore"). */
const CHECK_ENTRY = "check";

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

/**
 * The Topic's explore Widget as a panel item: a written-ahead Widget (`id`), so its work is saved under that id. In an
 * old Session, `sessionId` tells the server which Topic it was played under.
 */
export const exploreItem = (code: string, sessionId: number | undefined, id: string): WidgetItem => ({
  key: EXPLORE_KEY,
  number: 0,
  code,
  complete: true,
  explore: true,
  writtenAhead: id,
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
 * Save to notes keeps the same values under the same key. Elsewhere (Home, for one) they are kept only while it is
 * on screen, and with no `save` there is no Save to notes. It reads only these fields of the conversation's item.
 */
export function WidgetWithSave({
  item,
  bare = true,
}: {
  item: Pick<WidgetItem, "code" | "complete" | "explore" | "writtenAhead" | "save"> & Partial<Pick<WidgetItem, "key" | "source">>;
  bare?: boolean;
}) {
  const settings = useRef<Record<string, number>>({});
  const loadCase = useCaseLoad();
  const store = useWidgetStore();
  // Only a finished Widget has a key: a streaming one's title may not be complete yet.
  const key = store && item.complete ? (item.writtenAhead ?? widgetKey(widgetParts(item.code).title)) : undefined;
  // Bumped when the server pushes new slider values (the Tutor updated this Widget): the sliders remount at them.
  const revision = useSyncExternalStore(
    (changed) => store?.subscribe(changed) ?? (() => {}),
    () => (store && key ? store.revision(key) : 0),
    () => 0,
  );
  // What it starts from is read as it mounts, and again when its code changes (a reveal task joining the explore
  // Widget draws it afresh), so it starts from the Learner's work so far: later saves come from the Widget itself.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- read again when the code changes, not on every save
  const start = useMemo(() => (key ? store?.saved(key) : undefined), [store, key, item.code, revision]);
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
  const timing = useWidgetTiming(item.complete, item.key, widgetLane(item.source), widgetParts(item.code).title?.trim() ?? "", revision);
  return (
    <div className="contents" ref={timing}>
      <SavedTicksContext.Provider value={ticks}>
        <WidgetView key={revision} code={item.code} complete={item.complete} bare={bare} onSettings={onSettings} loadCase={loadCase} initialValues={start?.values} />
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
    </div>
  );
}

/**
 * Sends widget_first_pixel when a finished Widget first renders and widget_interactive when its first control is
 * enabled, once each per Widget, timed from when it began drawing (or from mounting, for one that never drew).
 * widget_fallback goes once when the Widget is the fallback the server drew in place of a refused one.
 */
function useWidgetTiming(complete: boolean, key: string | undefined, lane: string, recipe: string, revision: number) {
  const root = useRef<HTMLDivElement>(null);
  const [mountedAt] = useState(() => performance.now());
  const sent = useRef({ pixel: false, interactive: false });
  useEffect(() => {
    const el = root.current;
    if (!complete || !el) return;
    const since = (key && drawingSince.get(key)) || mountedAt;
    const ms = () => Math.round(performance.now() - since);
    if (!sent.current.pixel) {
      sent.current.pixel = true;
      track("widget_first_pixel", { lane, recipe, ms: ms() });
      if (lane === "fallback") track("widget_fallback", { recipe });
    }
    if (sent.current.interactive) return;
    const enabled = () => !!el.querySelector('input:not([disabled]), button:not([disabled]), select:not([disabled]), [role="slider"]');
    const done = () => {
      sent.current.interactive = true;
      track("widget_interactive", { lane, recipe, ms: ms() });
    };
    if (enabled()) return done();
    if (typeof MutationObserver === "undefined") return;
    const watch = new MutationObserver(() => {
      if (!enabled()) return;
      watch.disconnect();
      done();
    });
    watch.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    return () => watch.disconnect();
  }, [complete, key, lane, recipe, revision, mountedAt]);
  return root;
}

/**
 * The Tutor's Widgets with the explore Widget among them, standing after the first `after` of them (those
 * drawn before explore began), so a newer Widget from the Tutor still opens on its own after it.
 */
export function withExplore(widgets: WidgetItem[], explore: { code: string; id: string } | null | undefined, after: number, sessionId?: number): WidgetItem[] {
  return explore ? [...widgets.slice(0, after), exploreItem(explore.code, sessionId, explore.id), ...widgets.slice(after)] : widgets;
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

/** Each archetype's lead emoji, for a Widget whose own params name none (E5's filmstrip thumbnails). */
const ARCHETYPE_EMOJI: Record<string, EmojiName> = {
  Grow: "seedling",
  Compare: "balance-scale",
  History: "scroll",
  Formula: "ledger",
  Predict: "direct-hit",
  Check: "check-mark-button",
  Rank: "trophy",
  Chain: "link",
  Convert: "coin",
};

/**
 * A Widget's lead emoji (E5): the first emoji name in its params (the first quoted word of its code that is in
 * the emoji registry, as a story part's cast or a Lingo card writes it), else its archetype's emoji, else sparkles.
 */
export function leadEmojiOf(code: string): EmojiName {
  for (const m of code.matchAll(/"([^"]+)"/g)) {
    if (isEmojiName(m[1])) return m[1];
  }
  const archetype = archetypeOf(code);
  return (archetype && ARCHETYPE_EMOJI[archetype]) || "sparkles";
}

/**
 * Which Widget the panel shows: the one picked, else the newest (`newest` names it by key when it is not last,
 * as when it updated an earlier tab in place). Picking sets `flashing` for 600ms, the length of the ring pulse the
 * panel plays around the card.
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
    timer.current = setTimeout(() => setFlashing(false), 600);
  };
  const shown = widgets.find((w) => holdsKey(w, picked)) ?? widgets.find((w) => holdsKey(w, newest)) ?? widgets.at(-1);
  /** The key "Back to latest" returns to: the newest Widget's own tab, which may be an earlier tab it updated in place. */
  const newestKey = widgets.find((w) => holdsKey(w, newest))?.key ?? widgets.at(-1)?.key;
  return { shown, picked, pick, flashing, newestKey, clear: () => setPicked(undefined) };
}

/** What a Widget is called on its tab and chip: "Explore" for the explore Widget, else its title, never a number. */
export function widgetName(item: WidgetItem): string {
  if (item.explore) return "Explore";
  return widgetParts(item.code).title?.trim() || "Untitled Widget";
}

/**
 * The chip standing where a Widget belongs in a reply: a 36px card-link with the Widget's title and three states.
 * Idle "View widget →"; Showing (filled brand) while the panel shows that Widget; Drawing… (a shimmer) while its
 * fence is still being written. Pressing it shows that Widget in the panel; pressing the one already showing
 * scrolls the panel to the top and pulses it.
 */
export function WidgetChip({ item, active, onPick }: { item: WidgetItem; active: boolean; onPick: (key: string) => void }) {
  // A chip the Tutor's open_widget left names the Widget by title, even when it is the explore Widget's tab.
  const name = (item.writtenAhead && widgetParts(item.code).title?.trim()) || widgetName(item);
  const state: ChipState = !item.complete ? "drawing" : active ? "showing" : "idle";
  const guard = useDrawingGuard(item.key, !item.complete, item.code.length);
  const store = useWidgetStore();
  // Pressing a chip reopens the Widget at the numbers it was opened with, not where the Learner left it since.
  const reopenKey = item.complete && item.preset ? (item.writtenAhead ?? widgetKey(widgetParts(item.code).title)) : undefined;
  const pick = (key: string) => {
    if (store && reopenKey && item.preset) store.push(reopenKey, item.preset);
    onPick(key);
  };
  if (guard.timedOut) return <DrawingFailed retry={guard.retry} compact />;
  const look =
    state === "showing"
      ? "border-[var(--brand-deep)]! bg-[var(--brand-main)]! text-[var(--brand-ink)]! hover:bg-[var(--brand-hover)]!"
      : state === "drawing"
        ? "skeleton text-[var(--muted)]!"
        : "";
  return (
    <span className="my-3 block">
      <Chip state={state} onClick={() => pick(item.key)} data-testid="widget-chip" title={name} className={`min-h-8! w-full max-w-full justify-between gap-3 px-3! py-1.5! text-sm! ${look}`}>
        <span className="min-w-0 truncate font-medium">{name}</span>{" "}
        <span className="shrink-0 text-xs">{state === "drawing" ? "Drawing…" : state === "showing" ? "Showing" : "View widget →"}</span>
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
  messageNumbers,
  latestKey,
}: {
  widgets: WidgetItem[];
  shown: WidgetItem | undefined;
  /** True for 600ms after a pick: the ring pulse plays when it turns on. */
  flashing?: boolean;
  onPick: (key: string) => void;
  topicTitle?: string;
  check?: CheckTab;
  /** The number of the conversation message each Widget (by key) came from, kept for callers that still pass it. */
  messageNumbers?: Readonly<Record<string, number>>;
  /** The newest Widget's key, for "Back to latest" (E5); defaults to the last Widget's. */
  latestKey?: string;
}) {
  const laptop = useLaptopWidth();
  const checkShown = !!check && (check.selected || !shown);
  const view = checkShown ? CHECK_ENTRY : shown?.key;

  // On every switch (a different Widget, or a press on the one already showing): a ring pulse around the card, and
  // the panel scrolls back to the top. Derived while rendering, so the pulse restarts with the render that shows it.
  const [seen, setSeen] = useState({ view, flashing, pulse: 0 });
  if (seen.view !== view || seen.flashing !== flashing) setSeen({ view, flashing, pulse: seen.view !== view || (flashing && !seen.flashing) ? seen.pulse + 1 : seen.pulse });
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const lastHeight = useRef(0);
  // Keep the card as tall as the one it replaces for a moment, so the page below does not jump while the new Widget draws.
  useLayoutEffect(() => {
    const el = card.current;
    if (!el || seen.pulse === 0) return;
    el.style.minHeight = `${lastHeight.current}px`;
    const timer = setTimeout(() => (el.style.minHeight = ""), 400);
    return () => clearTimeout(timer);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps -- reads the height the previous Widget had, once per switch
  // The card's height as it is drawn, kept up to date as its Widget loads data and grows (a switch reads it before the new one draws).
  const hasCard = !!shown && !checkShown;
  useLayoutEffect(() => {
    const el = card.current;
    if (!el) return;
    lastHeight.current = el.offsetHeight;
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(() => (lastHeight.current = el.offsetHeight));
    watch.observe(el);
    return () => watch.disconnect();
  }, [hasCard]);
  useEffect(() => {
    if (seen.pulse > 0) scrollToTop(root.current);
  }, [seen.pulse]);

  if (!shown && !check) {
    return <p className="rounded-lg border border-dashed border-[var(--border)] p-6 text-sm leading-5 text-[var(--muted)]">Widgets for this Topic will appear here.</p>;
  }
  // Below the laptop breakpoint the explore Widget stands in the conversation column instead (PinnedExplore),
  // so the panel draws no copy of its own there and says where it went.
  const elsewhere = shown?.explore && !laptop;
  const entries: PagerEntry[] = [
    ...(check ? [{ key: CHECK_ENTRY, title: check.name, eyebrow: "Quiz", check: true as const }] : []),
    ...widgets.map((w) => ({ key: w.key, title: widgetName(w), eyebrow: eyebrowFor(w, topicTitle), emoji: leadEmojiOf(w.code), from: messageNumbers?.[w.key], ...(w.explore && { explore: true as const }) })),
  ];
  const paged = laptop ? entries : entries.filter((e) => !e.explore);
  const select = (key: string) => (key === CHECK_ENTRY ? check?.onPick() : onPick(key));
  // ← and → page while the panel has focus, except from a control that uses the arrows itself (a slider, a field, the listbox).
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || keepsOwnArrows(e.target)) return;
    const at = paged.findIndex((p) => p.key === view);
    const to = paged[at < 0 ? (e.key === "ArrowRight" ? 0 : paged.length - 1) : at + (e.key === "ArrowRight" ? 1 : -1)];
    if (!to) return;
    e.preventDefault();
    select(to.key);
  };
  return (
    <div ref={root} className="contents" onKeyDown={onKeyDown}>
      {(check || widgets.length >= 2 || widgets.some((w) => w.explore)) && <WidgetPager entries={entries} paged={paged} current={view} latest={latestKey ?? widgets.at(-1)?.key} onSelect={select} />}
      {check && (
        <section aria-label={check.name} data-testid="check-card" hidden={!checkShown} className="rounded-lg border border-[var(--border)] p-3">
          {check.body}
        </section>
      )}
      {shown && !checkShown && elsewhere && (
        <p className="rounded-lg border border-dashed border-[var(--border)] p-6 text-sm leading-5 text-[var(--muted)]">
          The Explore Widget is in the conversation, under the Topic bar.
        </p>
      )}
      {shown && !checkShown && !elsewhere && (
        <section ref={card} data-testid="widget-card" className="relative rounded-lg border border-[var(--border)] p-3">
          {/* A ring that breathes once (600ms) on every switch; the key restarts it, and it never remounts the Widget. */}
          {seen.pulse > 0 && <span key={seen.pulse} aria-hidden="true" data-testid="widget-pulse" className="animate-ring-pulse pointer-events-none absolute inset-0 rounded-lg" />}
          {/* Remounts per Widget, so each one fades in (150ms) with a 4px rise. */}
          <div key={shown.key} className="animate-fade-rise">
            {shown.complete ? (
              <>
                <Eyebrow className="mb-1">{eyebrowFor(shown, topicTitle)}</Eyebrow>
                <WidgetWithSave item={shown} />
              </>
            ) : (
              <DrawingCard itemKey={shown.key} title={widgetParts(shown.code).title?.trim()} received={shown.code.length} />
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** What the card shows as soon as a Widget's fence opens, until the Widget is written: a title, a figure and two lines, shimmering. */
function DrawingCard({ itemKey, title, received = 0 }: { itemKey: string; title?: string; received?: number }) {
  const guard = useDrawingGuard(itemKey, true, received);
  if (guard.timedOut) return <DrawingFailed retry={guard.retry} />;
  return (
    <div data-testid="widget-skeleton" aria-busy="true" role="status" aria-label="Drawing the Widget">
      <Eyebrow className="mb-1">Drawing…</Eyebrow>
      {title && <p className="mb-3 text-sm leading-5 font-medium">{title}</p>}
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="skeleton h-5 w-2/3" />
        <div className="skeleton h-28 w-full" />
        <div className="skeleton h-4 w-1/2" />
      </div>
    </div>
  );
}

/** Scrolls the nearest scrolling ancestor of `el` (the Widget panel's aside) back to the top. */
function scrollToTop(el: HTMLElement | null) {
  for (let p = el?.parentElement; p; p = p.parentElement) {
    const overflow = getComputedStyle(p).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && p.scrollHeight > p.clientHeight) {
      p.scrollTop = 0;
      return;
    }
  }
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
