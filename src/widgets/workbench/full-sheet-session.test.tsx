// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetView } from "@/app/widget-view";
import { readWidget } from "../widget-reading";

// Full sheet rows saved with the Widget's state (#104): a Session saved before rows could change still draws, and the Tutor
// is told each changed row, with the engine's value for it.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** The Value levers program as Sessions saved it before the Full sheet's rows could change: no row $variables, no row props. */
const BEFORE_ROWS = `root = Widget("What is Amazon worth a share?", [levers])
$revenue = 39
$margin = 10
$salesToCapital = 3
$risk = 12.84
$failure = 0
$moved = 0
$mostLever = 0
$mostBy = 0
levers = ValueLevers("amazon-dcf-2000", $revenue, $margin, $salesToCapital, $risk, $failure, $moved, $mostLever, $mostBy, "Damodaran's story", {revenue: 60, margin: 12.5})
`;
const NOW = readFileSync(join(process.cwd(), "src/widgets/fixtures/parts/value-levers.openui"), "utf8");

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

async function draw(code: string, initialValues?: Record<string, number>) {
  await act(async () => root.render(<WidgetView code={code} complete initialValues={initialValues} />));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  const headline = host.querySelector('[data-testid="value-levers-headline"]')?.textContent;
  const goDeeper = host.querySelector<HTMLDetailsElement>('[data-testid="value-levers-go-deeper"]');
  return { headline, goDeeper };
}

describe("a Session saved before rows could change", () => {
  it("still draws at its saved Levers, with the Full sheet at the Case's own figures", async () => {
    const { headline, goDeeper } = await draw(BEFORE_ROWS, { $revenue: 60, $margin: 12.5 });
    expect(host.textContent).not.toContain("could not be drawn");
    expect(headline).toBe("Your story is worth $84 a share");
    expect(goDeeper).not.toBeNull();
  });

  it("is told to the Tutor as before: no row changed", () => {
    const reading = readWidget(BEFORE_ROWS, { values: { $revenue: 60, $margin: 12.5 }, ticked: [] }, () => undefined)!;
    expect(reading.readouts[0]).toBe("Value: $84 a share");
    expect(reading.readouts.some((r) => r.startsWith("Full sheet row changed"))).toBe(false);
  });
});

describe("a Session with Full sheet rows changed", () => {
  it("draws the saved rows in the headline", async () => {
    // At the Case's own figures it is $35 a share; cash of $520m, not $26m, is $494m over 340.79 million shares: about $1.45 a share more.
    const { headline } = await draw(NOW, { $cashRow: 494 });
    expect(headline).toBe("Your story is worth $36 a share");
  });

  it("tells the Tutor each changed row, its figure and the Case's, and values it with the engine", () => {
    const reading = readWidget(NOW, { values: { $cashRow: 494, $taxRow: -5 }, ticked: [] }, () => undefined)!;
    expect(reading.readouts).toContain("Full sheet row changed: Cash the company holds, $520m (the Case's $26m)");
    expect(reading.readouts).toContain("Full sheet row changed: Tax rate, 30% (the Case's 35%)");
    expect(reading.readouts[0]).not.toBe("Value: $35 a share");
  });
});
