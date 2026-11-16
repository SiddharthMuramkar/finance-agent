import type { Metadata } from "next";
import { BRAND, meta } from "@/site/copy";
import { shareImagePath } from "@/site/routes";
import { shareCard } from "@/site/share-card";

// The public face of the site: what search results and shared links show. "/" is Home, open to everyone,
// and every signed-in page sits behind the login gate, so nothing here names the Learner or their progress.

/** A share card's size: the 1.91:1 a link preview draws. */
export const SHARE_IMAGE_SIZE = { width: 1200, height: 630 } as const;

/**
 * A share card as a shared link's image (issue #71): Home's, or an Example's by its slug. Drawn in today's look by
 * src/app/share-image/[name]/route.tsx; public, since src/site/routes.ts lets a Visitor fetch it.
 */
function shareImage(name: string) {
  return { url: shareImagePath(name), ...SHARE_IMAGE_SIZE, alt: shareCard(name)?.alt ?? meta.shareTitle };
}

const HOME_IMAGE = shareImage("home");

/** The site's own address: the base of every canonical link, robots.txt's sitemap line and sitemap.xml's pages. */
export const SITE_URL = new URL("https://www.value-it.xyz");

export const siteMetadata: Metadata = {
  metadataBase: SITE_URL,
  // Every page outside the Signal site (the joining pages, the 404) is titled "Page · Value It" too (spec 7.1, #71).
  title: { template: `%s · ${BRAND}`, default: meta.title },
  description: meta.description,
  openGraph: {
    type: "website",
    siteName: meta.title,
    title: meta.shareTitle,
    description: meta.description,
    images: [HOME_IMAGE],
  },
};

/**
 * A public page's metadata (issue #69): its title (for the template "%s · Value It"; none keeps the site's), its
 * description, its canonical link, and a shared link's title, description and image: Home's share card, or the one
 * named by `image` (an Example's slug, issue #71). Next.js replaces the root's openGraph as a whole, so this always
 * gives the full one.
 */
export function pageMetadata({ title, description = meta.description, path, image }: { title?: string; description?: string; path: string; image?: string }): Metadata {
  const shareTitle = title ? `${title} · ${BRAND}` : meta.shareTitle;
  const card = image ? shareImage(image) : HOME_IMAGE;
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: meta.title, title: shareTitle, description, url: path, images: [card] },
    twitter: { card: "summary_large_image", title: shareTitle, description, images: [card.url] },
  };
}
