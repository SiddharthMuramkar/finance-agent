// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { BreakevenView, findBreakeven, proximity } from "./breakeven";
import { formatAmount } from "./format";
import { enterDelay, ENTER_MS, MAX_STAGGER_MS } from "./icon-grid";
import { ICON_NAMES, isKnownObject } from "./icons";
import { MoneyStackView, noteValueFor } from "./money-stack";
import { groupFor, MAX_ICONS, PictogramView } from "./pictogram";
import { gapSentence, PredictView } from "./predict";
import { QuickCheckView, quickCheckProblem } from "./quick-check";
import { StatView } from "./stat";
import { allById, byId, click, draw, key, redraw, setRange, settle, stubReducedMotion, type Page } from "./test-kit";
import { VerdictView, VERDICT_DEBOUNCE_MS } from "./verdict";
import { VersusView, winnerOf } from "./versus";
import { WaffleView, waffleCaption } from "./waffle";

let page: Page | null = null;
const show = (element: Parameters<typeof draw>[0]) => (page = draw(element));

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

describe("number formatting", () => {
  it("writes rupees with lakh and crore, dollars short, and the other units plainly", () => {
    expect(formatAmount(240_000, "inr")).toBe("₹2.4 lakh");
    expect(formatAmount(2_50_00_000, "inr")).toBe("₹2.5 crore");
    expect(formatAmount(12_345, "inr")).toBe("₹12,345");
    expect(formatAmount(877_800_000, "usd")).toBe("$877.8 million");
    expect(formatAmount(33.5, "percent")).toBe("33.5%");
    expect(formatAmount(0.25, "pp")).toBe("0.25 pp");
    expect(formatAmount(25, "bp")).toBe("25 bp");
    expect(formatAmount(1, "years")).toBe("1 year");
    expect(formatAmount(30, "years")).toBe("30 years");
    expect(formatAmount(2.5, "grams")).toBe("2.5 g");
    expect(formatAmount(3, "x")).toBe("3×");
    expect(formatAmount(2, "of 3")).toBe("2 of 3");
  });
});

describe("Stat", () => {
  it("is a labelled group whose name carries the formatted value", () => {
    show(<StatView label="Maturity value" value={540_000} unit="inr" note="After 20 years" tone="you" />);
    const stat = byId(page!, "stat")!;
    expect(stat.getAttribute("role")).toBe("group");
    expect(stat.getAttribute("aria-label")).toBe("Maturity value: ₹5.4 lakh");
    expect(byId(page!, "stat-value")!.textContent).toBe("₹5.4 lakh");
    expect(stat.textContent).toContain("After 20 years");
    expect(stat.getAttribute("data-tone")).toBe("you");
    expect(stat.style.borderColor).toBe("var(--you-line)");
  });

  // Issue #457 (WCAG 2.2 SC 1.4.11): the tone's rule is the mint or sunflower fill, under 3:1 in Light, so the rule may not
  // be the only thing that says where the number came from. A static Tag says it in words; a neutral Stat has none.
  it("says its tone in words with a Tag, not by the coloured rule alone", () => {
    for (const [tone, words] of [["you", "Your assumption"], ["src", "Sourced"]] as const) {
      show(<StatView label="Rate" value={7} unit="percent" tone={tone} />);
      const tag = byId(page!, "stat")!.querySelector('[data-affordance="tag"]');
      expect(tag?.textContent, tone).toBe(words);
      page!.cleanup();
    }
    show(<StatView label="Rate" value={7} unit="percent" />);
    expect(byId(page!, "stat")!.querySelector('[data-affordance="tag"]')).toBeNull();
  });

  it("crossfades a changed value (dims for a frame) and does not under reduced motion", async () => {
    show(<StatView label="Rate" value={3} unit="percent" />);
    redraw(page!, <StatView label="Rate" value={4} unit="percent" />);
    expect(byId(page!, "stat-value")!.style.opacity).toBe("0.35");
    await settle(32);
    expect(byId(page!, "stat-value")!.style.opacity).toBe("1");

    page!.cleanup();
    stubReducedMotion(true);
    show(<StatView label="Rate" value={3} unit="percent" />);
    redraw(page!, <StatView label="Rate" value={4} unit="percent" />);
    expect(byId(page!, "stat")!.getAttribute("data-motion")).toBe("reduced");
    expect(byId(page!, "stat-value")!.style.opacity).toBe("1");
  });
});

describe("Verdict", () => {
  it("shows the sentence for the test, and rewrites it when the test flips", () => {
    show(<VerdictView test={true} ifTrue="Annuity wins." ifFalse="Cash wins." />);
    expect(byId(page!, "verdict-text")!.textContent).toBe("Annuity wins.");
    redraw(page!, <VerdictView test={false} ifTrue="Annuity wins." ifFalse="Cash wins." />);
    expect(byId(page!, "verdict-text")!.textContent).toBe("Cash wins.");
  });

  it("has one polite live region that waits 400 ms before announcing a change", async () => {
    show(<VerdictView test={true} ifTrue="Annuity wins." ifFalse="Cash wins." />);
    expect(page!.host.querySelectorAll("[aria-live]")).toHaveLength(1);
    expect(byId(page!, "verdict-live")!.getAttribute("aria-live")).toBe("polite");
    redraw(page!, <VerdictView test={false} ifTrue="Annuity wins." ifFalse="Cash wins." />);
    await settle(VERDICT_DEBOUNCE_MS - 50);
    expect(byId(page!, "verdict-live")!.textContent).toBe("Annuity wins.");
    await settle(100);
    expect(byId(page!, "verdict-live")!.textContent).toBe("Cash wins.");
  });

  it("does not slide the sentence under reduced motion", () => {
    stubReducedMotion(true);
    show(<VerdictView test={true} ifTrue="A" ifFalse="B" />);
    redraw(page!, <VerdictView test={false} ifTrue="A" ifFalse="B" />);
    expect(byId(page!, "verdict-text")!.style.transform).toBe("none");
    expect(byId(page!, "verdict")!.getAttribute("data-motion")).toBe("reduced");
  });
});

describe("QuickCheck", () => {
  const options = ["₹1,000 in 5 years", "₹1,000 in 10 years", "The same"];
  const view = (picked: number, onPick = vi.fn()) => (
    <QuickCheckView question="Which is worth more today?" options={options} answer={0} why="Sooner money is discounted less." picked={picked} onPick={onPick} />
  );

  it("is a radio group of rows at least 44 px tall (min-h-11)", () => {
    show(view(-1));
    expect(page!.host.querySelector('[role="radiogroup"]')).not.toBeNull();
    const rows = [0, 1, 2].map((i) => byId(page!, `quick-check-option-${i}`)!);
    expect(rows.every((r) => r.getAttribute("role") === "radio")).toBe(true);
    expect(rows.every((r) => r.className.includes("min-h-11"))).toBe(true);
  });

  it("locks on a pick: the right row gets a check and a teal border, a wrong pick a cross and the danger colour", () => {
    show(view(1));
    const right = byId(page!, "quick-check-option-0")!;
    const wrong = byId(page!, "quick-check-option-1")!;
    expect(right.getAttribute("data-state")).toBe("right");
    expect(right.style.borderColor).toBe("var(--you-line)");
    expect(right.querySelector('[data-icon="right"]')).not.toBeNull();
    expect(wrong.getAttribute("data-state")).toBe("wrong");
    expect(wrong.style.borderColor).toBe("var(--danger)");
    expect(wrong.querySelector('[data-icon="wrong"]')).not.toBeNull();
    expect(byId(page!, "quick-check-feedback")!.textContent).toContain("Not quite. Sooner money is discounted less.");
  });

  it("says Right. for the right pick and Try again resets the pick", () => {
    const onPick = vi.fn();
    show(view(0, onPick));
    expect(byId(page!, "quick-check-feedback")!.textContent).toContain("Right. Sooner money");
    click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Try again")!);
    expect(onPick).toHaveBeenCalledWith(-1);
  });

  it("takes a tap, and keys 1 to 3 pick; arrow keys move the focus; a locked check ignores more picks", () => {
    const onPick = vi.fn();
    show(view(-1, onPick));
    click(byId(page!, "quick-check-option-2"));
    expect(onPick).toHaveBeenLastCalledWith(2);
    const group = page!.host.querySelector('[role="radiogroup"]')!;
    key(group, "2");
    expect(onPick).toHaveBeenLastCalledWith(1);
    key(group, "4"); // there is no fourth option
    expect(onPick).toHaveBeenCalledTimes(2);
    key(group, "ArrowDown");
    // Key 2 moved to the second row, so down lands on the third.
    expect(document.activeElement).toBe(byId(page!, "quick-check-option-2"));
    page!.cleanup();

    const locked = vi.fn();
    show(view(0, locked));
    click(byId(page!, "quick-check-option-1"));
    key(page!.host.querySelector('[role="radiogroup"]'), "2");
    expect(locked).not.toHaveBeenCalled();
  });

  it("treats answer -1 as a poll: no right or wrong, the pick is neutral context", () => {
    show(<QuickCheckView question="Which would you take?" options={["Annuity", "Cash"]} answer={-1} why="Both are defensible." picked={1} onPick={() => {}} />);
    expect(allById(page!, "quick-check-option-0")[0].getAttribute("data-state")).toBe("idle");
    expect(byId(page!, "quick-check-option-1")!.getAttribute("data-state")).toBe("picked");
    expect(byId(page!, "quick-check-feedback")!.textContent).toContain("Both are defensible.");
  });

  it("validates its answer index and option count", () => {
    expect(quickCheckProblem(["a", "b"], 1)).toBeNull();
    expect(quickCheckProblem(["a", "b"], -1)).toBeNull();
    expect(quickCheckProblem(["a", "b"], 2)).toMatch(/outside -1 to 1/);
    expect(quickCheckProblem(["a", "b"], -2)).toMatch(/outside/);
    expect(quickCheckProblem(["a"], 0)).toMatch(/2 to 4 options/);
    expect(quickCheckProblem(["a", "b", "c", "d", "e"], 0)).toMatch(/2 to 4 options/);
    show(<QuickCheckView question="?" options={["a", "b"]} answer={5} why="" picked={-1} onPick={() => {}} />);
    expect(page!.host.querySelector('[role="alert"]')!.textContent).toMatch(/outside/);
  });
});

describe("Predict", () => {
  const base = { prompt: "Guess the yearly growth", min: 0, max: 60, step: 1, unit: "percent", actualLabel: "What it actually was" };

  it("locks the guess with a button and the slider stops moving", () => {
    const onGuess = vi.fn();
    show(<PredictView {...base} guess={12} onGuess={onGuess} actual={33.5} />);
    const range = page!.host.querySelector<HTMLInputElement>('input[type="range"]')!;
    setRange(range, 20);
    expect(onGuess).toHaveBeenCalledWith(20);
    expect(byId(page!, "predict")!.getAttribute("data-locked")).toBe("false");
    click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Lock in my guess")!);
    expect(byId(page!, "predict")!.getAttribute("data-locked")).toBe("true");
    expect(range.disabled).toBe(true);
  });

  it("reveals the actual marker travelling along the track, with the gap sentence, and none of it before the lock", async () => {
    show(<PredictView {...base} guess={12} onGuess={() => {}} actual={33.5} />);
    expect(byId(page!, "predict-actual-marker")).toBeNull();
    expect(byId(page!, "predict-result")).toBeNull();
    click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Lock in my guess")!);
    const marker = byId(page!, "predict-actual-marker")!;
    expect(marker.style.left).toBe("20%");
    await settle(32);
    expect(byId(page!, "predict-actual-marker")!.style.left).toBe(`${(33.5 / 60) * 100}%`);
    expect(byId(page!, "predict-result")!.textContent).toContain("You guessed 12%. It was 33.5%. That is 21.5 percentage points higher than your guess.");
  });

  it("jumps straight to the actual marker under reduced motion", () => {
    stubReducedMotion(true);
    show(<PredictView {...base} guess={12} onGuess={() => {}} actual={33.5} />);
    click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Lock in my guess")!);
    expect(byId(page!, "predict-actual-marker")!.style.left).toBe(`${(33.5 / 60) * 100}%`);
    expect(byId(page!, "predict-actual-marker")!.style.transition).toBe("");
  });

  it("shows a lock instead of the actual figure while the data is withheld", () => {
    show(<PredictView {...base} guess={12} onGuess={() => {}} actual={undefined} revealsAt="31 March 1992" />);
    click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Lock in my guess")!);
    expect(byId(page!, "predict-withheld")!.textContent).toContain("Revealed when the story reaches 31 March 1992");
    expect(byId(page!, "predict-actual-marker")).toBeNull();
  });

  it("writes the gap in code", () => {
    expect(gapSentence(40, 33.5, "percent")).toBe("You guessed 40%. It was 33.5%. That is 6.5 percentage points lower than your guess.");
    expect(gapSentence(5, 5, "years")).toContain("Spot on.");
  });
});

describe("Versus", () => {
  it("names the winner by `better` and gives a text alternative", () => {
    expect(winnerOf(930, 877.8)).toBe("left");
    expect(winnerOf(930, 877.8, "lower")).toBe("right");
    expect(winnerOf(5, 5)).toBe("tie");
    show(<VersusView leftLabel="Annuity" leftValue={930_000_000} rightLabel="Cash" rightValue={877_800_000} unit="usd" />);
    const figure = byId(page!, "versus")!;
    expect(figure.getAttribute("role")).toBe("img");
    expect(figure.getAttribute("aria-label")).toBe("Annuity $930.0 million vs Cash $877.8 million. Annuity higher by $52.2 million.");
    expect(figure.getAttribute("data-winner")).toBe("left");
    expect(byId(page!, "versus-chip")!.textContent).toBe("+$52.2 million · 5.9%");
  });

  it("flips the winner and moves the chip when the numbers cross", () => {
    show(<VersusView leftLabel="Annuity" leftValue={900} rightLabel="Cash" rightValue={800} unit="" />);
    expect(byId(page!, "versus-left")!.getAttribute("data-winner")).toBe("true");
    redraw(page!, <VersusView leftLabel="Annuity" leftValue={700} rightLabel="Cash" rightValue={800} unit="" />);
    expect(byId(page!, "versus-right")!.getAttribute("data-winner")).toBe("true");
    expect(byId(page!, "versus-chip")!.style.marginLeft).toBe("auto");
  });

  it("keeps the scale sticky: a bar does not stretch when the bigger number shrinks", () => {
    show(<VersusView leftLabel="A" leftValue={1000} rightLabel="B" rightValue={500} unit="" />);
    expect(byId(page!, "versus-right-bar")!.style.width).toBe("50%");
    redraw(page!, <VersusView leftLabel="A" leftValue={600} rightLabel="B" rightValue={500} unit="" />);
    expect(byId(page!, "versus-right-bar")!.style.width).toBe("50%");
    expect(byId(page!, "versus-left-bar")!.style.width).toBe("60%");
  });
});

describe("Breakeven", () => {
  const rows = Array.from({ length: 11 }, (_, i) => ({ x: i, value: 1000 - i * 100 })); // crosses 650 at x = 3.5
  const view = (control: number, extra: Partial<Parameters<typeof BreakevenView>[0]> = {}) => (
    <BreakevenView label="Find the rate where the winner flips" rows={rows} target={650} control={control} tolerance={0.05} unit="%" {...extra} />
  );

  it("finds the crossing by linear interpolation, and none when the rows never reach the target", () => {
    expect(findBreakeven(rows, 650)).toBeCloseTo(3.5, 6);
    expect(findBreakeven(rows, 5000)).toBeNull();
    expect(findBreakeven([{ x: 0, value: 10 }, { x: 4, value: 30 }], 20)).toBeCloseTo(2, 6);
    expect(findBreakeven(rows, 1000)).toBe(0);
  });

  it("measures how close the control is", () => {
    expect(proximity(3.5, 3.5, 10, 0.05)).toBe(3);
    expect(proximity(3.0, 3.5, 10, 0.05)).toBe(2);
    expect(proximity(2, 3.5, 10, 0.05)).toBe(1);
    expect(proximity(9, 3.5, 10, 0.05)).toBe(0);
  });

  it("shows Far, Warmer and Close without ever showing the number, then Found it with the notch and the figure", () => {
    show(view(9));
    const meter = () => byId(page!, "breakeven-meter")!;
    expect(meter().getAttribute("aria-valuetext")).toBe("Far");
    expect(page!.host.textContent).not.toContain("3.5");
    redraw(page!, view(2));
    expect(meter().getAttribute("aria-valuetext")).toBe("Warmer");
    redraw(page!, view(3.2));
    expect(meter().getAttribute("aria-valuetext")).toBe("Close");
    expect(byId(page!, "breakeven-notch")).toBeNull();
    expect(page!.host.textContent).not.toContain("3.5");
    redraw(page!, view(3.52));
    expect(meter().getAttribute("aria-valuetext")).toBe("Found it");
    expect(byId(page!, "breakeven-notch")).not.toBeNull();
    expect(byId(page!, "breakeven-found")!.textContent).toContain("Break-even ≈ 3.5%");
  });

  it("remembers that it was found when the slider moves away", () => {
    show(view(3.5));
    redraw(page!, view(8));
    expect(byId(page!, "breakeven")!.getAttribute("data-found")).toBe("true");
    expect(byId(page!, "breakeven-notch")).not.toBeNull();
  });

  it("puts a sourced amber tick on the track once found, labelled", () => {
    show(view(3.5, { marker: 3.37, markerLabel: "30-year US bond yield that week" }));
    expect(byId(page!, "breakeven-marker")).not.toBeNull();
    expect(byId(page!, "breakeven-marker-label")!.textContent).toContain("30-year US bond yield that week: 3.37%");
  });

  it("says so when there is no break-even in the range", () => {
    show(view(3, { target: 5000 }));
    expect(byId(page!, "breakeven-none")!.textContent).toBe("No break-even between 0% and 10%.");
  });
});

describe("MoneyStack", () => {
  const parts = [
    { label: "Total invested", value: 240_000, tone: "neutral" as const },
    { label: "Gain", value: 530_000, tone: "you" as const },
  ];

  it("picks a round note value so the total is 10 to 60 notes", () => {
    expect(noteValueFor(770_000)).toBe(20_000);
    for (const total of [1500, 240_000, 7_700_000, 9e9]) {
      const n = total / noteValueFor(total);
      expect(n).toBeLessThanOrEqual(60);
      expect(n).toBeGreaterThan(5);
    }
  });

  it("draws one note per unit, coloured by part, with a caption built by code", () => {
    show(<MoneyStackView parts={parts} currency="inr" title="What your SIP becomes" />);
    const notes = allById(page!, "icon-cell");
    expect(notes).toHaveLength(12 + 27); // 240k and 530k at 20,000 a note, 530k/20k = 26.5 -> 27
    expect(notes.filter((n) => n.getAttribute("data-tone") === "neutral")).toHaveLength(12);
    expect(notes.filter((n) => n.getAttribute("data-tone") === "you")).toHaveLength(27);
    expect(byId(page!, "money-stack-caption")!.textContent).toBe("Each ▮ = ₹20,000 · Total invested ₹2.4 lakh (12 ▮) · Gain ₹5.3 lakh (27 ▮)");
  });

  it("holds the note value while the total grows, so more years means more notes", () => {
    show(<MoneyStackView parts={parts} currency="inr" />);
    expect(byId(page!, "money-stack")!.getAttribute("data-note-value")).toBe("20000");
    redraw(page!, <MoneyStackView parts={[parts[0], { ...parts[1], value: 1_200_000 }]} currency="inr" />);
    expect(byId(page!, "money-stack")!.getAttribute("data-note-value")).toBe("20000");
    expect(allById(page!, "icon-cell").length).toBeGreaterThan(39);
  });

  it("enters in a stagger that fits 300 ms and not at all under reduced motion", () => {
    expect(ENTER_MS + MAX_STAGGER_MS).toBeLessThanOrEqual(300);
    expect(enterDelay(0, 50)).toBe(0);
    expect(enterDelay(49, 50)).toBe(MAX_STAGGER_MS);
    stubReducedMotion(true);
    show(<MoneyStackView parts={parts} currency="inr" />);
    expect(byId(page!, "money-stack")!.getAttribute("data-motion")).toBe("reduced");
    expect(allById(page!, "icon-cell")[0].style.opacity).toBe("1");
  });
});

describe("Waffle", () => {
  it("writes the caption in code: percent, points, basis points and relative change", () => {
    expect(waffleCaption(3.25, 3)).toBe("3% → 3.25%: +0.25 percentage points = +25 basis points = +8.3% relative.");
    expect(waffleCaption(2.75, 3)).toBe("3% → 2.75%: −0.25 percentage points = −25 basis points = −8.3% relative.");
    expect(waffleCaption(12)).toBe("12% of the whole = 1200 basis points.");
  });

  it("fills percent squares, the last partly, and picks out the change from compareTo", () => {
    show(<WaffleView label="Fed funds" percent={3.25} compareTo={3} />);
    const squares = allById(page!, "waffle-square");
    expect(squares).toHaveLength(100);
    expect(squares.filter((s) => s.getAttribute("data-look") === "filled")).toHaveLength(3);
    const change = squares.filter((s) => s.getAttribute("data-look") === "change");
    expect(change).toHaveLength(1);
    expect(change[0].getAttribute("data-part")).toBe("0.25");
    expect(byId(page!, "waffle")!.getAttribute("aria-label")).toContain("+25 basis points");
  });

  it("draws a fall as dashed outlines", () => {
    show(<WaffleView label="Fed funds" percent={2} compareTo={4} />);
    expect(allById(page!, "waffle-square").filter((s) => s.getAttribute("data-look") === "outline")).toHaveLength(2);
  });

  it("zooms into one square (100 basis points) on a button", () => {
    show(<WaffleView label="Fed funds" percent={3.25} compareTo={3} zoom />);
    expect(byId(page!, "waffle-zoom")).toBeNull();
    const zoom = [...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Zoom into one square")!;
    expect(zoom.getAttribute("aria-expanded")).toBe("false");
    click(zoom);
    expect(allById(page!, "waffle-zoom-square")).toHaveLength(100);
    expect(allById(page!, "waffle-zoom-square").filter((s) => s.getAttribute("data-look") === "change")).toHaveLength(25);
    expect(byId(page!, "waffle-zoom")!.textContent).toContain("100 basis points");
  });

  it("has no zoom button unless asked", () => {
    show(<WaffleView label="x" percent={10} />);
    expect(page!.host.querySelector("button")).toBeNull();
  });
});

describe("Pictogram", () => {
  it("has about sixteen objects, each drawn on the 24 x 24 grid, and falls back to a coin for an unknown name", () => {
    expect(ICON_NAMES).toHaveLength(16);
    for (const name of ["gold-bar", "coin", "note-inr", "note-usd", "piggy-bank", "house", "car", "phone", "vada-pav", "chai", "basket", "bank", "govt", "share", "umbrella", "ice-cream"]) {
      expect(isKnownObject(name), name).toBe(true);
    }
    expect(isKnownObject("spaceship")).toBe(false);
    show(<PictogramView object="spaceship" count={2} label="Things" />);
    expect(allById(page!, "icon-cell")).toHaveLength(2);
    expect(page!.host.querySelector("svg")!.getAttribute("data-icon")).toBe("coin");
    expect(page!.host.querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 24 24");
  });

  it("draws count icons, the last partly filled for a fraction, with a name that says how many", () => {
    show(<PictogramView object="gold-bar" count={25.5} label="What ₹1 lakh buys" perIcon="1 bar = 1 g" />);
    const cells = allById(page!, "icon-cell");
    expect(cells).toHaveLength(26);
    expect(cells[25].getAttribute("data-state")).toBe("partial");
    const figure = byId(page!, "pictogram")!;
    expect(figure.getAttribute("role")).toBe("img");
    expect(figure.getAttribute("aria-label")).toBe("What ₹1 lakh buys: 25.5 gold bars");
    expect(byId(page!, "pictogram-caption")!.textContent).toBe("1 bar = 1 g · 25.5 gold bars");
  });

  it("shows the earlier count as faint outlines when there is less now", () => {
    show(<PictogramView object="gold-bar" count={20} compareTo={25} label="Gold" />);
    const cells = allById(page!, "icon-cell");
    expect(cells).toHaveLength(25);
    expect(cells.filter((c) => c.getAttribute("data-state") === "ghost")).toHaveLength(5);
  });

  it("groups into 5s or 10s above 40 icons, and keeps the grouping while the count falls", () => {
    expect(MAX_ICONS).toBe(40);
    expect(groupFor(40)).toBe(1);
    expect(groupFor(120)).toBe(5);
    expect(groupFor(300)).toBe(10);
    show(<PictogramView object="coin" count={120} label="Coins" />);
    expect(allById(page!, "icon-cell")).toHaveLength(24);
    expect(byId(page!, "pictogram-caption")!.textContent).toContain("each icon stands for 5");
    redraw(page!, <PictogramView object="coin" count={30} label="Coins" />);
    expect(allById(page!, "icon-cell")).toHaveLength(6);
  });

  it("uses the gold colour for gold and the tone tokens for everything else", () => {
    show(<PictogramView object="gold-bar" count={1} label="Gold" />);
    expect(page!.host.innerHTML).toContain("#c9a227");
    page!.cleanup();
    show(<PictogramView object="house" count={1} label="House" tone="src" />);
    expect(page!.host.innerHTML).toContain("var(--src-tag)");
    expect(page!.host.innerHTML).not.toContain("#c9a227");
  });

  it("does not animate entry under reduced motion", () => {
    stubReducedMotion(true);
    show(<PictogramView object="coin" count={3} label="Coins" />);
    expect(byId(page!, "pictogram")!.getAttribute("data-motion")).toBe("reduced");
    expect(allById(page!, "icon-cell").every((c) => c.style.opacity === "1" && c.style.transition === "")).toBe(true);
  });

  it("enters with a fade from 0.8 scale that completes once the frame runs", async () => {
    show(<PictogramView object="coin" count={3} label="Coins" />);
    expect(allById(page!, "icon-cell")[0].style.transform).toBe("scale(0.8)");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(32);
    });
    expect(allById(page!, "icon-cell")[0].style.opacity).toBe("1");
  });
});

describe("Versus with a negative value", () => {
  it("draws a bar for the negative value and shows no percentage when the signs differ", () => {
    show(<VersusView leftLabel="A" leftValue={-5} rightLabel="B" rightValue={10} unit="inr" />);
    expect(byId(page!, "versus-chip")!.textContent).toContain("₹15");
    expect(byId(page!, "versus-chip")!.textContent).not.toContain("%");
    expect(parseFloat(byId(page!, "versus-left-bar")!.style.width)).toBeGreaterThan(0);
    expect(byId(page!, "versus-left")!.textContent).toContain("−");
  });
  it("still shows 100% for 5 vs 10", () => {
    show(<VersusView leftLabel="A" leftValue={5} rightLabel="B" rightValue={10} unit="inr" />);
    expect(byId(page!, "versus-chip")!.textContent).toContain("100%");
  });
});

describe("Waffle with a partly covered square", () => {
  const spans = (testId: string) => allById(page!, "waffle-square")[3].querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`);
  it("fills the steady part and outlines the change after it", () => {
    show(<WaffleView label="x" percent={3.25} compareTo={3.75} />);
    expect(spans("waffle-steady")[0].style.width).toBe("25%");
    expect(spans("waffle-part")[0].style.left).toBe("25%");
    expect(spans("waffle-part")[0].style.width).toBe("50%");
  });
  it("does the same when the percent rises", () => {
    show(<WaffleView label="x" percent={3.75} compareTo={3.25} />);
    expect(spans("waffle-steady")[0].style.width).toBe("25%");
    expect(spans("waffle-part")[0].style.left).toBe("25%");
    expect(spans("waffle-part")[0].style.width).toBe("50%");
  });
});
