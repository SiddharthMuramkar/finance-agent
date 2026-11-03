// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CaseData } from "@/case-data/case-data";
import { loadCourseMap } from "@/course/map";
import { homeWidgetCode } from "./home-widget-data";
import { HomeWidget } from "./home-widget";

// Home's live annuity Widget in a browser-like page (happy-dom), as a visitor uses it: its Case Data comes from the
// server with the page, so the browser never asks the signed-in Case Data route for it.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const withheld: CaseData = {
  caseId: "mega-millions-2018",
  asOf: "2018-10-24",
  revealed: false,
  datasets: [
    {
      id: "cash-option",
      label: "Cash option",
      unit: "USD",
      source: "Source of cash-option",
      sourceUrl: "https://example.com/",
      checkedOn: "2026-10-01",
      points: [{ date: "2018-10-23", value: 877_800_000 }],
    },
  ],
};

let root: Root;
let host: HTMLElement;
const fetchSpy = vi.fn(async () => new Response("{}", { status: 401 }));

beforeEach(async () => {
  vi.stubGlobal("fetch", fetchSpy);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<HomeWidget code={homeWidgetCode(loadCourseMap())!} cases={[withheld]} />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  fetchSpy.mockClear();
});

const button = (name: string) => [...host.querySelectorAll("button")].find((b) => b.textContent === name)!;

describe("Home's live annuity Widget", () => {
  it("draws the cash option from the Case Data sent with the page, and never calls the Case Data route", () => {
    expect(host.textContent).toContain("Cash option: $877.8M");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("starts at 5%, and ticks its one task when the visitor sets 0%", async () => {
    const range = host.querySelector<HTMLInputElement>('input[type="range"]')!;
    expect(range.value).toBe("5");
    expect([...host.querySelectorAll("[data-state]")].map((li) => li.getAttribute("data-state"))).toEqual(["current"]);
    await act(async () => button("0%").click());
    expect(range.value).toBe("0");
    expect([...host.querySelectorAll("[data-state]")].map((li) => li.getAttribute("data-state"))).toEqual(["done"]);
    expect(host.textContent).toContain("Sum of payments: $1.537 billion");
  });

  it("offers no verdict, break-even or Tell the Tutor, as before the Insight", async () => {
    await act(async () => button("0%").click());
    expect(host.textContent).not.toMatch(/more than the cash|less than the cash|worth the same|Show me|Tell the Tutor/);
  });
});
