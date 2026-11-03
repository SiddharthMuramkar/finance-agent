import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrerequisiteConfirm } from "./jump-button";

describe("the prerequisite confirm", () => {
  const html = renderToStaticMarkup(<PrerequisiteConfirm topicId="bonds" title="Bond prices" unmet={["Present value"]} onGo={() => {}} onCancel={() => {}} />);

  it("names the gap and offers Go ahead and Not now", () => {
    expect(html).toContain("Bond prices builds on Present value");
    expect(html).toContain("Go ahead");
    expect(html).toContain("Not now");
  });

  it("is a labelled group that does not claim to be a modal dialog, and focus lands on Go ahead", () => {
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Prerequisites for Bond prices"');
    expect(html).not.toContain("alertdialog");
    expect(html).toMatch(/<button[^>]*autofocus[^>]*data-confirm-jump|<button[^>]*data-confirm-jump[^>]*autofocus/i);
  });
});
