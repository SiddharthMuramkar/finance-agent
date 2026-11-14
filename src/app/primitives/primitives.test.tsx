import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, ButtonLink, Chip, IconButton, LinkButton, MenuItem, MenuLink, Pill, Tag, TextLink, buttonClass, type TagTone } from "./index";

describe("primitives", () => {
  it("carry their signifier", () => {
    const button = renderToStaticMarkup(<Button>Go</Button>);
    expect(button).toContain('data-affordance="button"');
    expect(button).toContain('type="button"');
    const busy = renderToStaticMarkup(<Button loading>Go</Button>);
    expect(busy).toContain('aria-busy="true"');
    expect(busy).toContain('data-testid="spinner"');

    const icon = renderToStaticMarkup(<IconButton label="Close">x</IconButton>);
    expect(icon).toContain('data-affordance="icon"');
    expect(icon).toContain('aria-label="Close"');
    expect(icon).toContain('title="Close"');

    const chip = renderToStaticMarkup(<Chip active>Pick</Chip>);
    expect(chip).toContain('data-affordance="chip"');
    expect(chip).toContain('aria-pressed="true"');

    for (const html of [renderToStaticMarkup(<Pill brand>Hi</Pill>), renderToStaticMarkup(<Tag tone="mint">Hi</Tag>)]) {
      expect(html).toMatch(/^<span /);
      expect(html).toContain('data-affordance="tag"');
      expect(html).not.toContain("pressable");
      expect(html).not.toContain("rounded-full");
    }
    expect(renderToStaticMarkup(<TextLink href="/x">Go</TextLink>)).toContain('data-affordance="link"');
    const linkButton = renderToStaticMarkup(<LinkButton>Edit</LinkButton>);
    expect(linkButton).toContain('data-affordance="link"');
    expect(linkButton).toContain('type="button"');
  });

  // ADR 0013: four tiers and four sizes. md adds no size class, so every class string the app had before is unchanged.
  it("pick a tier and a size class, md adding none", () => {
    expect(buttonClass()).toBe("btn btn-primary");
    expect(buttonClass("secondary", "sm")).toBe("btn btn-secondary btn-sm");
    expect(buttonClass("danger")).toBe("btn btn-danger");
    expect(buttonClass("tertiary", "xs")).toBe("btn btn-tertiary btn-xs");
    expect(buttonClass("primary", "lg")).toBe("btn btn-primary btn-lg");
    expect(renderToStaticMarkup(<Button variant="tertiary" size="xs">Save to Notebook</Button>)).toContain('class="btn btn-tertiary btn-xs"');
    expect(renderToStaticMarkup(<ButtonLink href="/study" size="lg">Start</ButtonLink>)).toContain('class="btn btn-primary btn-lg"');
  });

  // Menu rows are flat .menu-item rows: no hand-drawn border, lip or shadow (ADR 0013); the menu is a .popover.
  it("draw menu rows as flat .menu-item rows with the menuitem role", () => {
    const item = renderToStaticMarkup(<MenuItem>Sign out</MenuItem>);
    expect(item).toMatch(/^<button type="button" role="menuitem" data-affordance="button" class="menu-item">Sign out<\/button>$/);
    const link = renderToStaticMarkup(<MenuLink href="/settings">Settings</MenuLink>);
    expect(link).toContain('class="menu-item"');
    expect(link).toContain('role="menuitem"');
    for (const html of [item, link]) expect(html).not.toMatch(/shadow|border|rounded/);
  });

  // The app's chrome uses status tones (always with words), never a Widget accent family (ADR 0013).
  it("offer success, warning and danger tones", () => {
    const tones: TagTone[] = ["success", "warning", "danger"];
    for (const tone of tones) {
      const html = renderToStaticMarkup(<Tag tone={tone}>Passed</Tag>);
      expect(html).toBe(`<span data-affordance="tag" data-tone="${tone}" class="tag">Passed</span>`);
    }
  });
});
