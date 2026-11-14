// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareToLaptop } from "./share-to-laptop";

// Spec 2026-11-12 E7: signed in on a phone, the main button reads "Send this to my laptop" and opens the share sheet with
// the site's address. Where there is no share sheet it copies the address and says so; with no clipboard either, it shows
// the address itself, so the press is never silent. The words land in a live region that is always rendered.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

async function draw() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ShareToLaptop className="" />));
}

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const status = () => host.querySelector('[role="status"]')!;
const press = () => act(async () => host.querySelector("button")!.click());

function phone(nav: { share?: unknown; clipboard?: unknown }) {
  vi.stubGlobal("navigator", { ...navigator, share: nav.share, clipboard: nav.clipboard });
}

describe("Send this to my laptop [E7]", () => {
  it("reads Send this to my laptop, with its live region rendered and empty before a press", async () => {
    await draw();
    expect(host.querySelector("button")!.textContent).toBe("Send this to my laptop");
    expect(status()).not.toBeNull();
    expect(status().textContent).toBe("");
  });

  it("opens the share sheet with the site's address, and says nothing more", async () => {
    const share = vi.fn(async () => {});
    phone({ share });
    await draw();
    await press();
    expect(share).toHaveBeenCalledWith({ title: "Value It", url: `${window.location.origin}/` });
    expect(status().textContent).toBe("");
  });

  it("with no share sheet, copies the address and says so", async () => {
    const writeText = vi.fn(async () => {});
    phone({ clipboard: { writeText } });
    await draw();
    await press();
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/`);
    expect(status().textContent).toBe("Link copied. Open it on your laptop or tablet.");
  });

  it("with neither a share sheet nor a clipboard, shows the address to open on the laptop", async () => {
    phone({ clipboard: { writeText: async () => Promise.reject(new Error("denied")) } });
    await draw();
    await press();
    expect(status().textContent).toBe(`Open ${window.location.origin}/ on your laptop or tablet.`);
  });
});
