// @vitest-environment happy-dom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkspaceFrame } from "./workspace-frame";

// The phone's Widget sheet is a modal dialog while it is up (#82, review F18): the conversation behind it is inert,
// focus moves to its Back button, Escape closes it, and focus returns to the chip that opened it. A laptop's right column
// is never a dialog.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const screenOf = (width: number) =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: width >= Number(query.match(/(\d+)px/)?.[1]), media: query, addEventListener: () => {}, removeEventListener: () => {} }));

let root: Root;
let el: HTMLElement;
let closes = 0;

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header>
        <a href="/course">Course</a>
      </header>
      <WorkspaceFrame
        open={open}
        onClose={() => {
          closes++;
          setOpen(false);
        }}
        left={
          <div data-testid="left">
            <button type="button" data-testid="chip" onClick={() => setOpen(true)}>
              Widget 1
            </button>
          </div>
        }
        top={null}
        right={<p>panel</p>}
      />
    </>
  );
}

beforeEach(async () => {
  closes = 0;
  el = document.createElement("div");
  document.body.append(el);
  root = createRoot(el);
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  vi.unstubAllGlobals();
});

const q = (sel: string) => el.querySelector<HTMLElement>(sel)!;
const sheet = () => q('[data-testid="panel-column"]');
const openByChip = async () => {
  q('[data-testid="chip"]').focus();
  await act(async () => q('[data-testid="chip"]').click());
};

describe("the phone's Widget sheet", () => {
  beforeEach(async () => {
    screenOf(390);
    await act(async () => root.render(<Page />));
  });

  it("is no dialog while it waits below the screen", () => {
    expect(sheet().getAttribute("role")).toBeNull();
    expect(q('[data-testid="left"]').inert).toBe(false);
  });

  it("is a modal dialog once a chip opens it: the page behind is inert and focus is on its Back button", async () => {
    await openByChip();
    expect(sheet().getAttribute("role")).toBe("dialog");
    expect(sheet().getAttribute("aria-modal")).toBe("true");
    expect(sheet().getAttribute("aria-label")).toBe("Widget sheet");
    expect(q('[data-testid="left"]').inert).toBe(true);
    expect(q("header").inert).toBe(true);
    expect(sheet().inert).toBe(false);
    expect(document.activeElement?.textContent).toContain("Back to the conversation");
  });

  it("closes on Escape, frees the page and gives focus back to the chip", async () => {
    await openByChip();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(closes).toBe(1);
    expect(sheet().getAttribute("role")).toBeNull();
    expect(q('[data-testid="left"]').inert).toBe(false);
    expect(q("header").inert).toBe(false);
    expect(document.activeElement).toBe(q('[data-testid="chip"]'));
  });

  it("closes from its Back button the same way", async () => {
    await openByChip();
    await act(async () => (document.activeElement as HTMLElement).click());
    expect(closes).toBe(1);
    expect(document.activeElement).toBe(q('[data-testid="chip"]'));
  });
});

describe("a laptop's right column", () => {
  it("is never a dialog and leaves the page alone, open or not", async () => {
    screenOf(1512);
    await act(async () => root.render(<Page />));
    await openByChip();
    expect(sheet().getAttribute("role")).toBeNull();
    expect(q('[data-testid="left"]').inert).toBe(false);
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(closes).toBe(0);
  });
});
