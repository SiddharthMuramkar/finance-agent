// @vitest-environment happy-dom
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePrefersReducedMotion } from "./motion";
import { stubReducedMotion } from "./test-kit";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Probe() {
  const reduced = usePrefersReducedMotion();
  return <section data-testid="probe" data-motion={reduced ? "off" : "on"} className={reduced ? "" : "story-step"} />;
}

describe("usePrefersReducedMotion", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("hydrates a server page without a mismatch when the Learner asks for reduced motion, then turns motion off", async () => {
    // The server knows nothing of the Learner's preference, so it draws motion on.
    stubReducedMotion(false);
    const html = renderToString(<Probe />);
    expect(html).toContain('data-motion="on"');

    // The Learner's browser asks for reduced motion.
    stubReducedMotion(true);
    const host = document.createElement("div");
    host.innerHTML = html;
    document.body.append(host);
    const errors: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(" "));
    });
    const recoverable: unknown[] = [];
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(host, <Probe />, { onRecoverableError: (e) => recoverable.push(e) });
    });
    spy.mockRestore();

    expect(errors.filter((e) => /hydrat|did(?:n't| not) match/i.test(e))).toEqual([]);
    expect(recoverable).toEqual([]);
    expect(host.querySelector('[data-testid="probe"]')!.getAttribute("data-motion")).toBe("off");
    act(() => root!.unmount());
    host.remove();
  });
});
