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

  // ADR 0015: a warning is the warning tint with a triangle and words, not the sunflower Widget family.
  it("is a quiet warning box with a triangle, not a Widget colour", () => {
    expect(html).toContain("bg-[var(--warning-tint)]");
    expect(html).not.toContain("--src-line");
    expect(html).toMatch(/<p class="flex gap-2"><svg aria-hidden="true"[^>]*text-\[var\(--warning\)\]/);
  });

  it("keeps one primary: Study it first is primary, Go ahead anyway secondary and Not now a text button", () => {
    expect(html).toMatch(/<button[^>]*class="btn btn-primary btn-sm"[^>]*>Study Present value first/);
    expect(html).toMatch(/<button[^>]*class="btn btn-secondary btn-sm"[^>]*>Go ahead anyway/);
    expect(html).toMatch(/<button[^>]*class="btn btn-tertiary btn-sm"[^>]*>Not now/);
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
