import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Emoji } from "./emoji";
import type { EmojiName } from "./registry";

afterEach(() => vi.restoreAllMocks());

describe("<Emoji> (E1)", () => {
  it("renders a decorative emoji with an empty alt and aria-hidden", () => {
    const html = renderToStaticMarkup(<Emoji name="money-bag" size={48} />);
    expect(html).toContain('src="/emoji/1f4b0.webp"');
    expect(html).toContain('alt=""');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('width="48"');
    expect(html).toContain('height="48"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain('decoding="async"');
    expect(html).toContain('draggable="false"');
  });

  it("renders a meaningful emoji with its label as alt and no aria-hidden", () => {
    const html = renderToStaticMarkup(<Emoji name="money-bag" size={48} label="a bag of money" />);
    expect(html).toContain('alt="a bag of money"');
    expect(html).not.toContain("aria-hidden");
  });

  it("uses the registry alt when label is true", () => {
    const html = renderToStaticMarkup(<Emoji name="money-bag" size={24} label />);
    expect(html).toContain('alt="money bag"');
    expect(html).not.toContain("aria-hidden");
  });

  it("renders nothing for an unknown name and warns once", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bad = "pizza-slice-unknown" as EmojiName;
    expect(renderToStaticMarkup(<Emoji name={bad} size={24} />)).toBe("");
    expect(renderToStaticMarkup(<Emoji name={bad} size={24} />)).toBe("");
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
