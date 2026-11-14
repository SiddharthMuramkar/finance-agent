// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollToRow } from "./scroll-to-row";

/**
 * B2b fix round: /notebook streams in behind loading.tsx, so Next's own hash scroll runs on the skeleton, finds no
 * `note-<topicId>` row and gives up. The Notebook scrolls to the row itself once its rows are on the page.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;
let scrolled: Element[];

beforeEach(() => {
  host = document.createElement("div");
  host.innerHTML = '<section id="note-bonds"></section><section id="note-pv"></section><h2 id="older-sessions"></h2>';
  document.body.append(host);
  root = createRoot(document.createElement("div"));
  scrolled = [];
  vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(function (this: Element) {
    scrolled.push(this);
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

const mount = () => act(() => root.render(<ScrollToRow />));

describe("ScrollToRow", () => {
  it("scrolls the row the address names into view once the rows are drawn", () => {
    history.replaceState(null, "", "/notebook#note-pv");
    mount();
    expect(scrolled.map((el) => el.id)).toEqual(["note-pv"]);
  });

  it("scrolls again when the address moves to another row", () => {
    history.replaceState(null, "", "/notebook#note-pv");
    mount();
    act(() => {
      history.replaceState(null, "", "/notebook#note-bonds");
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    });
    expect(scrolled.map((el) => el.id)).toEqual(["note-pv", "note-bonds"]);
  });

  it("does nothing without a row's hash, or for a Topic with no row", () => {
    history.replaceState(null, "", "/notebook");
    mount();
    act(() => root.unmount());
    root = createRoot(document.createElement("div"));
    history.replaceState(null, "", "/notebook#note-missing");
    mount();
    act(() => root.unmount());
    root = createRoot(document.createElement("div"));
    history.replaceState(null, "", "/notebook#older-sessions");
    mount();
    expect(scrolled).toEqual([]);
  });
});
