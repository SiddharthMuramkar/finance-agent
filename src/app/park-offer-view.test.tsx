// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARK_OFFER, PARKED } from "@/tutor/park-items";
import { ParkActionsContext, type ParkActions } from "./park-offer-view";
import { SessionItemView } from "./session-item-view";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const offer = { kind: PARK_OFFER, data: { skillId: "pts-to-bp", line: "This one is not landing yet." } };
const buttons = () => [...host.querySelectorAll("button")];
const named = (name: RegExp) => buttons().find((b) => name.test(b.textContent ?? ""))!;

function mount(actions: ParkActions | null, item = offer) {
  act(() => root.render(<ParkActionsContext.Provider value={actions}><SessionItemView item={item} /></ParkActionsContext.Provider>));
}

describe("the park offer", () => {
  it("shows code's line and both buttons", () => {
    const html = renderToStaticMarkup(<ParkActionsContext.Provider value={{ act: async () => true, busy: false }}><SessionItemView item={offer} /></ParkActionsContext.Provider>);
    expect(html).toContain('data-testid="park-offer"');
    expect(html).toContain("This one is not landing yet.");
    expect(html).toContain("Park it, review tomorrow");
    expect(html).toContain("One more short try");
  });

  it("parks once: the buttons lock after one press", async () => {
    const act1 = vi.fn(async () => true);
    mount({ act: act1, busy: false });
    await act(async () => named(/Park it/).click());
    await act(async () => named(/Park it/).click());
    await act(async () => named(/One more/).click());
    expect(act1).toHaveBeenCalledTimes(1);
    expect(act1).toHaveBeenCalledWith({ park: "pts-to-bp" });
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });

  it("asks for one more short try", async () => {
    const act1 = vi.fn(async () => true);
    mount({ act: act1, busy: false });
    await act(async () => named(/One more/).click());
    expect(act1).toHaveBeenCalledWith({ oneMore: "pts-to-bp" });
  });

  it("unlocks again when the press fails", async () => {
    mount({ act: async () => false, busy: false });
    await act(async () => named(/Park it/).click());
    expect(named(/Park it/).disabled).toBe(false);
  });

  it("is read-only with no actions (Past Sessions), while a turn runs, and once chosen", () => {
    mount(null);
    expect(buttons().every((b) => b.disabled)).toBe(true);
    mount({ act: async () => true, busy: true });
    expect(buttons().every((b) => b.disabled)).toBe(true);
    mount({ act: async () => true, busy: false }, { ...offer, data: { ...offer.data, chosen: "park" } as never });
    expect(buttons().every((b) => b.disabled)).toBe(true);
  });
});

describe("the parked line", () => {
  it("says when the Skill comes back, with a Course Map link", () => {
    const html = renderToStaticMarkup(<SessionItemView item={{ kind: PARKED, data: { skillId: "pts-to-bp", line: "Back tomorrow after Thu 3:00 pm", until: "2026-11-05T09:30:00Z" } }} />);
    expect(html).toContain('data-testid="parked-line"');
    expect(html).toContain("Back tomorrow after Thu 3:00 pm");
    expect(html).toContain('href="/course"');
  });
});
