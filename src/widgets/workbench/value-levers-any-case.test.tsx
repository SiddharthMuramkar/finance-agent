// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { AMAZON_2000 } from "@/finance/fixtures/amazon-2000.valuation";
import { findValuation, ownCaseLookup } from "@/finance/valuation-lookup";
import { valuationCase } from "@/finance/valuation-cases";
import { readWidget } from "../widget-reading";
import { OwnCasesContext } from "./own-cases";
import { valueLeversData } from "./value-levers-model";

// Value levers on a valuation that is not a course Case (spec #68, ticket #106): one lookup, course Cases first and then
// the Learner's Own Cases, on the page (the part) and on the server (what the Tutor is told). An Own Case here is Amazon's
// block under a fresh id, so the engine must give the same $35 a share.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const OWN_ID = "own-case-my-amazon";
const ownCases = ownCaseLookup({ [OWN_ID]: AMAZON_2000 });
const FIXTURE = readFileSync(join(process.cwd(), "src/widgets/fixtures/parts/value-levers.openui"), "utf8");
const OWN_PROGRAM = FIXTURE.replace('ValueLevers("amazon-dcf-2000"', `ValueLevers("${OWN_ID}"`);

describe("the valuation lookup", () => {
  it("finds a course Case first, then an Own Case, else nothing", () => {
    expect(findValuation("amazon-dcf-2000")).toBe(valuationCase("amazon-dcf-2000"));
    expect(findValuation(OWN_ID)).toBeNull();
    expect(findValuation(OWN_ID, ownCases)?.baseRevenue).toBe(1117);
    // A course Case wins over an Own Case under the same id: nothing changes for course Cases.
    const shadow = ownCaseLookup({ "amazon-dcf-2000": { ...AMAZON_2000, baseRevenue: 1 } });
    expect(findValuation("amazon-dcf-2000", shadow)).toBe(valuationCase("amazon-dcf-2000"));
  });

  it("refuses an Own Case whose block does not parse", () => {
    expect(ownCaseLookup({ bad: { ...AMAZON_2000, shares: "many" } })("bad")).toBeNull();
  });
});

describe("Value levers' data on an Own Case", () => {
  it("draws from the Own Case when given the Learner's Own Cases, and still names the course Cases when not", () => {
    const found = valueLeversData({ caseId: OWN_ID }, ownCases);
    expect("data" in found && found.data.block.baseRevenue).toBe(1117);
    const missing = valueLeversData({ caseId: OWN_ID });
    expect("problem" in missing && missing.problem).toMatch(/^"own-case-my-amazon" is not a Valuation Case\. Cases: .*amazon-dcf-2000/);
  });
});

describe("what the Tutor is told about Value levers on an Own Case (server)", () => {
  it("reads the value the engine gives the Own Case", () => {
    const reading = readWidget(OWN_PROGRAM, undefined, () => undefined, false, undefined, ownCases)!;
    expect(reading.readouts[0]).toBe("Value: $35 a share");
    expect(readWidget(OWN_PROGRAM, undefined, () => undefined)!.readouts).toEqual([]);
  });
});

describe("Value levers drawn on an Own Case (page)", () => {
  let root: Root;
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const draw = async (withOwnCases: boolean) => {
    await act(async () => {
      root.render(
        <OwnCasesContext.Provider value={withOwnCases ? ownCases : null}>
          <WidgetView code={OWN_PROGRAM} complete />
        </OwnCasesContext.Provider>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  };
  const headline = () => host.querySelector('[data-testid="value-levers-headline"]')?.textContent ?? "";

  it('opens at "Your story is worth $35 a share" from the Learner\'s Own Cases', async () => {
    await draw(true);
    expect(headline()).toBe("Your story is worth $35 a share");
  });

  it("is not drawn without them, as for any id that is not a Valuation Case", async () => {
    await draw(false);
    expect(headline()).toBe("");
    expect(host.textContent).toContain("This widget could not be drawn.");
  });
});
