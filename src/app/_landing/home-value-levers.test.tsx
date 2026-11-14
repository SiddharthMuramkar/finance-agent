// @vitest-environment happy-dom
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setRange } from "@/widgets/primitives/wave1/test-kit";
import { copy } from "./copy";

// Home's section 2, "Now value a company" (spec 2026-11-12 E4, Appendix F), as a visitor meets it: Value levers (B3) on
// Amazon in February 2000, every number from the engine (Appendix B.1, B.2), in the browser with no model call (E4, E
// Done when), two events sent once each (E10), and an import graph that never reaches the Widget renderer (E8). Home has
// no Topic Insight to settle (B3, C5), so the chip held back for it never shows here.

const tracked = vi.hoisted(() => vi.fn());
vi.mock("../analytics", () => ({ track: tracked }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {}, push: () => {} }), usePathname: () => "/" }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { HomeValueLevers } = await import("./home-value-levers");
const { HOME_TOPIC_ID } = await import("./home-topic");

let root: Root;
let host: HTMLElement;
let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  tracked.mockClear();
  fetchSpy = vi.fn(() => Promise.reject(new Error("no request may leave section 2")));
  vi.stubGlobal("fetch", fetchSpy);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const settle = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 10));
  });
const headline = () => host.querySelector('[data-testid="value-levers-headline"]')?.textContent ?? "";
const lever = (label: string) => host.querySelector<HTMLInputElement>(`input[type="range"][aria-label="${label}"]`)!;
const chips = () => [...host.querySelectorAll('[role="group"][aria-label="Stories"] button')].map((b) => b.textContent);
const chip = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Stories"] button')].find((b) => b.textContent === label)!;
const taskStates = () => [...host.querySelectorAll('[data-testid="guided-tasks"] li')].map((li) => li.getAttribute("data-state"));
const press = (button: HTMLElement) => act(async () => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
const REVENUE = "Revenue in year 10";
const MARGIN = "Operating margin once mature";

async function draw(props: { signedOut?: boolean; canOpenTopic?: boolean; caseId?: string } = { signedOut: true }) {
  await act(async () => root.render(<HomeValueLevers {...props} />));
  await settle();
}

describe("Now value a company (E4)", () => {
  it("sets the scene in Appendix F's three sentences and opens Value levers on Amazon at $35 against the $84 price (B3, B.1)", async () => {
    await draw();
    const section = host.querySelector("section#value-a-company")!;
    expect(section.getAttribute("data-home-section")).toBe("value-a-company");
    expect(section.querySelector("h2")?.textContent).toBe("Now value a company.");
    expect(section.textContent).toContain("February 2000. Amazon sells books online, loses money, and its shares cost $84. Set four levers and see what your story is worth.");
    expect(section.textContent).toContain(copy.valueCompany.caption);
    // The Widget sits in B1's plain frame, after the words.
    const frame = host.querySelector('[data-testid="home-value-levers"]')!;
    expect(frame.hasAttribute("data-widget-content")).toBe(true);
    expect(frame.querySelector('[data-testid="value-levers"]')).not.toBeNull();
    expect(headline()).toBe("Your story is worth $35 a share");
    expect(host.querySelector('[data-testid="value-levers-numbers"]')?.textContent).toContain("$84");
    expect(lever(REVENUE).getAttribute("aria-valuetext")).toBe("39 billion dollars");
    expect(lever(MARGIN).getAttribute("aria-valuetext")).toBe("10 percent");
  });

  it('offers Damodaran\'s story and A grocer\'s margins, and never "A story worth $84", even at the price: Home settles no Topic Insight (B3, C5)', async () => {
    await draw();
    expect(chips()).toEqual(["Damodaran's story", "A grocer's margins"]);
    // Revenue $60bn alone: $58.64 (B.2).
    setRange(lever(REVENUE), 60);
    await settle();
    expect(headline()).toBe("Your story is worth $59 a share");
    // With margin 12.5%: $84.07, the price (B3's table, B.2); both Things to try tick.
    setRange(lever(MARGIN), 12.5);
    await settle();
    expect(headline()).toBe("Your story is worth $84 a share");
    expect(taskStates()).toEqual(["done", "done"]);
    // B3: the third chip waits for the Topic's Insight, settled only when the Learner also says what they changed (C5),
    // to a Tutor Home does not have.
    expect(chips()).toEqual(["Damodaran's story", "A grocer's margins"]);
    expect(host.textContent).not.toContain("A story worth $84");
    // The chips move every lever at once: a grocer's 4% margin leaves nothing for shareholders (B.2: -$5.49, shown as $0),
    // then back to the professor's $35.
    await press(chip("A grocer's margins"));
    await settle();
    expect(headline()).toBe("$0: lenders and option holders take everything");
    expect(lever(MARGIN).getAttribute("aria-valuetext")).toBe("4 percent");
    await press(chip("Damodaran's story"));
    await settle();
    expect(headline()).toBe("Your story is worth $35 a share");
    expect(lever(REVENUE).getAttribute("aria-valuetext")).toBe("39 billion dollars");
    expect(lever(MARGIN).getAttribute("aria-valuetext")).toBe("10 percent");
  });

  it("sends home_lever_first_move and home_price_found once each, with nothing about the visitor (E10)", async () => {
    await draw();
    expect(tracked).not.toHaveBeenCalled();
    setRange(lever(REVENUE), 60);
    await settle();
    setRange(lever(REVENUE), 61);
    await settle();
    setRange(lever(REVENUE), 60);
    await settle();
    expect(tracked.mock.calls).toEqual([["home_lever_first_move"]]);
    setRange(lever(MARGIN), 12.5);
    await settle();
    setRange(lever(MARGIN), 10);
    await settle();
    setRange(lever(MARGIN), 12.5);
    await settle();
    await press(chip("A grocer's margins"));
    await press(chip("Damodaran's story"));
    await settle();
    setRange(lever(REVENUE), 60);
    setRange(lever(MARGIN), 12.5);
    await settle();
    expect(tracked.mock.calls).toEqual([["home_lever_first_move"], ["home_price_found"]]);
  });

  // E10's "first move of a lever": a story chip moves every lever at once (B3), and the hero counts its chips as its
  // slider's first move, so a visitor who only taps a chip has moved the levers too.
  it("counts a story chip that moves the levers as the first lever move, and sends it once (E10, B3)", async () => {
    await draw();
    await press(chip("A grocer's margins"));
    await settle();
    expect(headline()).toBe("$0: lenders and option holders take everything");
    expect(tracked.mock.calls).toEqual([["home_lever_first_move"]]);
    setRange(lever(REVENUE), 60);
    await press(chip("Damodaran's story"));
    await settle();
    expect(tracked.mock.calls).toEqual([["home_lever_first_move"]]);
  });

  it('sends nothing for "Damodaran\'s story" pressed at the opening, where it moves no lever (E10)', async () => {
    await draw();
    await press(chip("Damodaran's story"));
    await settle();
    expect(headline()).toBe("Your story is worth $35 a share");
    expect(tracked).not.toHaveBeenCalled();
    setRange(lever(MARGIN), 12);
    await settle();
    // Margin 12% alone: $48.51 (B3's table).
    expect(headline()).toBe("Your story is worth $49 a share");
    expect(tracked.mock.calls).toEqual([["home_lever_first_move"]]);
  });

  it("makes no request: no model call, no /api/turn, no Case Data route (E4, E Done when)", async () => {
    await draw();
    setRange(lever(REVENUE), 60);
    setRange(lever(MARGIN), 12.5);
    await settle();
    await press(chip("Damodaran's story"));
    await settle();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('signed out, says "Sign in to see what happened next →" under the Widget, to the sign-in page (E4)', async () => {
    await draw({ signedOut: true });
    const link = host.querySelector<HTMLAnchorElement>('a[href="/login"]')!;
    expect(link.textContent).toBe("Sign in to see what happened next →");
    const frame = host.querySelector('[data-testid="home-value-levers"]')!;
    expect(frame.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.textContent).not.toContain("Open this Topic");
    expect(host.querySelector("form")).toBeNull();
  });

  it('signed in, with Spine Topic 1 written, says "Open this Topic →", a form that posts spine-01-worth to /api/open (E4)', async () => {
    await draw({ signedOut: false, canOpenTopic: true });
    const form = host.querySelector<HTMLFormElement>('form[action="/api/open"]')!;
    expect(form.getAttribute("method")).toBe("post");
    expect(form.querySelector<HTMLInputElement>('input[type="hidden"][name="topic"]')?.value).toBe(HOME_TOPIC_ID);
    expect(HOME_TOPIC_ID).toBe("spine-01-worth");
    expect(form.querySelector('button[type="submit"]')?.textContent).toBe("Open this Topic →");
    expect(host.textContent).not.toContain("Sign in to see what happened next");
  });

  it("signed in, while Spine Topic 1 has no Topic file, offers no Open this Topic, which would land on another Topic (E4)", async () => {
    await draw({ signedOut: false, canOpenTopic: false });
    expect(host.querySelector("form")).toBeNull();
    expect(host.textContent).not.toContain("Open this Topic");
    expect(host.textContent).not.toContain("Sign in to see what happened next");
    expect(host.querySelector('[data-testid="value-levers"]')).not.toBeNull();
  });

  it("shows a quiet placeholder when the Case cannot be read", async () => {
    await draw({ signedOut: true, caseId: "no-such-case" });
    expect(host.querySelector('[data-testid="home-value-levers"]')?.textContent).toBe(copy.widgetPlaceholder);
    expect(host.querySelector('[data-testid="value-levers"]')).toBeNull();
    expect(host.querySelector("h2")?.textContent).toBe("Now value a company.");
  });
});

// ——— E8: section 2 is a small component of its own ———

const ROOT = process.cwd();
const SRC = join(ROOT, "src");
const STATIC = /^\s*(?:import|export)\s+(type\s+)?(?:[\w$]+\s*,\s*)?(?:\{[^}]*\}|\*(?:\s+as\s+[\w$]+)?|[\w$]+)\s+from\s+["']([^"']+)["']/gm;
const BARE = /^\s*import\s+["']([^"']+)["']/gm;
const DYNAMIC = /\bimport\(\s*["']([^"']+)["']\s*\)/g;

function resolveFile(from: string, spec: string): string | null {
  const base = spec.startsWith("@/") ? join(SRC, spec.slice(2)) : resolve(dirname(from), spec);
  for (const file of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(file) && statSync(file).isFile()) return file;
  }
  return null;
}

/** Every source file and package a file reaches by value imports (type-only imports leave nothing in the browser). */
function importGraph(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    const source = readFileSync(file, "utf8");
    const specs = [
      ...[...source.matchAll(STATIC)].filter((m) => !m[1]).map((m) => m[2]),
      ...[...source.matchAll(BARE)].map((m) => m[1]),
      ...[...source.matchAll(DYNAMIC)].map((m) => m[1]),
    ];
    for (const spec of specs) {
      if (spec.endsWith(".css")) continue;
      if (spec.startsWith(".") || spec.startsWith("@/")) {
        const next = resolveFile(file, spec);
        expect(next, `${relative(ROOT, file)} imports ${spec}`).not.toBeNull();
        queue.push(next!);
      } else packages.add(spec);
    }
  }
  return { files: new Set([...files].map((f) => relative(ROOT, f))), packages };
}

describe("Home's section 2 never reaches the general Widget renderer (E8)", () => {
  const { files, packages } = importGraph(join(SRC, "app/_landing/home-value-levers.tsx"));

  it("draws through WS-B's view and the valuation engine", () => {
    expect(files).toContain("src/widgets/workbench/value-levers-view.tsx");
    expect(files).toContain("src/finance/dcf-engine.ts");
    expect(files).toContain("src/finance/valuation-cases.ts");
  });

  it("imports no OpenUI package, no Widget host, panel or library, and not the ValueLevers part", () => {
    expect([...packages].filter((p) => p.startsWith("@openuidev/"))).toEqual([]);
    const renderer = [
      "src/app/_landing/live-widget.tsx",
      "src/app/widget-panel.tsx",
      "src/app/widget-view.tsx",
      "src/app/widget-host.tsx",
      "src/widgets/library.tsx",
      "src/widgets/workbench/value-levers-part.tsx",
      "src/widgets/workbench/parts.tsx",
    ];
    expect([...files].filter((f) => renderer.includes(f) || f.startsWith("src/widgets/genui"))).toEqual([]);
  });

  it("would see the renderer where it is: section 4's lazy load reaches it", () => {
    const tabs = importGraph(join(SRC, "app/_landing/showcase-tabs.tsx"));
    expect(tabs.files).toContain("src/app/_landing/live-widget.tsx");
    expect([...tabs.packages].some((p) => p.startsWith("@openuidev/"))).toBe(true);
  });
});
