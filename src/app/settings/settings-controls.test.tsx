// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StartOverButton } from "./settings-controls";

// Settings → Start over (audit batch 2, finding 9): the button stays in the page and asks its question in a native modal
// dialog. happy-dom draws no top layer and knows neither Esc on a dialog nor closedby, so these tests pin what the app
// itself owns: showModal() (not show() or the open attribute), the names, Cancel's first focus and dialog-method close,
// the post, and the light-dismiss fallback for a browser without closedby. e2e/affordance.spec.ts checks the real
// browser: modal, Esc, focus back on the button, a press on the backdrop.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

const trigger = () => host.querySelector<HTMLButtonElement>(":scope > button")!;
const dialog = () => host.querySelector<HTMLDialogElement>("dialog")!;
const button = (name: string) => [...dialog().querySelectorAll("button")].find((b) => b.textContent === name)!;
const click = (el: HTMLElement) => act(async () => el.click());
/** A press on (x, y) as a browser sends it: pointerdown on `down`, then click on `up` (the dialog, for its backdrop). */
const pressAt = (down: Element, up: Element, x: number, y: number) =>
  act(async () => {
    down.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, clientX: x, clientY: y }));
    up.dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: x, clientY: y }));
  });

beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<StartOverButton confirmValue="start-over" />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("Start over as a new learner", () => {
  it("is the outline danger button, with its question in the page as a closed, named dialog", () => {
    expect(trigger().className).toBe("btn btn-secondary btn-danger-outline");
    expect(trigger().getAttribute("type")).toBe("button");
    expect(trigger().textContent).toBe("Start over as a new learner");
    expect(dialog().open).toBe(false);
    expect(dialog().className).toBe("dialog");
    expect(dialog().getAttribute("closedby")).toBe("any");
    // The native modal gives the role and the modality: no role, aria-modal or alertdialog of our own.
    for (const name of ["role", "aria-modal"]) expect(dialog().hasAttribute(name), name).toBe(false);
    const named = (attr: string) => document.getElementById(dialog().getAttribute(attr)!)!;
    expect(named("aria-labelledby").tagName).toBe("H2");
    expect(named("aria-labelledby").textContent).toBe("Start over as a new learner?");
    expect(named("aria-describedby").textContent).toMatch(/^You begin again at the Welcome with no progress, Notebook or Sessions\. Nothing is deleted/);
    expect(named("aria-describedby").textContent).toContain("Any other device signed in as you is signed out.");
  });

  it("opens the dialog as a modal and keeps the button in the page, so focus has somewhere to come back to", async () => {
    const showModal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const before = trigger();
    await click(before);
    expect(showModal).toHaveBeenCalledOnce();
    expect(showModal.mock.contexts[0]).toBe(dialog());
    expect(dialog().open).toBe(true);
    expect(trigger()).toBe(before);
    expect(before.isConnected).toBe(true);
  });

  it("gives Cancel, the safe answer, the first focus: the autofocus attribute is there on a client render too", () => {
    // React writes autoFocus as the attribute only on the server; the dialog's focusing steps need the attribute.
    expect([...dialog().querySelectorAll("[autofocus]")]).toEqual([button("Cancel")]);
    expect(button("Cancel").className).toMatch(/^btn btn-secondary\b/);
    expect(button("Yes, start over").className).toMatch(/^btn btn-danger\b/);
  });

  it("Cancel closes the dialog through the dialog method, and nothing is posted", async () => {
    await click(trigger());
    const sent: (HTMLElement | null)[] = [];
    dialog().addEventListener("submit", (e) => sent.push((e as SubmitEvent).submitter));
    expect(button("Cancel").getAttribute("type")).toBe("submit");
    expect(button("Cancel").getAttribute("formmethod")).toBe("dialog");
    await click(button("Cancel"));
    expect(dialog().open).toBe(false);
    expect(dialog().returnValue).toBe("cancel");
    // A dialog-method submission closes the dialog and stops there: the form's post never starts.
    expect(sent).toEqual([button("Cancel")]);
  });

  it("Yes, start over posts the plain form with the confirm value to /api/start-over", async () => {
    await click(trigger());
    const posts: { submitter: HTMLElement | null; confirm: FormDataEntryValue | null }[] = [];
    const form = dialog().querySelector("form")!;
    form.addEventListener("submit", (e) => {
      e.preventDefault(); // no navigation in the test
      posts.push({ submitter: (e as SubmitEvent).submitter, confirm: new FormData(form).get("confirm") });
    });
    expect(form.getAttribute("action")).toBe("/api/start-over");
    expect(form.getAttribute("method")).toBe("post");
    await click(button("Yes, start over"));
    expect(posts).toEqual([{ submitter: button("Yes, start over"), confirm: "start-over" }]);
  });

  describe("light dismiss where the browser has no closedby (Safari)", () => {
    beforeEach(async () => {
      expect("closedBy" in HTMLDialogElement.prototype, "happy-dom has no closedby, as Safari").toBe(false);
      await click(trigger());
      // The dialog's box on screen: 100,100 to 500,300.
      dialog().getBoundingClientRect = () => new DOMRect(100, 100, 400, 200);
    });

    it("a press on the backdrop (the dialog element, outside its box) closes it", async () => {
      await pressAt(dialog(), dialog(), 20, 20);
      expect(dialog().open).toBe(false);
    });

    it("a press on the dialog's own padding, on a control, or dragged out from inside does not", async () => {
      await pressAt(dialog(), dialog(), 110, 110);
      expect(dialog().open).toBe(true);
      // Enter on a button is a click at 0,0, outside the box, but its target is the button (its post is held back here).
      dialog().querySelector("form")!.addEventListener("submit", (e) => e.preventDefault());
      await act(async () => void button("Yes, start over").dispatchEvent(new MouseEvent("click", { bubbles: true, clientX: 0, clientY: 0 })));
      // A text selection that starts in the question and ends on the backdrop.
      await pressAt(dialog().querySelector("p")!, dialog(), 20, 20);
      expect(dialog().open).toBe(true);
    });

    it("steps aside where the browser light-dismisses by itself", async () => {
      Object.defineProperty(HTMLDialogElement.prototype, "closedBy", { configurable: true, get: () => "any" });
      try {
        const close = vi.spyOn(dialog(), "close");
        await pressAt(dialog(), dialog(), 20, 20);
        expect(close).not.toHaveBeenCalled();
      } finally {
        delete (HTMLDialogElement.prototype as { closedBy?: string }).closedBy;
      }
    });
  });
});
