"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import type { CaseData } from "@/case-data/case-data";
import { fetchCaseData, splitReference, type CaseLoad } from "@/widgets/case-data-client";
import { useCaseLoad } from "@/widgets/case-data-provider";
import { Credit, SourcedTag } from "@/widgets/case-data-view";
import { Icon } from "@/icons/icon";
import { KIND_ICON, NO_KIND_ICON } from "@/icons/kinds";
import type { IconName } from "@/icons/names";
import { archetypeOf, widgetParts, widgetProblems, widgetTaskTexts } from "@/widgets/check";
import { SavedTicksContext, type SavedTicks } from "@/widgets/saved-ticks";
import { declaredSettings } from "@/widgets/settings";
import { widgetKey } from "@/widgets/widget-state";
import { allTasksTicked } from "@/widgets/widget-reading";
import { Button, Chip, Eyebrow, SecondaryButton, type ChipState } from "./ui";
import { track, widgetLane } from "./analytics";
import { SaveToNotes, type SaveTarget } from "./save-to-notes";
import { opensAtPreset, useWidgetStore, type WidgetStore } from "./widget-states";
import { cappedTabs, sameTab } from "./widget-tabs";
import { WidgetView } from "./widget-view";
import { keepsOwnArrows, pagerStops, WidgetPager, type PagerEntry } from "./widget-pager";
import { FoldedRow } from "./workspace-parts";
import { LAPTOP_UP, TABLET_UP, type Screen } from "./screen";

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
  /** The recipe code drew it from (a WIDGET_SHOWN item's `recipe`): a later Widget of the same recipe takes its tab (B6). */
  recipe?: string;
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
      className={`flex items-center justify-between gap-3 text-sm text-[var(--muted)] ${compact ? "my-3 min-h-10 rounded-lg border border-[var(--line)] px-3 py-1" : ""}`}
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
 * The Widgets with each update made in place: a Tutor Widget with the same title as an earlier one, or the same
 * recipe (spec 2026-11-12 B6: "opening the same recipe at new numbers updates its tab in place", `sameTab`), takes that
 * one's tab (its place in the list) instead of adding a tab, and keeps the earlier keys, so the earlier reply's
 * chip opens it too. Nothing is deleted: each Widget's saved state stays under its own Widget key. The explore Widget is never matched by title, but it is one Widget with the written-ahead
 * Widget it is: when the Tutor opens that one too, the two share one tab, the explore Widget's, and its chip opens it.
 */
export function updatedInPlace(widgets: readonly WidgetItem[]): WidgetItem[] {
  const out: { item: WidgetItem; title: string | undefined }[] = [];
  for (const item of widgets) {
    const title = item.explore ? undefined : widgetParts(item.code).title?.trim() || undefined;
    const at = out.findIndex((o) => (title && o.title === title) || sameTab(o.item, item));
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

/** What the panel shows when it shows the open quiz's Check; no Widget's key looks like it (theirs are `${messageId}:${index}` or "explore"). */
export const CHECK_VIEW = "check";

/** What a server render assumes: a laptop, as the layout is desktop-first. Tests render the narrow cases with NarrowScreen and PhoneScreen. */
const ServerScreen = createContext<Screen>("laptop");

/** Renders its children as on a tablet (below the laptop breakpoint), where no screen is measured (the server, tests). */
export function NarrowScreen({ children }: { children: ReactNode }) {
  return <ServerScreen.Provider value="tablet">{children}</ServerScreen.Provider>;
}

/** Renders its children as on a phone, where no screen is measured (the server, tests). */
export function PhoneScreen({ children }: { children: ReactNode }) {
  return <ServerScreen.Provider value="phone">{children}</ServerScreen.Provider>;
}

const watchScreen = (changed: () => void) => {
  const queries = [TABLET_UP, LAPTOP_UP].map((q) => window.matchMedia(q));
  for (const q of queries) q.addEventListener("change", changed);
  return () => queries.forEach((q) => q.removeEventListener("change", changed));
};
const measuredScreen = (): Screen => (window.matchMedia(LAPTOP_UP).matches ? "laptop" : window.matchMedia(TABLET_UP).matches ? "tablet" : "phone");

/**
 * Which screen this is by the one screen-size rule (./screen), kept up to date as it resizes. The layout itself is CSS
 * (Tailwind's md and lg), so it is right at first paint; script reads this only for what CSS cannot do: where the
 * explore Widget is mounted, and whether Back closes an open panel view.
 */
export function useScreen(): Screen {
  const server = useContext(ServerScreen);
  return useSyncExternalStore(watchScreen, measuredScreen, () => server);
}

/**
 * Whether the screen is at least laptop width. The explore Widget is drawn in one place only, chosen by this, so it is
 * mounted once: no hidden copy keeps its own sliders or fetches its own data.
 */
const useLaptopWidth = (): boolean => useScreen() === "laptop";

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
 * Sourced tag, its label and its source credit behind an Info Icon, plus what stays withheld until the reveal. Nothing while the data
 * loads, and no line for a dataset the server does not have or withholds: the Widget's own line under the chart
 * already says its data could not be loaded, and why. It is the Widget's content (data-widget-content), so it keeps the
 * Sourced family's colours, as the Widgets do.
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
    <div className="mt-2 space-y-1" data-testid="sourced-strip" data-widget-content>
      {lines.map(({ ref, data, dataset }) => (
        <div key={ref} data-kind="sourced" className="border-l-2 border-[var(--src-line)] py-1 pl-3 text-sm">
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
 * elsewhere (Notebook, Older sessions, Home) no Widget offers the button.
 */
export type WidgetReport = { tell: (key: string) => void; busy: boolean };

export const WidgetReportContext = createContext<WidgetReport | null>(null);

/** The words on the button under a Widget whose Guided Tasks are all ticked. */
export const TELL_THE_TUTOR = "Tell the Tutor what I found →";

/** The Widget key a finished Widget's state is saved under: its written-ahead id, else its title's key. */
const stateKeyOf = (item: Pick<WidgetItem, "code" | "writtenAhead">): string | undefined => item.writtenAhead ?? widgetKey(widgetParts(item.code).title);

/** The words on the chip that puts back the Learner's own slider values after a preset replaced them (spec 2026-11-12 G5). */
export const YOUR_LAST_SETTINGS = "Your last settings";

/**
 * "Your last settings": shown under a Widget that a preset (a step's reply, a chip, the Tutor) moved away from the
 * Learner's own play, while the two differ. Pressing it puts the play back; then it goes.
 */
function LastSettingsChip({ store, widgetKey: key }: { store: WidgetStore; widgetKey: string }) {
  const offer = useSyncExternalStore(store.subscribe, () => store.lastSettings(key), () => undefined);
  if (!offer) return null;
  return (
    <div className="mt-2">
      <Chip onClick={() => store.restore(key)} data-testid="last-settings" title="Put the sliders back where you left them">
        {YOUR_LAST_SETTINGS}
      </Chip>
    </div>
  );
}

/**
 * When a Widget arrives with a preset after the panel opened (a step's reply named its numbers), it opens at the preset,
 * not at the Learner's earlier play: the preset is pushed into the Widget store, which remembers the play for "Your last
 * settings" (spec 2026-11-12 G5). Widgets already listed when the panel opened (a reload) and Widgets with no preset
 * open as they were left. Nothing is pushed outside the Study Workspace (no store).
 */
function useOpenAtPreset(widgets: readonly WidgetItem[]) {
  const store = useWidgetStore();
  const [known] = useState(() => new Set(widgets.filter((w) => w.complete).map((w) => w.key)));
  useLayoutEffect(() => {
    for (const w of widgets) {
      if (!w.complete || known.has(w.key)) continue;
      known.add(w.key);
      const key = stateKeyOf(w);
      if (!store || !key || !w.preset) continue;
      if (opensAtPreset(store.saved(key)?.values, w.preset, declaredSettings(w.code))) store.push(key, w.preset);
    }
  }, [widgets, store, known]);
}

/**
 * A Widget with the Sourced strip for the Case Data it draws through Query("case_data"), and its quiet "Save to
 * Notebook" beneath it. Each Case it reads comes from the page's shared Case Data cache, for its Queries, its charts
 * and its strip together. Mount it with a key per Widget: its sliders start afresh then.
 *
 * In the Study Workspace its slider values and ticked Guided Tasks are saved with the Session under its Widget key
 * (Widget state, see widget-states.tsx), so it draws as the Learner left it after a reload or a tab switch, and
 * Save to Notebook keeps the same values under the same key. Elsewhere (Home, for one) they are kept only while it is
 * on screen, and with no `save` there is no Save to Notebook. It reads only these fields of the conversation's item.
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
  const key = store && item.complete ? stateKeyOf(item) : undefined;
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
  // The settings its Guided Tasks are worded at: a Workbench's can follow them (Value levers names the price of the Case
  // the Learner chose with its chip), so Tell the Tutor what I found waits for every task as the Widget words it now. Kept
  // for this drawing only (a push or new code starts again from `start`), and changed only when the words change, so a
  // lever's move does not draw the panel again.
  const drawing = `${revision}\n${item.code}`;
  const [worded, setWorded] = useState<{ drawing: string; tasks: string; values: Record<string, number> } | null>(null);
  const taskValues = worded?.drawing === drawing ? worded.values : start?.values;
  const report = useContext(WidgetReportContext);
  const canReport = !!report && !!key && item.complete && allTasksTicked(item.code, ticked, taskValues);
  const onSettings = (s: Record<string, number>) => {
    settings.current = s;
    if (store && key) store.save(key, { values: s });
    const tasks = widgetTaskTexts(item.code, s).join("\n");
    setWorded((now) => (now?.drawing === drawing && now.tasks === tasks ? now : { drawing, tasks, values: s }));
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
      {store && key && <LastSettingsChip store={store} widgetKey={key} />}
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

/**
 * A Widget's kind Icon, for its Widget panel tab (spec 2026-11-11, ticket A1b, ADR 0018): its archetype's Icon
 * (`KIND_ICON`), else `widget` when it has no archetype. One Icon per kind, so the tabs never show a story's cast.
 */
export function kindIconOf(code: string): IconName {
  const archetype = archetypeOf(code);
  return archetype ? KIND_ICON[archetype] : NO_KIND_ICON;
}

/**
 * What the Widget panel shows, worked out here once for every reader: the panel, its pager, the chips in the chat
 * and an old Session. `view` is CHECK_VIEW for the open quiz's Check, else the key of the Widget tab that shows.
 * With a Check open (`check`) the Check shows unless the Learner picked a Widget; without one, the Widget picked,
 * else the newest. `newest` is the newest drawing's key, which may be an earlier tab's when it updated that tab in
 * place, so `newestKey` is the key of the tab it stands in: what "Back to latest" returns to.
 *
 * `picks` counts the picks, so a press on what is already showing still counts as a switch (the panel scrolls back
 * to the top); nothing pulses or rises (spec 2026-11-11 A6). `clear` forgets the pick, so a new turn's Widget, or
 * the open Check, shows on its own.
 */
export function useWidgetPicker(widgets: readonly WidgetItem[], { newest, check = false }: { newest?: string; check?: boolean } = {}) {
  const [picked, setPicked] = useState<string>();
  const [picks, setPicks] = useState(0);
  const newestKey = (widgets.find((w) => holdsKey(w, newest)) ?? widgets.at(-1))?.key;
  const pickedKey = widgets.find((w) => holdsKey(w, picked))?.key;
  const view = check && (picked === CHECK_VIEW || !pickedKey) ? CHECK_VIEW : (pickedKey ?? newestKey);
  const pick = (key: string) => {
    setPicked(key);
    setPicks((n) => n + 1);
  };
  return { view, newestKey, picks, pick, clear: () => setPicked(undefined) };
}

/** What a Widget is called on its tab and chip: "Explore" for the explore Widget, else its title, never a number. */
export function widgetName(item: WidgetItem): string {
  if (item.explore) return "Explore";
  return widgetParts(item.code).title?.trim() || "Untitled Widget";
}

/**
 * The chip standing where a Widget belongs in a reply: a 40px flat row-link with the Widget's title and three states.
 * Idle "View widget →" in the accent; Showing (the accent-tint showing chip) while the panel shows that Widget; Drawing…
 * (a shimmer) while its fence is still being written. Pressing it shows that Widget in the panel; pressing the one
 * already showing scrolls the panel to the top.
 */
export function WidgetChip({ item, active, onPick }: { item: WidgetItem; active: boolean; onPick: (key: string) => void }) {
  // A chip the Tutor's open_widget left names the Widget by title, even when it is the explore Widget's tab.
  const name = (item.writtenAhead && widgetParts(item.code).title?.trim()) || widgetName(item);
  const state: ChipState = !item.complete ? "drawing" : active ? "showing" : "idle";
  const guard = useDrawingGuard(item.key, !item.complete, item.code.length);
  const store = useWidgetStore();
  // Pressing a chip reopens the Widget at the numbers it was opened with, not where the Learner left it since.
  const reopenKey = item.complete && item.preset ? stateKeyOf(item) : undefined;
  const pick = (key: string) => {
    if (store && reopenKey && item.preset) store.push(reopenKey, item.preset);
    onPick(key);
  };
  if (guard.timedOut) return <DrawingFailed retry={guard.retry} compact />;
  // Showing takes the selected look from `.chip[data-state="showing"]`, like every other showing chip.
  const look = state === "drawing" ? "skeleton text-[var(--muted)]!" : "";
  return (
    <span className="my-3 block">
      <Chip state={state} onClick={() => pick(item.key)} data-testid="widget-chip" title={name} className={`min-h-10! w-full max-w-full justify-between gap-3 px-3! py-2! text-sm! ${look}`}>
        <span className="flex min-w-0 items-center gap-1.5">
          {item.complete && <Icon name={kindIconOf(item.code)} size={16} className="shrink-0 text-[var(--muted)]" />}
          <span className="min-w-0 truncate font-medium text-[var(--ink)]">{name}</span>
        </span>{" "}
        <span className={`shrink-0 text-[13px] font-medium ${state === "idle" ? "text-[var(--accent)]" : ""}`}>{state === "drawing" ? "Drawing…" : state === "showing" ? "Showing" : "View widget →"}</span>
      </Chip>
    </span>
  );
}

/**
 * A quiz Check in the panel: its own tab, first in the row ("Check 1 of 2"), and the quiz under it, shown while the
 * panel's `view` is CHECK_VIEW. The quiz stays mounted while another tab is shown, so answers picked so far, or a
 * marking on screen, survive a look at a Widget.
 */
export type CheckTab = { name: string; body: ReactNode };

/**
 * The Widget panel beside the conversation: a tab per Widget, named by title (from two on), then one card with a concept
 * eyebrow and the Widget, or a dashed empty box before the Tutor has built any. With an open quiz Check, its tab
 * comes first and the row always shows. It shows what `view` names (useWidgetPicker works it out) and decides nothing
 * itself. Read-only callers can leave out onPick's side effects; the panel never calls the model.
 */
export function WidgetPanel({
  widgets,
  view,
  newestKey,
  picks = 0,
  onPick,
  topicTitle,
  check,
}: {
  widgets: WidgetItem[];
  /** What shows: CHECK_VIEW for the Check, else a Widget's key (useWidgetPicker's `view`). */
  view: string | undefined;
  /** The newest Widget's tab, which "Back to latest" (E5) returns to (useWidgetPicker's `newestKey`). */
  newestKey?: string;
  /** How many picks so far (useWidgetPicker's `picks`): each counts as a switch, so the panel scrolls to the top. */
  picks?: number;
  onPick: (key: string) => void;
  topicTitle?: string;
  check?: CheckTab;
}) {
  const laptop = useLaptopWidth();
  const checkShown = !!check && view === CHECK_VIEW;
  const shown = widgets.find((w) => w.key === view);
  useOpenAtPreset(widgets);
  // At most six tabs (B6): the Widget showing always has one; the others are the newest, written-ahead ones kept.
  const tabs = useMemo(() => cappedTabs(widgets, view), [widgets, view]);

  // On every switch (a different Widget, or a press on the one already showing) the panel scrolls back to the top.
  // Derived while rendering, so the scroll happens with the render that shows the new Widget. Nothing pulses or rises.
  const [seen, setSeen] = useState({ view, picks, switches: 0 });
  if (seen.view !== view || seen.picks !== picks) setSeen({ view, picks, switches: seen.switches + 1 });
  const root = useRef<HTMLDivElement>(null);
  const card = useRef<HTMLElement>(null);
  const lastHeight = useRef(0);
  // Keep the card as tall as the one it replaces for a moment, so the page below does not jump while the new Widget draws.
  useLayoutEffect(() => {
    const el = card.current;
    if (!el || seen.switches === 0) return;
    el.style.minHeight = `${lastHeight.current}px`;
    const timer = setTimeout(() => (el.style.minHeight = ""), 400);
    return () => clearTimeout(timer);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps -- reads the height the previous Widget had, once per switch
  // The card's height as it is drawn, kept up to date as its Widget loads data and grows (a switch reads it before the new one draws).
  const hasCard = !!shown;
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
    if (seen.switches > 0) scrollToTop(root.current);
  }, [seen.switches]);

  if (!shown && !check) {
    return <p className="rounded-xl border border-dashed border-[var(--line)] p-6 text-sm leading-5 text-[var(--muted)]">Widgets for this Topic will appear here.</p>;
  }
  // Below the laptop breakpoint the explore Widget stands in the conversation column instead (PinnedExplore),
  // so the panel draws no copy of its own there and says where it went.
  const elsewhere = shown?.explore && !laptop;
  const entries: PagerEntry[] = [
    ...(check ? [{ key: CHECK_VIEW, title: check.name, check: true as const }] : []),
    ...tabs.map((w) => ({ key: w.key, title: widgetName(w), icon: kindIconOf(w.code), ...(w.explore && { explore: true as const }) })),
  ];
  const paged = laptop ? entries : entries.filter((e) => !e.explore);
  // ← and → page while the panel has focus, as ‹ and › do, except from a control that uses the arrows itself (a slider,
  // a field, the strip, where they move focus instead).
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.key !== "ArrowLeft" && e.key !== "ArrowRight") || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || keepsOwnArrows(e.target)) return;
    const to = pagerStops(paged, view)[e.key === "ArrowRight" ? "next" : "prev"];
    if (!to) return;
    e.preventDefault();
    onPick(to);
  };
  return (
    <div ref={root} className="contents" onKeyDown={onKeyDown}>
      {(check || tabs.length >= 2 || tabs.some((w) => w.explore)) && <WidgetPager entries={entries} paged={paged} current={view} latest={newestKey} onSelect={onPick} />}
      {check && (
        <section aria-label={check.name} data-testid="check-card" hidden={!checkShown} className="rounded-xl border border-[var(--rule)] bg-[var(--frame)] p-4">
          {check.body}
        </section>
      )}
      {shown && elsewhere && (
        <p className="rounded-xl border border-dashed border-[var(--line)] p-6 text-sm leading-5 text-[var(--muted)]">
          The Explore Widget is in the conversation, under the Topic bar.
        </p>
      )}
      {shown && !elsewhere && (
        <section ref={card} data-testid="widget-card" className="relative flex-1 rounded-xl border border-[var(--rule)] bg-[var(--frame)] p-4">
          <div key={shown.key}>
            {shown.complete ? (
              <>
                <Eyebrow className="mb-2">{eyebrowFor(shown, topicTitle)}</Eyebrow>
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
      <Eyebrow className="mb-2">Drawing…</Eyebrow>
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
