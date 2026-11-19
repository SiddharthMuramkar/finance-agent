// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installPopoverStandIn, isOpen } from "@/test/popover";
import { placeUnder, usePopover } from "./popover";

// The app's native popovers (audit batch 2, finding 5): one anchor name per instance for CSS anchor positioning, and where
// the browser has no anchor positioning, a place under the button worked out as the layer opens (flipped above when there
// is no room below, pulled in from the left edge). happy-dom has no Popover API, so src/test/popover.ts stands in for it.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const rect = (left: number, top: number, width: number, height: number) =>
  ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) }) as DOMRect;
const view = { width: 1000, height: 800 };

describe("placeUnder, where anchor positioning is missing", () => {
  it("hangs the layer gap px under its button, the right edges lined up", () => {
    expect(placeUnder(rect(900, 10, 32, 32), { width: 240, height: 120 }, view, 8)).toEqual({ top: 50, right: 68 });
  });

  it("flips it above the button when it would run past the window's bottom and there is more room above", () => {
    expect(placeUnder(rect(900, 700, 32, 32), { width: 240, height: 120 }, view, 8)).toEqual({ top: 572, right: 68 });
  });

  it("keeps it below when it does not fit either way but below has more room", () => {
    expect(placeUnder(rect(900, 300, 32, 32), { width: 240, height: 600 }, view, 8)).toEqual({ top: 340, right: 68 });
  });

  it("pulls it in from the window's left edge when the button is too far left for its width", () => {
    // A 240px layer under a button whose right edge is at 100px would start at -140px; it starts 8px in instead.
    expect(placeUnder(rect(68, 10, 32, 32), { width: 240, height: 120 }, view, 8)).toEqual({ top: 50, right: 752 });
  });

  it("before the layer has a size (as it opens) it simply goes under the button", () => {
    expect(placeUnder(rect(900, 10, 32, 32), { width: 0, height: 0 }, view, 4)).toEqual({ top: 46, right: 68 });
  });
});

function Probe({ gap }: { gap?: number }) {
  const pop = usePopover({ gap });
  return (
    <div>
      <button type="button" {...pop.buttonProps}>
        Open
      </button>
      <div {...pop.popoverProps} className="popover">
        <a href="/x">Row</a>
      </div>
      <span data-testid="open">{String(pop.open)}</span>
    </div>
  );
}

let root: Root;
let host: HTMLElement;
let uninstall: () => void;
beforeAll(() => {
  uninstall = installPopoverStandIn();
});
afterAll(() => uninstall());
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const draw = (node: React.ReactNode) => act(async () => root.render(node));

describe("usePopover", () => {
  it("gives each instance its own anchor name: the button's anchor-name is its layer's position-anchor", async () => {
    await draw(
      <>
        <Probe />
        <Probe />
      </>,
    );
    const buttons = [...host.querySelectorAll<HTMLButtonElement>("button")];
    const layers = [...host.querySelectorAll<HTMLElement>("[popover]")];
    const names = buttons.map((b) => b.style.getPropertyValue("anchor-name"));
    expect(names[0]).toMatch(/^--popover[\w-]+$/);
    expect(names[0]).not.toBe(names[1]);
    layers.forEach((layer, i) => {
      expect(layer.style.getPropertyValue("position-anchor")).toBe(names[i]);
      expect(buttons[i].getAttribute("popovertarget")).toBe(layer.id);
    });
  });

  it("sets the gap for CSS, and keeps `open` true to the toggle events", async () => {
    await draw(<Probe gap={4} />);
    const layer = host.querySelector<HTMLElement>("[popover]")!;
    expect(layer.style.getPropertyValue("--popover-gap")).toBe("4px");
    expect(host.querySelector('[data-testid="open"]')!.textContent).toBe("false");
    await act(async () => host.querySelector("button")!.click());
    expect(isOpen(layer)).toBe(true);
    expect(host.querySelector('[data-testid="open"]')!.textContent).toBe("true");
    expect(host.querySelector("button")!.getAttribute("aria-expanded")).toBe("true");
  });

  it("without anchor positioning, places the layer under its button as it opens, and refines it once it shows", async () => {
    // window.CSS is a fresh object on each read in happy-dom, so the whole of it is stubbed.
    vi.stubGlobal("CSS", { supports: () => false });
    await draw(<Probe />);
    const button = host.querySelector("button")!;
    const layer = host.querySelector<HTMLElement>("[popover]")!;
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(view.width);
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(view.height);
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(rect(900, 700, 32, 32));
    vi.spyOn(layer, "getBoundingClientRect").mockReturnValue(rect(0, 0, 240, 120));
    const seen: string[] = [];
    layer.addEventListener("beforetoggle", () => queueMicrotask(() => seen.push(layer.style.getPropertyValue("--popover-top"))));
    await act(async () => button.click());
    // As it opens its size is unknown, so it goes under the button; once it shows it is 120px tall, so it flips above.
    expect(seen).toEqual(["740px"]);
    expect(layer.style.getPropertyValue("--popover-top")).toBe("572px");
    expect(layer.style.getPropertyValue("--popover-right")).toBe("68px");
  });

  it("with anchor positioning, leaves the placing to CSS", async () => {
    vi.stubGlobal("CSS", { supports: (property: string) => property === "position-area" });
    await draw(<Probe />);
    const layer = host.querySelector<HTMLElement>("[popover]")!;
    await act(async () => host.querySelector("button")!.click());
    expect(isOpen(layer)).toBe(true);
    expect(layer.style.getPropertyValue("--popover-top")).toBe("");
    expect(layer.style.getPropertyValue("--popover-right")).toBe("");
  });

  it("Escape closes it and hands focus back to the button", async () => {
    await draw(<Probe />);
    const button = host.querySelector("button")!;
    const layer = host.querySelector<HTMLElement>("[popover]")!;
    await act(async () => button.click());
    layer.querySelector("a")!.focus();
    await act(async () => void layer.querySelector("a")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })));
    expect(isOpen(layer)).toBe(false);
    expect(document.activeElement).toBe(button);
  });
});
