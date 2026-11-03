import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrerequisiteConfirm } from "./jump-button";

describe("the prerequisite warning", () => {
  const html = renderToStaticMarkup(
    <PrerequisiteConfirm
      title="Bond prices"
      unmet={[
        { id: "pv", title: "Present value" },
        { id: "compounding", title: "Compounding" },
      ]}
      onStudyFirst={() => {}}
      onGo={() => {}}
      onCancel={() => {}}
    />,
  );
  const buttons = [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);

  it("names the gap", () => {
    expect(html).toContain("Bond prices builds on Present value, Compounding");
  });

  it("offers Study <first unpassed prerequisite> first as the main button, then Go ahead anyway, then Not now", () => {
    expect(buttons).toEqual(["Study Present value first", "Go ahead anyway", "Not now"]);
    expect(html).toMatch(/<button[^>]*data-study-first="pv"/);
  });

  it("is a labelled group that does not claim to be a modal dialog, and focus lands on Study it first", () => {
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Prerequisites for Bond prices"');
    expect(html).not.toContain("alertdialog");
    expect(html).toMatch(/<button[^>]*autofocus[^>]*data-study-first|<button[^>]*data-study-first[^>]*autofocus/i);
  });
});
