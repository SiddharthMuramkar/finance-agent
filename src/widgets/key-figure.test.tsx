// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GenuiTheme } from "./genui-theme";
import { isKeyNumber, KeyFigure, markKeyFigures } from "./key-figure";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("markKeyFigures (A3b)", () => {
  it("the first key figure in a Widget wins, and removing it promotes the next", () => {
    const host = document.createElement("div");
    host.innerHTML = `<span data-key-figure=""></span><span data-key-figure=""></span><b data-key-figure=""></b>`;
    markKeyFigures(host);
    const all = [...host.querySelectorAll("[data-key-figure]")];
    expect(all[0].hasAttribute("data-key-figure-extra")).toBe(false);
    expect(all[1].hasAttribute("data-key-figure-extra")).toBe(true);
    expect(all[2].hasAttribute("data-key-figure-extra")).toBe(true);
    all[0].remove();
    markKeyFigures(host);
    const left = [...host.querySelectorAll("[data-key-figure]")];
    expect(left[0].hasAttribute("data-key-figure-extra")).toBe(false);
    expect(left[1].hasAttribute("data-key-figure-extra")).toBe(true);
  });
});

describe("the one key number (spec 2026-11-12, F2)", () => {
  it("is a lead key figure that reads as a number, never a word or a sentence", () => {
    for (const text of ["$877.8 million", "₹9.76 lakh", "35%", "$35"]) expect(isKeyNumber(text), text).toBe(true);
    for (const text of ["Yield", "Right.", "Found it: 3.38% is where the two offers match", "At this rate the cash is worth more today."]) {
      expect(isKeyNumber(text), text).toBe(false);
    }
  });

  it("is marked for the accent on the lead only, and raised to 20px when its part draws it smaller", () => {
    const host = document.createElement("div");
    host.innerHTML = `<dd data-key-figure="" style="font-size: 14px">₹1,93,388</dd><span data-key-figure="" style="font-size: 24px">$35</span><p data-key-figure="">Yield</p>`;
    document.body.append(host);
    markKeyFigures(host);
    const [small, extra, word] = [...host.querySelectorAll("[data-key-figure]")];
    expect(small.hasAttribute("data-key-number")).toBe(true);
    expect(small.hasAttribute("data-key-number-small")).toBe(true);
    expect(extra.hasAttribute("data-key-number")).toBe(false);
    small.remove();
    markKeyFigures(host);
    expect(extra.hasAttribute("data-key-number")).toBe(true);
    expect(extra.hasAttribute("data-key-number-small")).toBe(false);
    expect(word.hasAttribute("data-key-number")).toBe(false);
    host.remove();
  });
});

describe("KeyFigure inside GenuiTheme", () => {
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

  it("demotes the second key figure after mount, and a single one stays the lead", async () => {
    await act(async () => {
      root.render(
        <GenuiTheme>
          <KeyFigure>one</KeyFigure>
          <KeyFigure>two</KeyFigure>
        </GenuiTheme>,
      );
    });
    const figures = [...host.querySelectorAll("[data-key-figure]")];
    expect(figures).toHaveLength(2);
    expect(figures[0].hasAttribute("data-key-figure-extra")).toBe(false);
    expect(figures[1].hasAttribute("data-key-figure-extra")).toBe(true);

    await act(async () => {
      root.render(
        <GenuiTheme>
          <KeyFigure>only</KeyFigure>
        </GenuiTheme>,
      );
    });
    expect(host.querySelector("[data-key-figure-extra]")).toBeNull();
  });

  it("renders a dd with the mark and no font class", () => {
    const el = KeyFigure({ as: "dd", children: "12" }) as { type: string; props: { className?: string; "data-key-figure": string } };
    expect(el.type).toBe("dd");
    expect(el.props["data-key-figure"]).toBe("");
    expect(el.props.className ?? "").not.toMatch(/font-/);
  });
});
