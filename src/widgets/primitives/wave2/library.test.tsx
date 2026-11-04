// @vitest-environment happy-dom
import { createLibrary, defineComponent, Renderer, type ComponentRenderProps } from "@openuidev/react-lang";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod/v4";
import type { CaseData } from "@/case-data/case-data";
import { CaseDataProvider } from "../../case-data-provider";
import { byId, click, draw, key, setRange, settle, stubReducedMotion, type Page } from "../wave1/test-kit";
import { Step, WAVE2_PARTS } from "./index";

// WAVE2_PARTS in a library of their own (library-v2 registers them in the real one): parsed from openui-lang,
// with the fixture programs. Proves the zod key order is the positional order and the bindings work.

const Frame = defineComponent({
  name: "Frame",
  description: "Holds parts in a column.",
  props: z.object({ children: z.array(z.union(WAVE2_PARTS.map((part) => part.ref))) }),
  component: ({ props, renderNode }: ComponentRenderProps<{ children: unknown }>) => <div>{renderNode(props.children)}</div>,
});
const library = createLibrary({ root: "Frame", components: [Frame, Step, ...WAVE2_PARTS] });

const history = ["2000", "2001", "2002", "2003", "2004", "2005"].map((y, i) => ({ date: `${y}-01-01`, value: 100 + i * 10 }));
const caseData: CaseData = {
  caseId: "c1",
  asOf: "2005-01-01",
  revealed: false,
  datasets: [{ id: "close", label: "Index close", unit: "points", source: "Exchange", sourceUrl: "https://example.org", checkedOn: "2026-11-01", points: history }],
};

let page: Page | null = null;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame"] });
  stubReducedMotion(false);
});
afterEach(() => {
  page?.cleanup();
  page = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const show = (code: string) =>
  (page = draw(
    <CaseDataProvider cases={[caseData]}>
      <Renderer response={code} library={library} isStreaming={false} />
    </CaseDataProvider>,
  ));
const fixture = (name: string) => readFileSync(`${process.cwd()}/src/widgets/fixtures/parts/${name}.openui`, "utf8");

describe("WAVE2_PARTS", () => {
  it("are the seven parts, each with a one-line description", () => {
    expect(WAVE2_PARTS.map((p) => p.name)).toEqual(["DrawTheLine", "PriceTag", "ShrinkingNote", "TimeTravel", "StepThrough", "Rank", "Waterfall"]);
    for (const part of [...WAVE2_PARTS, Step]) expect(part.description.split("\n")).toHaveLength(1);
  });

  it("each have a fixture program beside them", () => {
    for (const [file, part] of [
      ["draw-the-line", "DrawTheLine"],
      ["price-tag", "PriceTag"],
      ["shrinking-note", "ShrinkingNote"],
      ["time-travel", "TimeTravel"],
      ["step-through", "StepThrough"],
      ["rank", "Rank"],
      ["waterfall", "Waterfall"],
    ]) {
      expect(fixture(file), part).toContain(`${part}(`);
    }
  });

  it("read their arguments in the documented order", () => {
    show(
      [
        "root = Frame([tag, note, travel, bridge])",
        'tag = PriceTag("Vada pav", 20, 6, 10, "inr")',
        'note = ShrinkingNote(100, 6, 10, "inr")',
        'travel = TimeTravel(100, 8, 30, 1, 0, "inr")',
        'bridge = Waterfall(["Revenue", "Costs"], [1000, -400], "inr", "Profit")',
      ].join("\n"),
    );
    expect(byId(page!, "price-tag-later-value")!.textContent).toBe("₹35.82");
    expect(byId(page!, "shrinking-note-worth")!.textContent).toBe("₹55.84");
    expect(byId(page!, "time-travel")!.getAttribute("data-mode")).toBe("coin");
    expect(byId(page!, "waterfall")!.getAttribute("aria-label")).toContain("Profit ₹600");
  });

  it("let a PriceTag follow $variables bound to the years", () => {
    show(['root = Frame([tag])', "$years = 10", 'tag = PriceTag("Vada pav", 20, 6, $years, "inr")'].join("\n"));
    expect(byId(page!, "price-tag-later-value")!.textContent).toBe("₹35.82");
  });

  it("let a StepThrough read its Steps, in order, with the asked number", () => {
    show(fixture("step-through").replace('root = Widget("Illustration: one deposit, step by step", [steps])', "root = Frame([steps])"));
    expect(byId(page!, "step-count")!.textContent).toBe("Step 1 of 3");
    click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Next")!);
    click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Next")!);
    expect(byId(page!, "step-ask")).not.toBeNull();
  });

  it("let a Rank run from a fixture program", () => {
    show(fixture("rank").replace(/^root = .*$/m, "root = Frame([order])"));
    const rows = [...page!.host.querySelectorAll('[data-testid="rank-item"]')];
    expect(rows).toHaveLength(4);
    key(rows[0], " ");
    expect(rows[0].getAttribute("data-lifted")).toBe("true");
  });

  it("let a DrawTheLine load its Case Data, take a drawing into its $variable and keep it", async () => {
    show(
      [
        "root = Frame([line])",
        "$drawn = []",
        'line = DrawTheLine("c1/close", "", "Draw it", $drawn)',
      ].join("\n"),
    );
    await settle(0);
    const slices = () => [...page!.host.querySelectorAll<HTMLElement>('[data-testid="draw-slice"]')];
    expect(slices()).toHaveLength(8);
    key(slices()[0], "ArrowUp");
    expect(slices()[0].getAttribute("data-drawn")).toBe("true");
    expect(slices()[1].getAttribute("data-drawn")).toBe("false");
    expect(byId(page!, "draw-actual")).toBeNull();
  });

  it("let a DrawTheLine say so for a dataset that is not there", async () => {
    show(['root = Frame([line])', 'line = DrawTheLine("c1/missing")'].join("\n"));
    await settle(0);
    expect(page!.host.textContent).toContain("No data for c1/missing");
  });

  it("let a TimeTravel slider run inside a program", () => {
    show('root = Frame([travel])\ntravel = TimeTravel(100, 8, 30, 1, 0, "inr")');
    setRange(page!.host.querySelector<HTMLInputElement>('input[type="range"]')!, 10);
    expect(byId(page!, "time-travel-caption")!.textContent).toContain("paid in 10 years");
  });
});
