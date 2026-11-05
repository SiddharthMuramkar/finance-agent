import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button, Chip, IconButton, Pill, Tag, TextLink } from "./index";

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
  });
});
