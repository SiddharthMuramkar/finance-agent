// @vitest-environment happy-dom
import { createLibrary, defineComponent, Renderer, type ComponentRenderProps } from "@openuidev/react-lang";
import { readdirSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod/v4";
import { WAVE1_PARTS } from "./index";
import { byId, click, draw, key, setRange, type Page } from "./test-kit";

// WAVE1_PARTS in a library of their own (library-v2 registers them in the real one): parsed from openui-lang, with
// a $variable bound to each. Proves the zod key order is the positional order and the bindings work.

const Frame = defineComponent({
  name: "Frame",
  description: "Holds parts in a column.",
  props: z.object({ children: z.array(z.union(WAVE1_PARTS.map((part) => part.ref))) }),
  component: ({ props, renderNode }: ComponentRenderProps<{ children: unknown }>) => <div>{renderNode(props.children)}</div>,
});
const library = createLibrary({ root: "Frame", components: [Frame, ...WAVE1_PARTS] });

let page: Page | null = null;
afterEach(() => {
  page?.cleanup();
  page = null;
});
const show = (code: string) => (page = draw(<Renderer response={code} library={library} isStreaming={false} />));

describe("WAVE1_PARTS", () => {
  it("are the nine parts, each with a one-line description", () => {
    expect(WAVE1_PARTS.map((p) => p.name)).toEqual(["Stat", "Verdict", "QuickCheck", "Predict", "Versus", "Breakeven", "MoneyStack", "Waffle", "Pictogram"]);
    for (const part of WAVE1_PARTS) expect(part.description.split("\n")).toHaveLength(1);
  });

  it("each have a fixture program beside them", () => {
    const dir = `${process.cwd()}/src/widgets/fixtures/parts/`;
    const files = readdirSync(dir).filter((f) => f.endsWith(".openui"));
    expect(files).toHaveLength(WAVE1_PARTS.length);
    for (const part of WAVE1_PARTS) {
      const file = files.find((f) => readFileSync(dir + f, "utf8").includes(`${part.name}(`) && f.replace(/-/g, "").replace(".openui", "") === part.name.toLowerCase());
      expect(file, part.name).toBeDefined();
    }
  });

  it("read their arguments in the documented order", () => {
    show(
      [
        "root = Frame([stat, verdict, versus, pile, waffle, gold])",
        'stat = Stat("Gain", 530000, "inr", "After 20 years", "you")',
        'verdict = Verdict(1 < 2, "Annuity wins.", "Cash wins.")',
        'versus = Versus("Annuity", 930, "Cash", 877, "usd", "higher")',
        'pile = MoneyStack("sip", {monthly: 1000, ratePercent: 10, years: 20}, "inr", "Your SIP")',
        'waffle = Waffle("Rate", 3.25, 3, true)',
        'gold = Pictogram("gold-bar", 25, "What ₹1 lakh buys", "1 bar = 1 g", 30, "src")',
      ].join("\n"),
    );
    expect(byId(page!, "stat")!.getAttribute("aria-label")).toBe("Gain: ₹5.3 lakh");
    expect(byId(page!, "stat")!.getAttribute("data-tone")).toBe("you");
    expect(byId(page!, "verdict-text")!.textContent).toBe("Annuity wins.");
    expect(byId(page!, "versus")!.getAttribute("data-winner")).toBe("left");
    expect(byId(page!, "money-stack-caption")!.textContent).toContain("Total invested ₹2.4 lakh");
    expect(byId(page!, "waffle-caption")!.textContent).toContain("+25 basis points");
    expect(byId(page!, "pictogram")!.getAttribute("aria-label")).toBe("What ₹1 lakh buys: 25 gold bars");
  });

  it("let a QuickCheck write the picked index into its $variable, which a Stat then reads", () => {
    show(
      [
        "root = Frame([q, score])",
        "$q = -1",
        'q = QuickCheck("Which is worth more today?", ["5 years", "10 years"], 0, "Sooner is worth more.", $q)',
        'score = Stat("Your score", $q == 0 ? 1 : 0, "of 1")',
      ].join("\n"),
    );
    expect(byId(page!, "stat-value")!.textContent).toBe("0 of 1");
    click(byId(page!, "quick-check-option-0"));
    expect(byId(page!, "quick-check-option-0")!.getAttribute("data-state")).toBe("right");
    expect(byId(page!, "stat-value")!.textContent).toBe("1 of 1");
    key(page!.host.querySelector('[role="radiogroup"]'), "2"); // locked: ignored
    expect(byId(page!, "stat-value")!.textContent).toBe("1 of 1");
    click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Try again")!);
    expect(byId(page!, "stat-value")!.textContent).toBe("0 of 1");
  });

  it("let a QuickCheck work with no $variable at all", () => {
    show('root = Frame([q])\nq = QuickCheck("Pick", ["a", "b"], 1, "Because.")');
    click(byId(page!, "quick-check-option-0"));
    expect(byId(page!, "quick-check-option-0")!.getAttribute("data-state")).toBe("wrong");
    expect(byId(page!, "quick-check-option-1")!.getAttribute("data-state")).toBe("right");
  });

  it("let a Breakeven read the control $variable and find the flip", () => {
    show(
      [
        "root = Frame([find])",
        "$rate = 3.5",
        'find = Breakeven("Find the rate", [{x: 0, value: 1000}, {x: 2, value: 800}, {x: 4, value: 600}, {x: 6, value: 400}], 700, $rate, 0.05, 3.37, "30-year yield", "%")',
      ].join("\n"),
    );
    expect(byId(page!, "breakeven")!.getAttribute("data-found")).toBe("false"); // the crossing is at 3, not 3.5
    expect(byId(page!, "breakeven-meter")!.getAttribute("aria-valuetext")).toBe("Warmer");
  });

  it("let a Predict keep the guess in its $variable and reveal the actual figure from a calculator", () => {
    show(
      [
        "root = Frame([guess, echo])",
        "$guess = 10",
        'growth = Query("calculate", {calculator: "cagr", inputs: {start: 100, end: 4285, years: 13}}, {rows: []})',
        'guess = Predict("Your gut guess", $guess, 0, 60, 1, "percent", 33.5, "What it actually was")',
        'echo = Stat("You said", $guess, "percent")',
      ].join("\n"),
    );
    expect(byId(page!, "stat-value")!.textContent).toBe("10%");
    setRange(page!.host.querySelector<HTMLInputElement>('input[type="range"]')!, 25);
    expect(byId(page!, "stat-value")!.textContent).toBe("25%");
    expect(byId(page!, "predict-guess")!.textContent).toBe("25%");
  });
});
