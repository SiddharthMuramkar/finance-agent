// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExamplesFilter } from "./examples-filter";

// The Examples filter (Signal spec 7.4): chips with counts; filtering hides rows with the `hidden` attribute.

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeEach(async () => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(<ExamplesFilter />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const shown = () => [...host.querySelectorAll(".v-qlist li")].filter((li) => !li.hasAttribute("hidden")).map((li) => li.querySelector("a")!.getAttribute("href"));

describe("the Examples filter", () => {
  it("offers All 5, Everyday money 2, The news 1 and Real companies 2, with All pressed", () => {
    const chips = [...host.querySelectorAll(".v-filter button")];
    expect(chips.map((c) => c.textContent)).toEqual(["All5", "Everyday money2", "The news1", "Real companies2"]);
    expect(chips[0].getAttribute("aria-pressed")).toBe("true");
    expect(shown()).toHaveLength(5);
  });

  it("hides the rows of other groups", async () => {
    const chips = [...host.querySelectorAll<HTMLButtonElement>(".v-filter button")];
    await act(async () => chips[3].click());
    expect(shown()).toEqual(["/examples/amazon-2000", "/examples/wework-2019"]);
    expect(host.querySelectorAll(".v-qlist li")).toHaveLength(5);
    await act(async () => chips[2].click());
    expect(shown()).toEqual(["/examples/rates-up-1"]);
    await act(async () => chips[0].click());
    expect(shown()).toHaveLength(5);
  });
});
