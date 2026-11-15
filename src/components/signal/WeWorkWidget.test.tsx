// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { WeWorkWidget } from "./WeWorkWidget";
import { cleanup, click, getByRole, queryByRole, render, textOf } from "./test-dom";

// The WeWork widget (spec §6.6) as a learner meets it: five beats, one bar each, the call on beat 5 and Go deeper after
// the first tap (QA row 18).

afterEach(cleanup);

const widget = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-widget="wework"]')!;
const bar = (container: HTMLElement, id: string) => {
  const row = container.querySelector<HTMLElement>(`[data-row="${id}"]`)!;
  return { hidden: row.classList.contains("is-hidden"), value: textOf(row.querySelector("output")), width: row.querySelector<HTMLElement>(".sig-bar-fill")!.style.width };
};
const next = (container: HTMLElement, times = 1) => {
  for (let i = 0; i < times; i++) click(getByRole(container, "button", "Next beat"));
};

describe("the WeWork widget renders", () => {
  it("opens on beat 1 with every bar hidden", () => {
    const { container } = render(<WeWorkWidget />);
    const w = widget(container);
    expect(w.dataset.case).toBe("wework-2019");
    expect(textOf(w)).toContain("Aug 2019");
    expect(textOf(w.querySelector(".sig-beat-who"))).toBe("1 of 5 · Narrator");
    expect(textOf(w.querySelector(".sig-beat-text"))).toBe("14 August 2019. WeWork publishes its plan to sell shares to the public.");
    for (const id of ["runRate", "recorded", "netLoss"]) expect(bar(w, id)).toEqual({ hidden: true, value: "?", width: "0%" });
    expect(w.querySelectorAll(".sig-dots li.is-on")).toHaveLength(1);
    expect(textOf(w)).toContain("Source: WeWork S-1, 14 Aug 2019.");
    expect([...w.querySelectorAll(".sig-key li")].map((li) => textOf(li))).toEqual(["Claimed, not yet earned", "Recorded", "Loss"]);
  });

  it("drops the head in compact mode and renders nothing for another Case", () => {
    expect(widget(render(<WeWorkWidget compact />).container).querySelector("h3")).toBeNull();
    expect(render(<WeWorkWidget caseSlug="amazon-2000" />).container.innerHTML).toBe("");
  });
});

describe("call before reveal", () => {
  it("reveals one bar a beat, and asks the call only on beat 5", () => {
    const { container } = render(<WeWorkWidget />);
    next(container);
    expect(bar(container, "runRate")).toEqual({ hidden: false, value: "$3.0bn", width: "93.75%" });
    expect(bar(container, "recorded").hidden).toBe(true);
    expect(container.querySelector(".sig-call")).toBeNull();
    next(container, 2);
    expect(bar(container, "recorded").value).toBe("$1.54bn");
    expect(bar(container, "netLoss").value).toBe("−$0.905bn");
    expect(container.querySelector(".sig-call")).toBeNull();
    expect(textOf(container.querySelector(".sig-l2"))).toContain("Opens after your call.");
    next(container);
    expect(textOf(container.querySelector(".sig-call legend"))).toBe("Your call Is $3 billion of run-rate revenue $3 billion earned?");
    expect(getByRole(container, "button", "End of the story")).toHaveProperty("disabled", true);
    expect(queryByRole(container, "button", "Next beat")).toBeNull();
    expect(textOf(container.querySelector(".sig-l2"))).toContain("Opens after your call.");
    expect(textOf(container)).not.toContain("59 cents");
  });

  it("18: on beat 5, No, it is a pace is right and Go deeper shows $1.00 and −$0.59", () => {
    const onCall = vi.fn();
    const { container } = render(<WeWorkWidget onCall={onCall} />);
    next(container, 4);
    click(getByRole(container, "button", "No, it is a pace"));
    expect(getByRole(container, "button", "No, it is a pace").className).toContain("is-right");
    expect(textOf(container.querySelector(".sig-fb"))).toMatch(/^Right It is the latest month’s revenue times 12/);
    for (const id of ["runRate", "recorded", "netLoss"]) expect(bar(container, id).hidden).toBe(false);
    const deeper = container.querySelector('.sig-l2[data-open="true"]')!;
    expect(textOf(deeper)).toContain("Put the loss next to the revenue.");
    expect(textOf(deeper)).toContain("For every $1 of revenue it recorded in those six months, WeWork lost about 59 cents.");
    expect([...deeper.querySelectorAll("output")].map((o) => textOf(o))).toEqual(["$1.00", "−$0.59"]);
    expect(deeper.querySelector<HTMLElement>('[data-deeper="loss"] .sig-bar-fill')!.style.width).toBe("58.8%");
    expect(onCall).toHaveBeenCalledWith(expect.objectContaining({ id: "pace", verdict: "right" }));
  });

  it("keeps the first call, and Start again goes back to beat 1 with the call reset", () => {
    const onCall = vi.fn();
    const { container } = render(<WeWorkWidget onCall={onCall} />);
    next(container, 4);
    click(getByRole(container, "button", "Yes, it is revenue"));
    click(getByRole(container, "button", "No, it is a pace"));
    expect(getByRole(container, "button", "Yes, it is revenue").className).toContain("is-wrong");
    expect(getByRole(container, "button", "No, it is a pace").className).not.toContain("is-right");
    expect(textOf(container.querySelector(".sig-fb"))).toMatch(/^Not quite Recorded revenue for the half-year was \$1\.54bn/);
    expect(onCall).toHaveBeenCalledTimes(1);

    click(getByRole(container, "button", "Start again"));
    expect(container.querySelector("[data-beat]")?.getAttribute("data-beat")).toBe("1");
    expect(container.querySelector(".sig-call")).toBeNull();
    expect(bar(container, "runRate").hidden).toBe(true);
  });
});
