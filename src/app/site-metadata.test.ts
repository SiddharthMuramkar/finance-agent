import { describe, expect, it } from "vitest";
import { siteMetadata } from "./site-metadata";

describe("Site metadata", () => {
  it("describes the site publicly, not as private", () => {
    // Signal spec 7.2.1: the description is Home's lede.
    expect(String(siteMetadata.description)).toBe(
      "Ask a money question. The Tutor answers with a live widget built from a real event, and you move the numbers until it makes sense.",
    );
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
