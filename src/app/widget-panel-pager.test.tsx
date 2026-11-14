// @vitest-environment happy-dom
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useWidgetPicker, WidgetChip, WidgetPanel, kindIconOf, type CheckTab, type WidgetItem } from "./widget-panel";
import { WorkspaceFrame } from "./workspace-frame";

// The Widget panel's pager (spec: REPORT 5.1, 5.2, 8.5; spec 2026-11-11 A6): ‹ › and "3 of 11 · title", a row of text
// tabs each with its kind Icon, ← and → paging, a scroll to the top on every switch (no pulse, no rise), white card
// frames, the chat chip's three states, and a skeleton while a Widget draws.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const code = (title: string) => `root = Widget("${title}", [rate])\n$rate = 5\nrate = Slider("rate", "Rate ${title}", 0, 10, 0.25, $rate, "percent")`;
const item = (n: number, extra: Partial<WidgetItem> = {}): WidgetItem => ({ key: `m${n}:0`, number: n, code: code(`Title ${n}`), complete: true, ...extra });
const ITEMS = [1, 2, 3].map((n) => item(n));

let root: Root;
let host: HTMLElement;
let picked: string[];

// The panel as the Study Workspace drives it, through the real picker, opened on Widget `start` (a pick as it mounts).
function Harness({ widgets = ITEMS, start = 1, check }: { widgets?: WidgetItem[]; start?: number; check?: CheckTab }) {
  const picker = useWidgetPicker(widgets, { check: !!check });
  const { pick } = picker;
  useEffect(() => {
    pick(widgets[start].key);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- the starting pick, once, as it mounts
  return (
    <aside>
      <WidgetPanel
        widgets={widgets}
        view={picker.view}
        newestKey={picker.newestKey}
        picks={picker.picks}
        onPick={(k) => {
          picked.push(k);
          pick(k);
        }}
        check={check}
      />
    </aside>
  );
}

beforeEach(() => {
  picked = [];
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const render = async (el = <Harness />) => act(async () => root.render(el));
const q = (sel: string) => host.querySelector<HTMLElement>(sel)!;
const position = () => q('[data-testid="pager-position"]').textContent;
const press = async (el: Element, key: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
const click = async (el: Element) => act(async () => (el as HTMLElement).click());

describe("the Widget panel's pager", () => {
  it("reads '2 of 3 · title' with ‹ and › as 32px icon buttons, and pages with them", async () => {
    await render();
    expect(position()).toBe("2 of 3 · Title 2");
    const prev = q('[data-testid="pager-prev"]');
    expect(prev.getAttribute("aria-label")).toBe("Previous widget");
    expect(prev.getAttribute("data-affordance")).toBe("icon");
    expect(q('[data-testid="pager-next"]').getAttribute("data-affordance")).toBe("icon");
    await click(q('[data-testid="pager-next"]'));
    expect(position()).toBe("3 of 3 · Title 3");
    expect(q('[data-testid="pager-next"]').hasAttribute("disabled")).toBe(true);
    await click(prev);
    await click(prev);
    expect(position()).toBe("1 of 3 · Title 1");
    expect(prev.hasAttribute("disabled")).toBe(true);
  });

  it("pages with ← and → while the panel has focus, but leaves the arrows to a slider", async () => {
    await render();
    await press(q('[data-testid="pager-position"]'), "ArrowRight");
    expect(position()).toBe("3 of 3 · Title 3");
    await press(q('[data-testid="pager-position"]'), "ArrowLeft");
    await press(q('[data-testid="pager-position"]'), "ArrowLeft");
    expect(position()).toBe("1 of 3 · Title 1");
    const before = picked.length;
    await press(q('input[type="range"]'), "ArrowRight");
    expect(picked).toHaveLength(before);
    expect(position()).toBe("1 of 3 · Title 1");
  });

  it("has no All menu any more: every Widget is one press away in the filmstrip (E5)", async () => {
    await render();
    expect(host.querySelector('[data-testid="pager-all"]')).toBeNull();
    expect(host.querySelector('[data-testid="pager-menu"]')).toBeNull();
    expect(host.querySelector('[role="listbox"]')).toBeNull();
  });

  it("keeps the open quiz's Check tab first in the strip, and the Explore tab with its explore-chip", async () => {
    const widgets = [item(1, { key: "explore", explore: true, writtenAhead: "x" }), item(2)];
    await render(<Harness widgets={widgets} start={1} check={{ name: "Check 1 of 2", body: <p>quiz</p> }} />);
    expect(position()).toMatch(/Check 1 of 2|Title 2/);
    const buttons = [...q('[data-testid="widget-filmstrip"]').querySelectorAll("button")];
    expect(buttons.map((b) => b.getAttribute("data-testid"))).toEqual(["check-tab", "explore-chip", "filmstrip-thumb"]);
    expect(buttons[0].textContent).toContain("Check 1 of 2");
    expect(buttons[1].className).toContain("max-lg:hidden");
    await click(buttons[0]);
    expect(picked.at(-1)).toBe("check");
  });

  it("a switch plays no pulse and no rise", async () => {
    await render();
    await click(q('[data-testid="pager-next"]'));
    expect(host.querySelector('[data-testid="widget-pulse"]')).toBeNull();
    expect(q('[data-testid="widget-card"]').innerHTML).not.toMatch(/class="[^"]*\banimate-/);
  });

  it("draws the Widget card and the Check card as white frames, and keeps the empty state dashed (A6)", async () => {
    await render(<Harness check={{ name: "Check 1 of 2", body: <p>quiz</p> }} />);
    for (const id of ["widget-card", "check-card"]) {
      const cls = q(`[data-testid="${id}"]`).className;
      expect(cls, id).toContain("rounded-xl");
      expect(cls, id).toContain("border-[var(--rule)]");
      expect(cls, id).toContain("bg-[var(--frame)]");
      expect(cls, id).not.toContain("bg-[var(--wash)]");
    }
    const empty = renderToStaticMarkup(<WidgetPanel widgets={[]} view={undefined} onPick={() => {}} />);
    expect(empty).toMatch(/<p class="[^"]*border-dashed border-\[var\(--line\)\][^"]*">Widgets for this Topic will appear here\.<\/p>/);
  });

  // #528: the card fills the panel's height. The frame's pane is a size container named pane holding a column at least
  // the panel's height, and the card grows in it to the panel's bottom.
  it("fills the panel's height: the pane is a size container with a full-height column, and the card grows in it", async () => {
    await render();
    expect(q('[data-testid="widget-card"]').className).toContain("flex-1");
    const frame = renderToStaticMarkup(<WorkspaceFrame left={null} top={null} right={<p>panel</p>} />);
    expect(frame).toMatch(/data-testid="widget-pane" class="[^"]*@container-size\/pane[^"]*"/);
    expect(frame).toMatch(/<div data-testid="widget-pane-column" class="flex min-h-full flex-col"><p>panel<\/p><\/div>/);
  });

  it("scrolls the panel to the top on a switch", async () => {
    const aside = host.appendChild(document.createElement("div"));
    aside.style.overflowY = "auto";
    Object.defineProperty(aside, "scrollHeight", { value: 2000 });
    Object.defineProperty(aside, "clientHeight", { value: 500 });
    const inner = aside.appendChild(document.createElement("div"));
    const r2 = createRoot(inner);
    await act(async () => r2.render(<Harness />));
    aside.scrollTop = 300;
    await click(aside.querySelector('[data-testid="pager-next"]')!);
    expect(aside.scrollTop).toBe(0);
    act(() => r2.unmount());
  });

  it("keeps the last Widget's height for a moment after a switch, so the page does not jump", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const watchers: (() => void)[] = [];
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(cb: () => void) {
          watchers.push(cb);
        }
        observe() {}
        disconnect() {}
      },
    );
    try {
      await render();
      Object.defineProperty(q('[data-testid="widget-card"]'), "offsetHeight", { configurable: true, value: 420 });
      await act(async () => watchers.forEach((cb) => cb()));
      await click(q('[data-testid="pager-next"]'));
      expect(q('[data-testid="widget-card"]').style.minHeight).toBe("420px");
      await act(async () => void vi.advanceTimersByTime(450));
      expect(q('[data-testid="widget-card"]').style.minHeight).toBe("");
    } finally {
      vi.unstubAllGlobals();
      vi.useRealTimers();
    }
  });

  it("shows a skeleton card as soon as a Widget's fence opens, and the Widget once it is written", async () => {
    const drawing = item(1, { complete: false, code: 'root = Widget("Half written", [rate' });
    await render(<Harness widgets={[drawing]} start={0} />);
    expect(q('[data-testid="widget-skeleton"]').getAttribute("aria-busy")).toBe("true");
    expect(q('[data-testid="widget-skeleton"]').textContent).toContain("Half written");
    expect(host.querySelector('input[type="range"]')).toBeNull();
    await render(<Harness widgets={[item(1)]} start={0} />);
    expect(host.querySelector('[data-testid="widget-skeleton"]')).toBeNull();
    expect(host.querySelector('input[type="range"]')).not.toBeNull();
  });
});

describe("the filmstrip (E5)", () => {
  const thumbs = () => [...host.querySelectorAll<HTMLElement>('[data-testid="filmstrip-thumb"]')];

  it("shows one text tab per Widget, oldest first, the latest current, each with a 16px kind Icon and its title", async () => {
    await render(<Harness start={2} />);
    const strip = q('[data-testid="widget-filmstrip"]');
    expect(strip.className).toMatch(/\boverflow-x-auto\b/);
    const list = thumbs();
    expect(list).toHaveLength(3);
    expect(list.map((t) => t.getAttribute("aria-current"))).toEqual([null, null, "true"]);
    expect(list[0].textContent).toContain("Title 1");
    expect(list[2].textContent).toContain("Title 3");
    for (const t of list) {
      expect(t.className).toContain("h-8");
      expect(t.getAttribute("data-affordance")).toBe("nav");
      const icons = t.querySelectorAll("svg");
      expect(icons).toHaveLength(1);
      expect(icons[0].getAttribute("width")).toBe("16");
      expect(icons[0].getAttribute("aria-hidden")).toBe("true");
      expect(t.querySelector("img")).toBeNull();
      expect(t.querySelector("span")?.className).toContain("truncate");
      expect(t.getAttribute("title")).toBeTruthy();
    }
    for (const t of list) {
      expect(t.className).not.toMatch(/\bbtn\b/);
      expect(t.className).not.toContain("w-24");
      expect(t.className).not.toContain("h-16");
      expect(t.className).not.toContain("shadow-[inset");
      expect(t.className).toContain("aria-[current=true]:after:bg-[var(--accent)]");
      // In forced colours the bar is Highlight, so the current tab still shows (A6).
      expect(t.className).toContain("forced-colors:aria-[current=true]:after:bg-[Highlight]");
      expect(t.querySelector("svg")?.getAttribute("class")).toContain("shrink-0");
      expect(t.className).toContain("focus-visible:outline-[var(--ring)]");
    }
  });

  it("pressing tab 1 shows Widget 1 and Back to latest; Back to latest returns to the newest", async () => {
    await render(<Harness start={2} />);
    expect(host.querySelector('[data-testid="back-to-latest"]')).toBeNull();
    await click(thumbs()[0]);
    expect(position()).toBe("1 of 3 · Title 1");
    expect(thumbs().map((t) => t.getAttribute("aria-current"))).toEqual(["true", null, null]);
    const back = q('[data-testid="back-to-latest"]');
    expect(back.textContent).toContain("Back to latest");
    await click(back);
    expect(position()).toBe("3 of 3 · Title 3");
    expect(host.querySelector('[data-testid="back-to-latest"]')).toBeNull();
  });

  it("lists at most six tabs: the seventh replaces the oldest that is neither written ahead nor showing (B6)", async () => {
    const eight = [item(1, { writtenAhead: "w1" }), ...[2, 3, 4, 5, 6, 7, 8].map((n) => item(n))];
    // Showing Widget 2 (picked): Widget 1 is written ahead and 2 shows, so 3 and then 4 leave.
    await render(<Harness widgets={eight} start={1} />);
    expect(thumbs().map((t) => t.textContent)).toEqual(["Title 1", "Title 2", "Title 5", "Title 6", "Title 7", "Title 8"]);
    expect(position()).toBe("2 of 6 · Title 2");
    // Back to the newest: Widget 2 no longer shows, so it is the oldest that may leave.
    await click(q('[data-testid="back-to-latest"]'));
    expect(thumbs().map((t) => t.textContent)).toEqual(["Title 1", "Title 4", "Title 5", "Title 6", "Title 7", "Title 8"]);
    expect(position()).toBe("6 of 6 · Title 8");
  });

  it("Tab enters the strip once (roving tabindex), ← and → move focus without selecting, Enter opens", async () => {
    await render(<Harness start={2} />);
    expect(thumbs().map((t) => t.tabIndex)).toEqual([-1, -1, 0]);
    thumbs()[2].focus();
    await press(thumbs()[2], "ArrowLeft");
    expect(document.activeElement).toBe(thumbs()[1]);
    expect(position()).toBe("3 of 3 · Title 3");
    await press(thumbs()[1], "ArrowLeft");
    expect(document.activeElement).toBe(thumbs()[0]);
    await press(thumbs()[0], "ArrowRight");
    expect(document.activeElement).toBe(thumbs()[1]);
    await press(thumbs()[1], "Enter");
    expect(position()).toBe("2 of 3 · Title 2");
  });

  it("a tab draws its kind's Icon at 16 px (A6)", async () => {
    const story = `root = Widget("A story", [s])\ns = StoryScene([{id: "a", emoji: "bank", name: "The bank"}], [{who: "a", says: "Hello there"}])`;
    const versus = `root = Widget("A match", [v])\nv = Versus("Cash", 5, "Card", 4, "usd")`;
    const widgets = [item(1, { code: story }), item(2, { code: versus }), item(3)];
    await render(<Harness widgets={widgets} start={2} check={{ name: "Check 1 of 2", body: <p>quiz</p> }} />);
    const icon = (tab: Element) => tab.querySelector("svg");
    const want: [string, string][] = [["story", "lucide-book-open"], ["balance-scale", "lucide-scale"], ["widget", "lucide-shapes"]];
    thumbs().forEach((tab, i) => {
      expect(icon(tab)?.getAttribute("data-icon")).toBe(want[i][0]);
      expect(icon(tab)?.getAttribute("class")).toContain(want[i][1]);
      expect(icon(tab)?.getAttribute("width")).toBe("16");
    });
    const check = icon(q('[data-testid="check-tab"]'));
    expect(check?.getAttribute("data-icon")).toBe("check-mark-button");
    expect(check?.getAttribute("class")).toContain("lucide-circle-check");
  });

  it("kind Icon: the Widget's archetype's Icon, else widget", () => {
    const story = `root = Widget("T", [s])\ns = StoryScene([{id: "a", emoji: "bank", name: "The bank"}], [{who: "a", says: "Hello there"}])`;
    expect(kindIconOf(story)).toBe("story");
    const versus = `root = Widget("T", [v])\nv = Versus("Cash", 5, "Card", 4, "usd")`;
    expect(kindIconOf(versus)).toBe("balance-scale");
    expect(kindIconOf(code("Title 1"))).toBe("widget");
    const lingo = `root = Widget("T", [l])\nl = LingoCard("Yield", "A bond's yield is its income.", "The income for lending.", "Rent on a flat.", "house")`;
    expect(kindIconOf(lingo)).toBe("lingo");
    const quiz = `root = Widget("T", [q])\nq = QuickCheck("Which?", ["A", "B"], 0, "Why.")`;
    expect(kindIconOf(quiz)).toBe("check-mark-button");
  });
});

describe("the chat chip", () => {
  const chip = (it: WidgetItem, active: boolean) => renderToStaticMarkup(<WidgetChip item={it} active={active} onPick={() => {}} />);

  it("is idle: 'View widget →', not pressed, with one kind Icon before the title", () => {
    const html = chip(item(1), false);
    expect(html).toContain("View widget →");
    // One aria-hidden Icon, drawn right before the title span (A6).
    expect(html.match(/<svg/g)).toHaveLength(1);
    expect(html).toMatch(/<svg(?=[^>]*aria-hidden="true")[^>]*>[\s\S]*?<\/svg><span class="[^"]*\btruncate\b[^"]*">Title 1<\/span>/);
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('aria-pressed="false"');
    // A 40px flat row-link: the Widget's title in ink, and "View widget →" in the accent while it is idle.
    expect(html).toMatch(/min-h-10!/);
    expect(html).toMatch(/<span class="[^"]*text-\[var\(--accent\)\][^"]*">View widget →<\/span>/);
  });

  it("is Showing, in the selected look, while the panel shows its Widget", () => {
    const html = chip(item(1), true);
    expect(html).toContain("Showing");
    expect(html).toContain('data-state="showing"');
    // The look comes from `.chip[data-state="showing"]` (accent-tint face and a 1px accent border), not from
    // !important utilities that repaint the face and rim.
    expect(html).not.toMatch(/(?:bg|border|text)-\[var\(--(?:brand|accent)[^)]*\)\]!/);
    // Its status word is ink on the tint: the accent label is for the idle row-link only.
    expect(html).not.toMatch(/text-\[var\(--accent\)\][^"]*">Showing/);
  });

  it("is Drawing… with a shimmer while its fence is open", () => {
    const html = chip(item(1, { complete: false }), false);
    expect(html).toContain("Drawing…");
    expect(html).toContain('data-state="drawing"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("skeleton");
  });

  it("presses to pick its Widget, also when it is already showing", async () => {
    const onPick = vi.fn();
    await act(async () => root.render(<WidgetChip item={item(1)} active onPick={onPick} />));
    await click(q('[data-testid="widget-chip"]'));
    expect(onPick).toHaveBeenCalledWith("m1:0");
  });
});
