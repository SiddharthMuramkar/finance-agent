import { describe, expect, it } from "vitest";
import { pageMetadata, siteMetadata } from "./site-metadata";

describe("Site metadata", () => {
  it("describes the site publicly, not as private", () => {
    // Signal spec 7.2.1: the description is Home's lede.
    expect(String(siteMetadata.description)).toBe(
      "Ask a money question. The Tutor answers with a live widget built from a real event, and you move the numbers until it makes sense.",
    );
    expect(String(siteMetadata.description)).not.toMatch(/private/i);
  });

  it("gives shared links a title, description and Home's share card on the public domain", () => {
    const og = siteMetadata.openGraph!;
    expect(String(og.title)).toBe("Value It: Learn what things are worth.");
    expect(og.description).toBe(siteMetadata.description);
    const image = (Array.isArray(og.images) ? og.images[0] : og.images) as { url: string };
    expect(new URL(image.url, siteMetadata.metadataBase!).href).toBe("https://www.value-it.xyz/share-image/home.png");
  });
});

// Issue #69: one helper gives each public page its title, description, canonical link and share image, so a shared
// link names the page it came from.
describe("Page metadata", () => {
  const about = pageMetadata({ title: "About", description: "Who makes Value It.", path: "/about" });
  const absolute = (url: string | URL) => new URL(url, siteMetadata.metadataBase!).href;

  it("keeps the page's own title for the template %s · Value It, and its description", () => {
    expect(about.title).toBe("About");
    expect(about.description).toBe("Who makes Value It.");
  });

  it("links the canonical address on the public domain", () => {
    expect(absolute(about.alternates!.canonical as string)).toBe("https://www.value-it.xyz/about");
  });

  it("gives shared links the page's own title and description with Home's share card", () => {
    const og = about.openGraph!;
    expect(og.title).toBe("About · Value It");
    expect(og.description).toBe("Who makes Value It.");
    expect(absolute(og.url!)).toBe("https://www.value-it.xyz/about");
    const image = (Array.isArray(og.images) ? og.images[0] : og.images) as { url: string; alt: string; width: number; height: number };
    expect(absolute(image.url)).toBe("https://www.value-it.xyz/share-image/home.png");
    expect(image).toMatchObject({ width: 1200, height: 630, alt: "Value It: Learn what things are worth." });
    const twitter = about.twitter as { card: string; title: string; images: unknown[] };
    expect(twitter).toMatchObject({ card: "summary_large_image", title: "About · Value It", description: "Who makes Value It." });
    expect(twitter.images).toEqual(["/share-image/home.png"]);
  });

  // Issue #71: an Example's shared link shows its own card, so it shows its own question.
  it("gives an Example its own share card", () => {
    const amazon = pageMetadata({ title: "Is $84 a fair price for Amazon?", path: "/examples/amazon-2000", image: "amazon-2000" });
    const image = (amazon.openGraph!.images as { url: string; alt: string }[])[0];
    expect(image).toMatchObject({ url: "/share-image/amazon-2000.png", alt: "Is $84 a fair price for Amazon?" });
    expect((amazon.twitter as { images: unknown[] }).images).toEqual(["/share-image/amazon-2000.png"]);
  });

  it("without a title (Home), keeps the site's title, description and share title", () => {
    const home = pageMetadata({ path: "/" });
    expect(home.title).toBeUndefined();
    expect("title" in home).toBe(false);
    expect(home.description).toBe(siteMetadata.description);
    expect(home.openGraph!.title).toBe("Value It: Learn what things are worth.");
    expect(absolute(home.alternates!.canonical as string)).toBe("https://www.value-it.xyz/");
  });
});
