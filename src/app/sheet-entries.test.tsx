import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SheetEntries, sheetEntries } from "./sheet-entries";
import { CHECK_VIEW, EXPLORE_KEY, REVIEW_VIEW } from "./widget-panel";

// Spec #68, #83: on a phone the open quiz Check, the explore Widget and a due spaced Review each get an entry in the
// conversation that slides them up in the full-screen sheet.
describe("the phone's entries to the sheet", () => {
  it("lists the open Check first, then the explore Widget, then a due Review", () => {
    expect(sheetEntries({ check: "Check 1 of 2", explore: true, reviewDue: 3 })).toEqual([
      { view: CHECK_VIEW, label: "Check 1 of 2" },
      { view: EXPLORE_KEY, label: "Explore" },
      { view: REVIEW_VIEW, label: "Spaced review · 3 due" },
    ]);
  });

  it("has nothing when there is no Check, no explore Widget and no Review due", () => {
    expect(sheetEntries({ explore: false, reviewDue: 0 })).toEqual([]);
    expect(renderToStaticMarkup(<SheetEntries entries={[]} onOpen={() => {}} />)).toBe("");
  });

  it("draws each as a phone-only chip that names its view", () => {
    const html = renderToStaticMarkup(<SheetEntries entries={sheetEntries({ explore: true, reviewDue: 1 })} onOpen={() => {}} />);
    expect(html).toContain("md:hidden");
    expect(html).toMatch(/data-testid="sheet-entry"[^>]*data-view="explore"|data-view="explore"[^>]*data-testid="sheet-entry"/);
    expect(html).toContain("Spaced review · 1 due");
  });
});
