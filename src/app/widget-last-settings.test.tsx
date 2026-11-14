// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WidgetStates } from "@/widgets/widget-state";
import { lastSettingsOffer, opensAtPreset, playToKeep, useWidgetStates, WidgetStatesProvider, type WidgetStore } from "./widget-states";
import { useWidgetPicker, WidgetPanel, YOUR_LAST_SETTINGS, type WidgetItem } from "./widget-panel";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Spec 2026-11-12 G5: "When a step's reply names a preset, the Widget opens at that preset. A chip, 'Your last settings',
// restores the Learner's play." A Widget the Learner opens again themselves (no preset) keeps today's restore.

describe("the decision (pure)", () => {
  it("opens at the preset when the saved play differs from it", () => {
    expect(opensAtPreset({ $old: 4.31, $new: 5.78 }, { $old: 4, $new: 5 }, { $old: 4, $new: 4 })).toBe(true);
    expect(opensAtPreset({ $old: 4, $new: 5 }, { $old: 4, $new: 5 }, { $old: 4, $new: 4 })).toBe(false);
  });
  it("with nothing saved, opens at the preset only when the declared settings differ from it", () => {
    expect(opensAtPreset(undefined, { $old: 4, $new: 5 }, { $old: 4, $new: 4 })).toBe(true);
    expect(opensAtPreset(undefined, { $old: 4, $new: 4 }, { $old: 4, $new: 4 })).toBe(false);
  });
  it("a Widget with no preset opens as it was left", () => {
    expect(opensAtPreset({ $old: 4.31 }, undefined, { $old: 4 })).toBe(false);
    expect(opensAtPreset({ $old: 4.31 }, {}, { $old: 4 })).toBe(false);
  });
  it("remembers the Learner's play, never a preset's values", () => {
    const play = { $old: 4.31 };
    expect(playToKeep(play, undefined, undefined)).toBe(play);
    // The values showing are the last preset's: what was remembered before it stays.
    expect(playToKeep({ $old: 4 }, { $old: 4 }, play)).toBe(play);
    // The Learner moved after the preset: that is the play now.
    expect(playToKeep({ $old: 6 }, { $old: 4 }, play)).toEqual({ $old: 6 });
    expect(playToKeep(undefined, undefined, undefined)).toBeUndefined();
    expect(playToKeep({}, undefined, undefined)).toBeUndefined();
  });
  it("offers the play only while it differs from what the Widget holds", () => {
    expect(lastSettingsOffer({ $old: 4.31 }, { $old: 4 })).toEqual({ $old: 4.31 });
    expect(lastSettingsOffer({ $old: 4 }, { $old: 4 })).toBeUndefined();
    expect(lastSettingsOffer(undefined, { $old: 4 })).toBeUndefined();
  });
});

const code = (title: string) =>
  [
    `root = Widget("${title}", [old, nu])`,
    "$old = 4",
    "$new = 4",
    'old = Slider("old", "Old rate", 0, 10, 0.01, $old, "percent")',
    'nu = Slider("nu", "New rate", 0, 10, 0.01, $new, "percent")',
  ].join("\n");
const TITLE = "The card's move";
const KEY = TITLE;
const played: WidgetStates = { [KEY]: { values: { $old: 4.31, $new: 5.78 }, ticked: [] } };
const earlier: WidgetItem = { key: "m1:0", number: 1, code: code(TITLE), complete: true, preset: { $old: 4, $new: 4 } };
const step: WidgetItem = { key: "i3:0", number: 2, code: code(TITLE), complete: true, preset: { $old: 4, $new: 5 }, recipe: "rate_move" };
const other: WidgetItem = { key: "m2:0", number: 3, code: code("Growth"), complete: true };

let root: Root;
let host: HTMLElement;
let store!: WidgetStore;

function Page({ widgets, saved = played }: { widgets: WidgetItem[]; saved?: WidgetStates }) {
  const s = useWidgetStates(7, saved);
  useEffect(() => {
    store = s;
  }, [s]);
  const picker = useWidgetPicker(widgets);
  return (
    <WidgetStatesProvider store={s}>
      <WidgetPanel widgets={widgets} view={picker.view} newestKey={picker.newestKey} picks={picker.picks} onPick={picker.pick} />
    </WidgetStatesProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  vi.stubGlobal("fetch", vi.fn(async () => new Response("{}")));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const slider = (label: string) => host.querySelector<HTMLInputElement>(`input[type="range"][aria-label="${label}"]`)!;
const chip = () => [...host.querySelectorAll<HTMLButtonElement>('[data-testid="last-settings"]')];
const render = (el: React.ReactElement) => act(async () => root.render(el));

describe("a step's Widget in the panel", () => {
  it("opens at the step's preset, not the earlier play, and offers Your last settings", async () => {
    await render(<Page widgets={[other]} />);
    await render(<Page widgets={[other, step]} />);
    expect(slider("Old rate").value).toBe("4");
    expect(slider("New rate").value).toBe("5");
    expect(chip()).toHaveLength(1);
    expect(chip()[0].textContent).toBe(YOUR_LAST_SETTINGS);
  });

  it("the chip puts the play back, and goes", async () => {
    await render(<Page widgets={[other]} />);
    await render(<Page widgets={[other, step]} />);
    await act(async () => chip()[0].click());
    expect(slider("Old rate").value).toBe("4.31");
    expect(slider("New rate").value).toBe("5.78");
    expect(chip()).toHaveLength(0);
    expect(store.saved(KEY)?.values).toEqual({ $old: 4.31, $new: 5.78 });
  });

  it("offers no chip when the play already equals the preset", async () => {
    await render(<Page widgets={[other]} saved={{ [KEY]: { values: { $old: 4, $new: 5 }, ticked: [] } }} />);
    await render(<Page widgets={[other, step]} saved={{ [KEY]: { values: { $old: 4, $new: 5 }, ticked: [] } }} />);
    expect(slider("New rate").value).toBe("5");
    expect(chip()).toHaveLength(0);
  });

  it("a Widget with no preset keeps today's restore", async () => {
    const noPreset = { ...step, preset: undefined };
    await render(<Page widgets={[other]} />);
    await render(<Page widgets={[other, noPreset]} />);
    expect(slider("Old rate").value).toBe("4.31");
    expect(chip()).toHaveLength(0);
  });

  it("a Widget already listed when the page opened (a reload) draws as it was left", async () => {
    await render(<Page widgets={[earlier]} />);
    expect(slider("Old rate").value).toBe("4.31");
    expect(chip()).toHaveLength(0);
  });

  it("a second preset still offers the Learner's own play, not the first preset", async () => {
    const again: WidgetItem = { ...step, key: "i5:0", number: 4, preset: { $old: 5, $new: 6 } };
    await render(<Page widgets={[other]} />);
    await render(<Page widgets={[other, step]} />);
    await render(<Page widgets={[other, again]} />);
    expect(slider("Old rate").value).toBe("5");
    await act(async () => chip()[0].click());
    expect(slider("Old rate").value).toBe("4.31");
  });
});
