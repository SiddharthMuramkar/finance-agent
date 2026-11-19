// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { RESTART_CONFIRM } from "@/learner/restart";
import { installPopoverStandIn, isOpen } from "@/test/popover";
import { RestartConfirm } from "./restart-confirm";
import { TopicBar } from "./workspace-parts";

// The Topic bar's "⋯" menu (spec 2026-11-05 B3b): Start this Topic over… opens the confirm; Cancel closes it and posts nothing.
// The menu is a native popover (audit batch 2); happy-dom has no Popover API, so src/test/popover.ts stands in for it.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

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
});

const bar = () => host.querySelector<HTMLElement>('[data-testid="topic-bar"]')!;
const options = () => host.querySelector<HTMLButtonElement>('button[aria-label="Topic options"]')!;
const menu = () => host.querySelector<HTMLElement>('[role="menu"]')!;
const click = (el: HTMLElement) => act(async () => el.click());
const press = (el: Element, key: string) => act(async () => void el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
const mount = () => act(async () => root.render(<TopicBar topicId="percent" title="Percent" strip={null} marked={new Set()} />));

describe("the Topic bar's ⋯ menu", () => {
  it("keeps the Topic bar's test id and name, and has a Topic options button", async () => {
    await mount();
    expect(bar().getAttribute("aria-label")).toBe("Topic progress");
    expect(options()).not.toBeNull();
    expect(options().getAttribute("aria-haspopup")).toBe("menu");
    expect(options().getAttribute("aria-expanded")).toBe("false");
    expect(options().getAttribute("data-affordance")).toBe("icon");
  });

  it("has no ⋯ button without a Topic id (a bar with nothing to start over)", () => {
    expect(renderToStaticMarkup(<TopicBar title="Percent" strip={null} marked={new Set()} />)).not.toContain("Topic options");
  });

  it("is a native popover on the Band: closed in the page, right after its button, a card on the bar in the DOM", async () => {
    await mount();
    expect(menu().getAttribute("popover")).toBe("auto");
    expect(isOpen(menu())).toBe(false);
    expect(options().nextElementSibling).toBe(menu());
    expect(options().getAttribute("popovertarget")).toBe(menu().id);
    // The top layer draws it, but its DOM parent is still the Band, so the band-card rules reach it; no z-index of its own.
    expect(menu().closest(".band")).toBe(bar());
    expect(menu().className).toMatch(/\bpopover band-card\b/);
    expect(menu().className).not.toMatch(/\b(absolute|relative|z-\d)/);
  });

  it("opens with Enter (the button's own click: A5's shared menu keyboard) and focuses Start this Topic over…", async () => {
    await mount();
    await click(options());
    expect(options().getAttribute("aria-expanded")).toBe("true");
    const row = host.querySelector<HTMLElement>('[role="menu"] [role="menuitem"]')!;
    expect(row.textContent).toBe("Start this Topic over…");
    expect(document.activeElement).toBe(row);
  });

  it("opens with the arrow key and shows Start this Topic over…", async () => {
    await mount();
    await press(options(), "ArrowDown");
    expect(options().getAttribute("aria-expanded")).toBe("true");
    const menu = host.querySelector('[role="menu"]')!;
    expect(menu.querySelectorAll('[role="menuitem"]')).toHaveLength(1);
    expect(menu.textContent).toBe("Start this Topic over…");
  });

  it("choosing it shows the confirm: the words, a danger Start over inside the restart form, and Cancel", async () => {
    await mount();
    await click(options());
    await click(host.querySelector<HTMLElement>('[role="menuitem"]')!);
    expect(isOpen(menu())).toBe(false);
    expect(options().getAttribute("aria-expanded")).toBe("false");
    expect(bar().textContent).toContain("This clears your Checks and progress for this Topic. Your Notebook keeps the old conversation and your notes.");
    const form = host.querySelector<HTMLFormElement>("form")!;
    expect(form.getAttribute("action")).toBe("/api/topics/percent/restart");
    expect(form.getAttribute("method")).toBe("post");
    expect(form.querySelector<HTMLInputElement>('input[name="confirm"]')!.value).toBe(RESTART_CONFIRM);
    const go = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(go.textContent).toBe("Start over");
    expect(go.className).toContain("btn-danger");
    expect([...host.querySelectorAll("button")].map((b) => b.textContent)).toContain("Cancel");
  });

  it("Cancel closes the confirm, and nothing is posted", async () => {
    const submitted = vi.fn();
    await mount();
    host.addEventListener("submit", submitted);
    await click(options());
    await click(host.querySelector<HTMLElement>('[role="menuitem"]')!);
    await click([...host.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Cancel")!);
    expect(host.querySelector("form")).toBeNull();
    expect(submitted).not.toHaveBeenCalled();
  });

  it("choosing the row with the keyboard moves focus into the confirm (its Cancel), not to the page", async () => {
    await mount();
    await press(options(), "ArrowDown");
    await click(document.activeElement as HTMLElement);
    const cancel = [...host.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Cancel")!;
    expect(document.activeElement).toBe(cancel);
  });

  it("Cancel returns focus to the ⋯ button", async () => {
    await mount();
    await click(options());
    await click(host.querySelector<HTMLElement>('[role="menuitem"]')!);
    await click([...host.querySelectorAll<HTMLElement>("button")].find((b) => b.textContent === "Cancel")!);
    expect(document.activeElement).toBe(options());
  });

  it("Escape closes the menu and returns focus to the button", async () => {
    await mount();
    await click(options());
    await press(menu(), "Escape");
    expect(isOpen(menu())).toBe(false);
    expect(document.activeElement).toBe(options());
  });
});

describe("the restart confirm on its own", () => {
  it("posts to the Topic's restart route with the confirm field", () => {
    const html = renderToStaticMarkup(<RestartConfirm topicId="percent" onCancel={() => {}} />);
    expect(html).toContain('action="/api/topics/percent/restart"');
    expect(html).toContain(`name="confirm" value="${RESTART_CONFIRM}"`);
  });
});
