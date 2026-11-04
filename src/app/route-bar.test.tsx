// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import Link from "next/link";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteBar } from "./route-bar";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let search = "";
vi.mock("next/navigation", () => ({
  usePathname: () => "/home",
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, refresh: () => {} }),
}));

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  search = "";
  window.history.replaceState({}, "", "/home");
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

const phase = () => host.querySelector('[data-testid="route-bar"]')!.getAttribute("data-phase");
const draw = () =>
  act(async () =>
    root.render(
      <>
        <RouteBar />
        <Link href="/course">Course</Link>
      </>,
    ),
  );
const link = () => host.querySelector("a")!;

describe("the route bar", () => {
  it("starts on a next/link click, even though Link prevents the default", async () => {
    await draw();
    expect(phase()).toBe("idle");
    await act(async () => void link().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
    expect(phase()).toBe("loading");
  });

  it("finishes when only the search params change", async () => {
    await draw();
    await act(async () => void link().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 })));
    expect(phase()).toBe("loading");
    search = "tab=notes";
    await draw();
    expect(phase()).toBe("done");
  });

  it("is not armed by a ctrl-click", async () => {
    await draw();
    await act(async () => void link().dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ctrlKey: true })));
    expect(phase()).toBe("idle");
  });
});
