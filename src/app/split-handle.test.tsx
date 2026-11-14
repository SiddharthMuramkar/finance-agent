// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { SplitHandle } from "./split-handle";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("SplitHandle (C2b)", () => {
  let root: Root;
  let host: HTMLElement;

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    document.cookie = "split=; path=/; max-age=0";
  });

  function render(initial = 45) {
    host = document.createElement("div");
    host.dataset.splitFrame = "";
    document.body.append(host);
    root = createRoot(host);
    act(() => {
      root.render(<SplitHandle initial={initial} />);
    });
    return host.querySelector<HTMLElement>('[data-testid="split-handle"]')!;
  }

  function key(handle: HTMLElement, name: string) {
    act(() => {
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }));
    });
  }

  it("is a vertical separator at 45, and the keys, Home, End and a double-click move it", () => {
    const handle = render();
    expect(handle.getAttribute("role")).toBe("separator");
    expect(handle.getAttribute("aria-orientation")).toBe("vertical");
    expect(handle.getAttribute("aria-valuenow")).toBe("45");
    expect(handle.getAttribute("aria-valuemin")).toBe("33");
    expect(handle.getAttribute("aria-valuemax")).toBe("67");
    expect(handle.getAttribute("aria-valuetext")).toBe("Conversation 45%");
    expect(handle.getAttribute("aria-controls")).toBe("conversation-column widget-column");
    expect(handle.getAttribute("tabindex")).toBe("0");
    expect(handle.getAttribute("aria-label")).toBe("Resize the conversation and the Widget panel");

    key(handle, "ArrowRight");
    expect(handle.getAttribute("aria-valuenow")).toBe("47");
    expect(host.style.getPropertyValue("--split-saved")).toBe("47");
    expect(document.cookie).toContain("split=47");

    key(handle, "Home");
    expect(handle.getAttribute("aria-valuenow")).toBe("33");
    key(handle, "End");
    expect(handle.getAttribute("aria-valuenow")).toBe("67");
    act(() => {
      handle.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(handle.getAttribute("aria-valuenow")).toBe("45");
    expect(document.cookie).toContain("split=45");
    key(handle, "Enter");
    expect(handle.getAttribute("aria-valuenow")).toBe("45");
  });
});