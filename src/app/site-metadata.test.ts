import { describe, expect, it } from "vitest";
import { siteMetadata } from "./site-metadata";

describe("Site metadata", () => {
  it("describes the site publicly, not as private", () => {
    // Spec 2026-11-12 E2: the description is Home's lede, which says valuation.
    expect(String(siteMetadata.description)).toMatch(/teaches you to value a jackpot, a bond or a company/i);
    expect(String(siteMetadata.description)).not.toMatch(/private/i);
  });

  it("gives shared links a title, description and the workspace screenshot on the public domain", () => {
    const og = siteMetadata.openGraph!;
    expect(String(og.title)).toBe("Value It: Learn what things are worth.");
    expect(og.description).toBe(siteMetadata.description);
    const image = (Array.isArray(og.images) ? og.images[0] : og.images) as { url: string };
    expect(new URL(image.url, siteMetadata.metadataBase!).href).toBe("https://www.value-it.xyz/landing-assets/workspace-light.png");
  });
});
