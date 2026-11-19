// A stand-in for the Popover API in happy-dom, which has none (audit batch 2, finding 5), so a test can open the app's
// native popovers (usePopover, useMenu) the way a browser does. It copies only what the app leans on a browser for:
// showPopover, hidePopover and togglePopover; :popover-open in matches(); a beforetoggle event before the change and a
// toggle event a microtask after it (a browser queues it); and a press on a popovertarget button, once its click is
// done and not cancelled, toggling its popover. Light dismiss (Esc, a press outside) and the browser's focus return are
// not copied: a test closes a popover with hidePopover(), as the browser would, and the app's own Esc handling is what
// gets tested. Install it in beforeAll and call what it returns in afterAll. Where the DOM has the API, nothing changes.

const showing = new WeakSet<Element>();

function fire(el: Element, type: "beforetoggle" | "toggle", newState: "open" | "closed") {
  const oldState = newState === "open" ? "closed" : "open";
  el.dispatchEvent(Object.assign(new Event(type, { cancelable: type === "beforetoggle" && newState === "open" }), { newState, oldState }));
}

function change(el: HTMLElement, open: boolean) {
  if (showing.has(el) === open) return;
  fire(el, "beforetoggle", open ? "open" : "closed");
  if (open) showing.add(el);
  else showing.delete(el);
  queueMicrotask(() => fire(el, "toggle", open ? "open" : "closed"));
}

const api = {
  showPopover(this: HTMLElement) {
    change(this, true);
  },
  hidePopover(this: HTMLElement) {
    change(this, false);
  },
  togglePopover(this: HTMLElement) {
    change(this, !showing.has(this));
    return showing.has(this);
  },
};

/** A press on a popovertarget button, after every listener has had it: toggles its popover unless one cancelled it. */
function invoke(event: Event) {
  if (event.defaultPrevented || !(event.target instanceof Element)) return;
  const button = event.target.closest("button[popovertarget]");
  const target = button && document.getElementById(button.getAttribute("popovertarget")!);
  if (target instanceof HTMLElement && target.hasAttribute("popover")) api.togglePopover.call(target);
}

export function installPopoverStandIn(): () => void {
  if (typeof HTMLElement.prototype.showPopover === "function") return () => {};
  const matches = Element.prototype.matches;
  Object.assign(HTMLElement.prototype, api);
  Element.prototype.matches = function (this: Element, selector: string) {
    return selector === ":popover-open" ? showing.has(this) : matches.call(this, selector);
  };
  // On the window, so it runs after React's listener on the root and any handler that cancels the press.
  window.addEventListener("click", invoke);
  return () => {
    window.removeEventListener("click", invoke);
    Element.prototype.matches = matches;
    for (const name of Object.keys(api)) delete (HTMLElement.prototype as unknown as Record<string, unknown>)[name];
  };
}

/** Whether the stand-in (or the browser) shows `el` as an open popover. */
export const isOpen = (el: Element | null) => !!el && el.matches(":popover-open");
