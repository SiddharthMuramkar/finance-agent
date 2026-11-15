// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CompoundWidget } from "./CompoundWidget";
import { allByRole, cleanup, click, getByRole, reduceMotion, render, setRange, textOf } from "./test-dom";

// The compounding widget (spec §6.4) as a learner meets it. Reduced motion is on, so the run to year 30 after the call
// lands at once (§9.9). The numbers are the §6.4.4 table and QA rows 13 and 14.

beforeEach(reduceMotion);
afterEach(cleanup);

const widget = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-widget="compound"]')!;
const big = (container: HTMLElement) => textOf(container.querySelector(".sig-big"));
const sentence = (container: HTMLElement) => textOf(container.querySelector(".sig-verdict"));
const keys = (container: HTMLElement) => [...container.querySelectorAll(".sig-key li")].map((li) => textOf(li));
const lit = (container: HTMLElement) => container.querySelectorAll("[data-year]:not(.sig-dim)").length;

describe("the compounding widget renders", () => {
  it("draws the full card at 3 years", () => {
    const { container } = render(<CompoundWidget />);
    const w = widget(container);
    expect(w.dataset.case).toBe("compounding-1000");
    expect(textOf(w)).toContain("Everyday money");
    expect(w.querySelector("h3")?.textContent).toBe("What ₹1,000 grows to at 10% a year");
    expect(allByRole(w, "button").slice(0, 3).map((b) => textOf(b))).toEqual(["Yes, ₹100 every year", "No, more each year", "No, less each year"]);
    expect(w.querySelectorAll("[data-year]")).toHaveLength(30);
    expect(lit(w)).toBe(3);
    expect(textOf(w)).toContain("2×");
    expect(textOf(w)).toContain("16×");
    expect(big(w)).toBe("₹1,331");
    expect(sentence(w)).toBe("after 3 years. Growth added ₹331, and year 3 alone added ₹121.");
    expect(keys(w)).toEqual(["What you put in", "Growth"]);
    expect(textOf(w)).toContain("Worked example from the Topic. No outside figures.");
  });

  it("drops the head in compact mode and renders nothing for another Case", () => {
    expect(widget(render(<CompoundWidget compact />).container).querySelector("h3")).toBeNull();
    expect(render(<CompoundWidget caseSlug="wework-2019" />).container.innerHTML).toBe("");
  });
});

describe("call before reveal", () => {
  it("keeps the years locked, Go deeper closed and the table hidden before the call", () => {
    const { container } = render(<CompoundWidget />);
    expect(getByRole(container, "slider", "Years it grows")).toHaveProperty("disabled", true);
    expect(getByRole(container, "button", "10 years")).toHaveProperty("disabled", true);
    expect(textOf(container)).toContain("Make your call to unlock the years.");
    expect(textOf(container.querySelector(".sig-l2"))).toContain("Opens after your call.");
    expect(textOf(container)).not.toContain("Split the growth");
    expect(textOf(container)).not.toContain("Show the numbers");
    expect(textOf(container.querySelector(".sig-fb"))).toBe("");
  });

  it("13: tapping No, more each year is right, runs the years to 30 and fires onCall once", () => {
    const onCall = vi.fn();
    const { container } = render(<CompoundWidget onCall={onCall} />);
    click(getByRole(container, "button", "No, more each year"));
    expect(getByRole(container, "button", "No, more each year").className).toContain("is-right");
    expect(textOf(container.querySelector(".sig-fb"))).toMatch(/^Right Year one adds ₹100, year two ₹110/);
    expect(lit(container)).toBe(30);
    expect(big(container)).toBe("₹17,449");
    expect(sentence(container)).toBe("after 30 years. Growth added ₹16,449, and year 30 alone added ₹1,586.");
    expect(getByRole(container, "slider", "Years it grows")).toHaveProperty("disabled", false);
    expect(onCall).toHaveBeenCalledWith(expect.objectContaining({ id: "more", verdict: "right" }));

    // A second tap: single select, the old verdict clears; onCall does not fire again.
    click(getByRole(container, "button", "Yes, ₹100 every year"));
    expect(getByRole(container, "button", "No, more each year").className).not.toContain("is-right");
    expect(getByRole(container, "button", "Yes, ₹100 every year").className).toContain("is-wrong");
    expect(textOf(container.querySelector(".sig-fb"))).toMatch(/^Not quite Year one adds ₹100/);
    expect(onCall).toHaveBeenCalledTimes(1);
  });
});

describe("key numbers after the call", () => {
  const called = () => {
    const r = render(<CompoundWidget />);
    click(getByRole(r.container, "button", "No, less each year"));
    return r.container;
  };

  it.each([
    [1, "₹1,100", "after 1 year. Growth added ₹100, and year 1 alone added ₹100."],
    [8, "₹2,144", "after 8 years. Growth added ₹1,144, and year 8 alone added ₹195."],
    [10, "₹2,594", "after 10 years. Growth added ₹1,594, and year 10 alone added ₹236."],
    [22, "₹8,140", "after 22 years. Growth added ₹7,140, and year 22 alone added ₹740."],
  ])("at %i years the balance is %s", (years, balance, text) => {
    const container = called();
    setRange(getByRole(container, "slider", "Years it grows"), years);
    expect(big(container)).toBe(balance);
    expect(sentence(container)).toBe(text);
    expect(lit(container)).toBe(years);
  });

  it("the 10-year preset sets the years", () => {
    const container = called();
    click(getByRole(container, "button", "10 years"));
    expect(textOf(container.querySelector(".sig-range-top output"))).toBe("10 years");
    expect(big(container)).toBe("₹2,594");
  });

  it("14: splitting the growth shows ₹3,000 and ₹13,449 at 30 years, and the key has three entries", () => {
    const container = called();
    setRange(getByRole(container, "slider", "Years it grows"), 30);
    click(getByRole(container, "button", "Split the growth"));
    const toggle = getByRole(container, "button", "Growth is split");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(sentence(container)).toContain("Of that growth, ₹3,000 was earned on your ₹1,000 and ₹13,449 on earlier growth.");
    expect(keys(container)).toEqual(["What you put in", "Earned on your ₹1,000", "Earned on earlier growth"]);
    expect(container.querySelectorAll("path.sig-f-deep").length).toBeGreaterThan(0);
    expect([...container.querySelectorAll(".sig-seg-part")].map((s) => s.getAttribute("title"))).toEqual([
      "What you put in: ₹1,000",
      "Earned on your ₹1,000: ₹3,000",
      "Earned on earlier growth: ₹13,449",
    ]);
  });

  it("lists every year in the table view", () => {
    const container = called();
    const rows = container.querySelectorAll(".sig-table tbody tr");
    expect(rows).toHaveLength(30);
    expect([...rows[29].querySelectorAll("td")].map((td) => textOf(td))).toEqual(["30", "₹17,449", "₹1,586"]);
  });
});
