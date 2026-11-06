// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetChip, WidgetPanel, leadEmojiOf, type CheckTab, type WidgetItem } from "./widget-panel";

// The Widget panel's pager (spec: REPORT 5.1, 5.2, 8.5): ‹ › and "3 of 11 · title", an All listbox, ← and → paging,
// a ring pulse and a scroll to the top on every switch, the chat chip's three states, and a skeleton while a Widget draws.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const code = (title: string) => `root = Widget("${title}", [rate])\n$rate = 5\nrate = Slider("rate", "Rate ${title}", 0, 10, 0.25, $rate, "percent")`;
const item = (n: number, extra: Partial<WidgetItem> = {}): WidgetItem => ({ key: `m${n}:0`, number: n, code: code(`Title ${n}`), complete: true, ...extra });
const ITEMS = [1, 2, 3].map((n) => item(n));
const MESSAGES = { "m1:0": 2, "m2:0": 4, "m3:0": 6 };

let root: Root;
let host: HTMLElement;
let picked: string[];

function Harness({ widgets = ITEMS, start = 1, check }: { widgets?: WidgetItem[]; start?: number; check?: (selected: boolean, pick: () => void) => CheckTab }) {
  const [key, setKey] = useState(widgets[start].key);
  const [checkOn, setCheckOn] = useState(false);
  return (
    <aside>
      <WidgetPanel
        widgets={widgets}
        shown={widgets.find((w) => w.key === key)}
        onPick={(k) => {
          picked.push(k);
          setCheckOn(false);
          setKey(k);
        }}
        messageNumbers={MESSAGES}
        check={check?.(checkOn, () => {
          picked.push("check");
          setCheckOn(true);
        })}
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
  it("reads '2 of 3 · title' with ‹ and › as round icon buttons, and pages with them", async () => {
    await render();
    expect(position()).toBe("2 of 3 · Title 2");
    const prev = q('[data-testid="pager-prev"]');
    expect(prev.getAttribute("aria-label")).toBe("Previous widget");
    expect(prev.className).toMatch(/\bbtn-icon\b/);
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

  it("keeps the open quiz's Check tab first in the strip, and the Explore thumbnail with its explore-chip", async () => {
    const widgets = [item(1, { key: "explore", explore: true, writtenAhead: "x" }), item(2)];
    await render(<Harness widgets={widgets} start={1} check={(selected, pick) => ({ name: "Check 1 of 2", selected, onPick: pick, body: <p>quiz</p> })} />);
    expect(position()).toMatch(/Check 1 of 2|Title 2/);
    const buttons = [...q('[data-testid="widget-filmstrip"]').querySelectorAll("button")];
    expect(buttons.map((b) => b.getAttribute("data-testid"))).toEqual(["check-tab", "explore-chip", "filmstrip-thumb"]);
    expect(buttons[0].textContent).toContain("Check 1 of 2");
    expect(buttons[1].className).toContain("max-lg:hidden");
    await click(buttons[0]);
    expect(picked.at(-1)).toBe("check");
  });

  it("plays a ring pulse on every switch instead of flashing the border, and again for a press on the Widget already showing", async () => {
    await render();
    expect(host.querySelector('[data-testid="widget-pulse"]')).toBeNull();
    await click(q('[data-testid="pager-next"]'));
    const pulse = q('[data-testid="widget-pulse"]');
    expect(pulse.className).toContain("animate-ring-pulse");
    expect(q('[data-testid="widget-card"]').className).not.toMatch(/border-\[var\(--brand\)\]/);
    expect(q('[data-testid="widget-card"] > div:not([data-testid])').className).toContain("animate-widget-stage-in");
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

  it("shows one 96×64 thumbnail per Widget, oldest first, the latest current, each with a 24px lead emoji and its title", async () => {
    await render(<Harness start={2} />);
    const strip = q('[data-testid="widget-filmstrip"]');
    expect(strip.className).toMatch(/\boverflow-x-auto\b/);
    const list = thumbs();
    expect(list).toHaveLength(3);
    expect(list.map((t) => t.getAttribute("aria-current"))).toEqual([null, null, "true"]);
    expect(list[0].textContent).toContain("Title 1");
    expect(list[2].textContent).toContain("Title 3");
    for (const t of list) {
      expect(t.className).toMatch(/\bw-24\b/);
      expect(t.className).toMatch(/\bh-16\b/);
      const img = t.querySelector("img");
      expect(img?.getAttribute("width")).toBe("24");
      expect(img?.getAttribute("src")).toMatch(/^\/emoji\/.+\.webp$/);
    }
    expect(list[2].className).toMatch(/ring-\[var\(--ring\)\]|outline-\[var\(--ring\)\]/);
  });

  it("pressing thumbnail 1 shows Widget 1 and Back to latest; Back to latest returns to the newest", async () => {
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

  it("lead emoji: the first emoji in the Widget's params, else its archetype's, else sparkles", () => {
    const story = `root = Widget("T", [s])\ns = StoryScene([{id: "a", emoji: "bank", name: "The bank"}], [{who: "a", says: "Hello there"}])`;
    expect(leadEmojiOf(story)).toBe("bank");
    const versus = `root = Widget("T", [v])\nv = Versus("Cash", 5, "Card", 4, "usd")`;
    expect(leadEmojiOf(versus)).toBe("balance-scale");
    expect(leadEmojiOf(code("Title 1"))).toBe("sparkles");
  });
});

describe("the chat chip", () => {
  const chip = (it: WidgetItem, active: boolean) => renderToStaticMarkup(<WidgetChip item={it} active={active} onPick={() => {}} />);

  it("is idle: 'View widget →', not pressed", () => {
    const html = chip(item(1), false);
    expect(html).toContain("View widget →");
    expect(html).toContain('data-state="idle"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toMatch(/min-h-8!/);
  });

  it("is Showing, filled brand, while the panel shows its Widget", () => {
    const html = chip(item(1), true);
    expect(html).toContain("Showing");
    expect(html).toContain('data-state="showing"');
    expect(html).toContain("bg-[var(--brand-main)]!");
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
