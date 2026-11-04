// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CaseDataset } from "@/case-data/case-data";
import { allById, byId, click, draw, key, redraw, setRange, settle, stubReducedMotion, type Page } from "../wave1/test-kit";
import { actualSlices, DrawTheLineView, gapLine, horizonMs, SLICES, splitHistory, valueAt } from "./draw-the-line";
import { futurePrice, PriceTagView } from "./price-tag";
import { moved, RankView, rankProblem, rightPlaces, startOrder } from "./rank";
import { buyingPower, ShrinkingNoteView } from "./shrinking-note";
import { answerMatches, looksLikeFormula, parseTyped, StepThroughView } from "./step-through";
import { coinSize, paymentRows, TimeTravelView } from "./time-travel";
import { WaterfallView, waterfallBars } from "./waterfall";

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

describe("PriceTag", () => {
  it("works the later price out by code", () => {
    expect(futurePrice(20, 6, 10)).toBeCloseTo(35.82, 2);
    expect(futurePrice(20, 0, 10)).toBe(20);
  });

  it("shows today's tag beside the later one, and rewrites it when the years move", () => {
    show(<PriceTagView item="Vada pav" price={20} ratePercent={6} years={10} currency="inr" />);
    expect(byId(page!, "price-tag-now-value")!.textContent).toBe("₹20");
    expect(byId(page!, "price-tag-later-value")!.textContent).toBe("₹35.82");
    expect(byId(page!, "price-tag")!.getAttribute("aria-label")).toBe("Vada pav: ₹20 today, ₹35.82 in 10 years at 6% a year.");
    redraw(page!, <PriceTagView item="Vada pav" price={20} ratePercent={6} years={0} currency="inr" />);
    expect(byId(page!, "price-tag-later-value")!.textContent).toBe("₹20");
  });

  it("says it is working while a variable has no number yet, and stops fading under reduced motion", () => {
    show(<PriceTagView item="Vada pav" price={20} ratePercent={NaN} years={10} />);
    expect(byId(page!, "price-tag")).toBeNull();
    page!.cleanup();
    stubReducedMotion(true);
    show(<PriceTagView item="Vada pav" price={20} ratePercent={6} years={10} />);
    expect(byId(page!, "price-tag")!.getAttribute("data-motion")).toBe("reduced");
    expect(byId(page!, "price-tag-later-value")!.style.transition).toBe("");
  });
});

describe("ShrinkingNote", () => {
  it("keeps the printed value and shrinks the buying power by the present value formula", () => {
    expect(buyingPower(100, 6, 10)).toBeCloseTo(55.84, 2);
    show(<ShrinkingNoteView amount={100} ratePercent={6} years={10} currency="inr" />);
    expect(byId(page!, "shrinking-note-printed")!.textContent).toBe("₹100");
    expect(byId(page!, "shrinking-note-worth")!.textContent).toBe("₹55.84");
    expect(Number(byId(page!, "shrinking-note")!.getAttribute("data-share"))).toBeCloseTo(0.5584, 3);
    redraw(page!, <ShrinkingNoteView amount={100} ratePercent={6} years={30} currency="inr" />);
    expect(byId(page!, "shrinking-note-printed")!.textContent).toBe("₹100");
    expect(Number(byId(page!, "shrinking-note")!.getAttribute("data-share"))).toBeLessThan(0.2);
  });

  it("is an image with a sentence for a name, and still at 0 years", () => {
    show(<ShrinkingNoteView amount={100} ratePercent={6} years={0} currency="inr" />);
    expect(byId(page!, "shrinking-note")!.getAttribute("role")).toBe("img");
    expect(byId(page!, "shrinking-note")!.getAttribute("aria-label")).toContain("buys what ₹100 buys today");
    expect(byId(page!, "shrinking-note")!.getAttribute("data-share")).toBe("1");
  });

  it("does not ease the buying power under reduced motion", () => {
    stubReducedMotion(true);
    show(<ShrinkingNoteView amount={100} ratePercent={6} years={10} />);
    expect(byId(page!, "shrinking-note")!.getAttribute("data-motion")).toBe("reduced");
    expect(byId(page!, "shrinking-note-power")!.style.transition).toBe("");
  });
});

describe("TimeTravel", () => {
  it("makes a coin smaller the further it travels", () => {
    expect(coinSize(1)).toBeGreaterThan(coinSize(0.5));
    expect(coinSize(0.5)).toBeGreaterThan(coinSize(0));
    expect(coinSize(5)).toBe(coinSize(1));
  });

  it("drags one coin from today to the last year and says what it is worth", () => {
    show(<TimeTravelView amount={100} ratePercent={8} maxYears={30} currency="inr" />);
    expect(byId(page!, "time-travel")!.getAttribute("data-mode")).toBe("coin");
    const before = Number(byId(page!, "time-travel-coin")!.getAttribute("data-size"));
    expect(byId(page!, "time-travel-caption")!.textContent).toBe("₹100 paid today is worth ₹100 today.");
    const slider = page!.host.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(slider.max).toBe("30");
    setRange(slider, 30);
    expect(byId(page!, "time-travel-caption")!.textContent).toBe("₹100 paid in 30 years is worth ₹9.94 today.");
    expect(Number(byId(page!, "time-travel-coin")!.getAttribute("data-size"))).toBeLessThan(before);
    expect(slider.getAttribute("aria-valuetext")).toBe("Year 30");
  });

  it("turns a row of coins into an annuity that stacks up at today", () => {
    const rows = paymentRows(100, 8, 3, 5);
    expect(rows.map((r) => Math.round(r.payment))).toEqual([100, 105, 110]);
    expect(rows[0].worth).toBe(100);
    show(<TimeTravelView amount={100} ratePercent={8} maxYears={10} payments={3} growthPercent={5} currency="inr" />);
    expect(allById(page!, "time-travel-payment")).toHaveLength(3);
    expect(byId(page!, "time-travel-total")).toBeNull();
    setRange(page!.host.querySelector<HTMLInputElement>('input[type="range"]')!, 3);
    const total = rows.reduce((s, r) => s + r.worth, 0);
    expect(byId(page!, "time-travel-total")!.textContent).toBe(`₹${total.toFixed(2).replace(/\.?0+$/, "")}`);
    expect(allById(page!, "time-travel-payment").every((p) => p.getAttribute("data-state") === "today")).toBe(true);
  });

  it("can be moved with the keyboard (it is a native range) and does not ease under reduced motion", () => {
    stubReducedMotion(true);
    show(<TimeTravelView amount={100} ratePercent={8} maxYears={30} />);
    const slider = page!.host.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(slider.step).toBe("1");
    expect(byId(page!, "time-travel")!.getAttribute("data-motion")).toBe("reduced");
    expect(byId(page!, "time-travel-coin")!.style.transition).toBe("");
  });
});

describe("Waterfall", () => {
  it("steps each change from where the last one ended and closes with a total added up by code", () => {
    const bars = waterfallBars(["Revenue", "Costs", "Tax"], [1000, -450, -60], "Profit");
    expect(bars.map((b) => [b.from, b.to])).toEqual([
      [0, 1000],
      [1000, 550],
      [550, 490],
      [0, 490],
    ]);
    expect(bars.at(-1)).toMatchObject({ label: "Profit", total: true, change: 490 });
  });

  it("draws a bar per label plus the total, each with its figure", () => {
    show(<WaterfallView labels={["Revenue", "Costs", "Tax"]} values={[1_000_000, -450_000, -60_000]} unit="inr" totalLabel="Profit" />);
    const bars = allById(page!, "waterfall-bar");
    expect(bars.map((b) => b.getAttribute("data-kind"))).toEqual(["rise", "fall", "fall", "total"]);
    const figure = byId(page!, "waterfall")!;
    expect(figure.getAttribute("role")).toBe("img");
    expect(figure.getAttribute("aria-label")).toContain("Costs minus ₹4.5 lakh");
    expect(figure.getAttribute("aria-label")).toContain("Profit ₹4.9 lakh");
    expect(figure.textContent).toContain("−₹4.5 lakh");
  });

  it("says it is working with no values yet", () => {
    show(<WaterfallView labels={[]} values={[]} unit="inr" />);
    expect(byId(page!, "waterfall")).toBeNull();
  });
});

describe("Rank", () => {
  const items = ["House", "Fixed deposit", "Savings account", "Cash"];
  const reasons = ["Months to sell.", "Broken with a penalty.", "Same day.", "Already cash."];
  const mount = (n = 4) => <RankView prompt="Order them" items={items.slice(0, n)} correctOrder={Array.from({ length: n }, (_, i) => i)} reasons={reasons.slice(0, n)} lowLabel="Slowest" highLabel="Fastest" />;
  const rows = () => allById(page!, "rank-item");
  const order = () => rows().map((r) => Number(r.getAttribute("data-item")));

  it("checks its arguments and never starts already right", () => {
    expect(rankProblem(items, [0, 1, 2, 3], reasons)).toBeNull();
    expect(rankProblem(items, [0, 1, 2], reasons)).toContain("every item index");
    expect(rankProblem(items, [0, 1, 2, 2], reasons)).toContain("every item index");
    expect(rankProblem(["a"], [0], ["x"])).toContain("2 to 8");
    expect(rankProblem(items, [0, 1, 2, 3], reasons.slice(1))).toContain("one reason");
    for (const n of [2, 3, 4, 5, 8]) {
      const right = Array.from({ length: n }, (_, i) => i);
      expect(startOrder(right)).not.toEqual(right);
      expect([...startOrder(right)].sort((a, b) => a - b)).toEqual(right);
    }
    expect(moved([0, 1, 2], 0, 2)).toEqual([1, 2, 0]);
    expect(moved([0, 1, 2], 0, 5)).toEqual([0, 1, 2]);
    expect(rightPlaces([0, 2, 1], [0, 1, 2])).toBe(1);
  });

  it("moves a row with Space, the arrow keys and Space, then checks the order and shows each reason", () => {
    show(mount(2));
    expect(order()).toEqual([1, 0]);
    key(rows()[0], " ");
    expect(rows()[0].getAttribute("data-lifted")).toBe("true");
    key(rows()[0], "ArrowDown");
    expect(order()).toEqual([0, 1]);
    key(rows()[1], " ");
    expect(byId(page!, "rank-said")!.textContent).toContain("Dropped");
    expect(byId(page!, "rank-reason")).toBeNull();
    click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Check the order")!);
    expect(byId(page!, "rank-result")!.textContent).toBe("All in the right place.");
    expect(allById(page!, "rank-reason").map((r) => r.textContent)).toEqual(["Months to sell.", "Broken with a penalty."]);
    expect(rows().every((r) => r.getAttribute("data-state") === "right")).toBe(true);
  });

  it("marks the rows that are in the wrong place and lets the Learner try again", () => {
    show(mount());
    click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Check the order")!);
    expect(byId(page!, "rank-result")!.textContent).toBe("0 of 4 in the right place.");
    expect(rows().every((r) => r.getAttribute("data-state") === "wrong")).toBe(true);
    key(rows()[0], " "); // locked once checked
    expect(rows()[0].getAttribute("data-lifted")).toBe("false");
    click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Try again")!);
    expect(byId(page!, "rank")!.getAttribute("data-checked")).toBe("false");
  });

  it("only moves focus with the arrow keys when nothing is picked up", () => {
    show(mount());
    const before = order();
    key(rows()[0], "ArrowDown");
    expect(order()).toEqual(before);
    expect(rows().every((r) => r.tabIndex === 0)).toBe(true);
  });

  it("shows a message for impossible arguments", () => {
    show(<RankView prompt="x" items={["a", "b"]} correctOrder={[0, 0]} reasons={["a", "b"]} lowLabel="l" highLabel="h" />);
    expect(byId(page!, "rank-problem")).not.toBeNull();
  });

  it("does not ease the border under reduced motion", () => {
    stubReducedMotion(true);
    show(mount());
    expect(byId(page!, "rank")!.getAttribute("data-motion")).toBe("reduced");
    expect(rows()[0].style.transition).toBe("");
  });
});

describe("StepThrough", () => {
  const steps = [
    { title: "Put in", body: "You put in ₹10,000 today.", highlight: "you" as const },
    { title: "Grow", body: "At 10% a year one year adds ₹1,000.", highlight: "neutral" as const },
    { title: "Total", body: "What is it after two years?", ask: 12100, askUnit: "inr" },
  ];
  const next = () => [...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Next")!;
  const back = () => [...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Back")!;

  it("recognises a formula in symbols, which belongs on a Formula Card", () => {
    expect(looksLikeFormula("PV = FV / (1 + r)^n")).toBe(true);
    expect(looksLikeFormula("A = P * (1 + r)")).toBe(true);
    expect(looksLikeFormula("Divide by (1 + r)^n each year")).toBe(true);
    expect(looksLikeFormula("You put in ₹10,000 and it grows at 10% a year.")).toBe(false);
    expect(looksLikeFormula("Rate = 5% a year")).toBe(false);
  });

  it("reads typed answers and accepts them within half a percent", () => {
    expect(parseTyped("₹12,100")).toBe(12100);
    expect(parseTyped("12100.5")).toBe(12100.5);
    expect(parseTyped("about 12100")).toBeNull();
    expect(answerMatches(12100, 12100)).toBe(true);
    expect(answerMatches(12150, 12100)).toBe(true);
    expect(answerMatches(12300, 12100)).toBe(false);
  });

  it("goes Back and Next and lights up the numbers in the step's tone", () => {
    show(<StepThroughView steps={steps} />);
    expect(byId(page!, "step-count")!.textContent).toBe("Step 1 of 3");
    expect(back()!.getAttribute("aria-disabled")).toBe("true");
    expect(allById(page!, "step-number").map((n) => [n.textContent, n.getAttribute("data-tone")])).toEqual([["₹10,000", "you"]]);
    click(next());
    expect(byId(page!, "step-count")!.textContent).toBe("Step 2 of 3");
    expect(allById(page!, "step-number").map((n) => n.textContent)).toEqual(["10%", "₹1,000"]);
    click(back());
    expect(byId(page!, "step-through")!.getAttribute("data-step")).toBe("0");
  });

  it("moves with the arrow keys from outside a text box", () => {
    show(<StepThroughView steps={steps} />);
    key(byId(page!, "step-through"), "ArrowRight");
    expect(byId(page!, "step-through")!.getAttribute("data-step")).toBe("1");
    key(byId(page!, "step-through"), "ArrowLeft");
    expect(byId(page!, "step-through")!.getAttribute("data-step")).toBe("0");
  });

  it("makes a step with ask a faded step: the Learner types the number and code checks it", () => {
    show(<StepThroughView steps={steps} />);
    click(next());
    click(next());
    const input = page!.host.querySelector<HTMLInputElement>("input")!;
    const type = (value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      act(() => {
        setter.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    const check = () => click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Check")!);
    type("12000");
    check();
    expect(byId(page!, "step-ask")!.getAttribute("data-status")).toBe("wrong");
    expect(byId(page!, "step-ask-result")!.textContent).toContain("Not quite");
    type("₹12,100");
    check();
    expect(byId(page!, "step-ask")!.getAttribute("data-status")).toBe("right");
    expect(byId(page!, "step-ask-result")!.textContent).toBe("Right. It is ₹12,100.");
  });

  it("can show the answer after a wrong try", () => {
    show(<StepThroughView steps={steps.slice(2)} />);
    const input = page!.host.querySelector<HTMLInputElement>("input")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    act(() => {
      setter.call(input, "5");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Check")!);
    click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Show me the answer")!);
    expect(byId(page!, "step-ask-result")!.textContent).toBe("It is ₹12,100.");
  });

  it("will not show a formula typed in symbols (ADR 0002) and points to the Formula Card", () => {
    show(<StepThroughView steps={[{ title: "Discount", body: "PV = FV / (1 + r)^n" }]} />);
    expect(byId(page!, "step-body")).toBeNull();
    expect(byId(page!, "step-formula-blocked")!.textContent).toContain("Formula Card");
    expect(page!.host.textContent).not.toContain("FV");
  });

  it("does not fade between steps under reduced motion", () => {
    stubReducedMotion(true);
    show(<StepThroughView steps={steps} />);
    expect(byId(page!, "step-through")!.getAttribute("data-motion")).toBe("reduced");
    click(next());
    expect(page!.host.querySelector<HTMLElement>('[role="group"]')!.style.transition).toBe("");
  });
});

describe("DrawTheLine", () => {
  const history = ["2000", "2001", "2002", "2003", "2004", "2005"].map((y, i) => ({ date: `${y}-01-01`, value: 100 + i * 10 }));
  const later = [{ date: "2006-01-01", value: 200 }, { date: "2007-01-01", value: 250 }, { date: "2008-01-01", value: 300 }];
  const dataset = (points: { date: string; value: number }[]): CaseDataset => ({ id: "close", label: "Index close", unit: "points", source: "Exchange", sourceUrl: "https://example.org", checkedOn: "2026-11-01", points });
  const full = Array.from({ length: SLICES }, (_, i) => 150 + i * 5);
  const slices = () => allById(page!, "draw-slice");
  const reveal = () => click([...page!.host.querySelectorAll("button")].find((b) => b.textContent === "Show me what happened")!);

  it("splits the record at the date and sizes the drawing from the history alone", () => {
    const { history: h, future } = splitHistory([...history, ...later], "2005-01-01");
    expect(h).toHaveLength(6);
    expect(future).toHaveLength(3);
    expect(horizonMs(h)).toBe((Date.UTC(2005, 0, 1) - Date.UTC(2000, 0, 1)) / 2);
    expect(valueAt([...history, ...later], Date.UTC(2005, 6, 2))).toBeGreaterThan(150);
    expect(valueAt(history, Date.UTC(1990, 0, 1))).toBeNull();
    expect(valueAt(history, Date.UTC(2020, 0, 1))).toBeNull();
    expect(actualSlices(h, [], SLICES).every((v) => v === null)).toBe(true);
    expect(actualSlices(h, future).filter((v) => v !== null).length).toBeGreaterThan(0);
  });

  it("writes the gap sentence in code", () => {
    expect(gapLine([80, 80], [100, 100])).toBe("Your line was 20% below what happened, on average.");
    expect(gapLine([130, 130], [100, 100])).toBe("Your line was 30% above what happened, on average.");
    expect(gapLine([90, 110], [100, 100])).toBe("Your line was within 1% of what happened, on average.");
    expect(gapLine([90], [null])).toContain("not enough of the record");
  });

  it("starts with the Show button off and eight slices to draw, and records each stroke before any reveal", () => {
    const onDraw = vi.fn();
    show(<DrawTheLineView dataset={dataset([...history, ...later])} asOf="2005-01-01" drawn={[]} onDraw={onDraw} />);
    expect(slices()).toHaveLength(SLICES);
    expect((page!.host.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
    key(slices()[0], "ArrowUp");
    expect(onDraw).toHaveBeenCalledTimes(1);
    const drawn = onDraw.mock.calls[0][0] as (number | null)[];
    expect(drawn[0]).toBeGreaterThan(150); // starts from the last value in the history
    expect(drawn.slice(1).every((v) => v === null)).toBe(true);
    expect(byId(page!, "draw-actual")).toBeNull();
  });

  it("never draws or writes what happened before the reveal", () => {
    show(<DrawTheLineView dataset={dataset([...history, ...later])} asOf="2005-01-01" drawn={full} onDraw={() => {}} />);
    expect(byId(page!, "draw-actual")).toBeNull();
    expect(byId(page!, "draw-result")).toBeNull();
    expect(page!.host.textContent).not.toMatch(/300|250/);
    expect(byId(page!, "draw-guess")).not.toBeNull();
  });

  it("moves between slices with the left and right arrow keys", () => {
    show(<DrawTheLineView dataset={dataset(history)} asOf="2005-01-01" drawn={[]} onDraw={() => {}} />);
    expect(slices().map((s) => s.tabIndex)).toEqual([0, -1, -1, -1, -1, -1, -1, -1]);
    key(slices()[0], "ArrowRight");
    expect(slices()[1].tabIndex).toBe(0);
  });

  it("reveals what happened after the guess, with the sentence, once the Topic's reveal allows it", () => {
    show(<DrawTheLineView dataset={dataset([...history, ...later])} asOf="2005-01-01" drawn={full} onDraw={() => {}} />);
    expect((page!.host.querySelector("button") as HTMLButtonElement).disabled).toBe(false);
    reveal();
    expect(byId(page!, "draw-actual")).not.toBeNull();
    expect(byId(page!, "draw-result")!.textContent).toMatch(/^Your line was \d+% (below|above) what happened, on average\.$/);
    slices().forEach((s) => expect(s.getAttribute("aria-disabled")).toBe("true"));
  });

  it("keeps the guess and says the rest is withheld when the record stops at the as-of date", () => {
    show(<DrawTheLineView dataset={dataset(history)} asOf="2005-01-01" drawn={full} onDraw={() => {}} />);
    reveal();
    expect(byId(page!, "draw-withheld")!.textContent).toContain("revealed when the story reaches its reveal");
    expect(byId(page!, "draw-actual")).toBeNull();
    expect(byId(page!, "draw-guess")).not.toBeNull();
  });

  it("can start the drawing at an earlier date than the as-of date", () => {
    show(<DrawTheLineView dataset={dataset([...history, ...later])} asOf="2008-01-01" from="2005-01-01" drawn={full} onDraw={() => {}} />);
    reveal();
    expect(byId(page!, "draw-result")!.textContent).toContain("Your line was");
  });

  it("does not ease under reduced motion and says so", () => {
    stubReducedMotion(true);
    show(<DrawTheLineView dataset={dataset(history)} asOf="2005-01-01" drawn={[]} onDraw={() => {}} />);
    expect(byId(page!, "draw-the-line")!.getAttribute("data-motion")).toBe("reduced");
  });

  it("explains itself when there is too little history", async () => {
    show(<DrawTheLineView dataset={dataset(history.slice(0, 1))} asOf="2005-01-01" drawn={[]} onDraw={() => {}} />);
    expect(page!.host.textContent).toContain("not enough history");
    await settle(0);
  });
});

describe("Waterfall signs", () => {
  it("signs a negative closing total in the bar and the summary", () => {
    const html = renderToStaticMarkup(<WaterfallView labels={["Revenue", "Costs"]} values={[100000, -150000]} unit="inr" totalLabel="Profit" />);
    expect(html).toContain("−₹50,000");
    expect(html).toContain("Profit minus ₹50,000");
  });
  it("leaves a positive total unsigned", () => {
    const html = renderToStaticMarkup(<WaterfallView labels={["Revenue", "Costs"]} values={[1000, -400]} unit="inr" totalLabel="Profit" />);
    expect(html).toContain("Profit ₹600");
  });
});
