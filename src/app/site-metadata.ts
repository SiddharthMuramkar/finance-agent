import type { Metadata } from "next";
import { BRAND, meta } from "@/site/copy";

// The public face of the site: what search results and shared links show. "/" is Home, open to everyone,
// and every signed-in page sits behind the login gate, so nothing here names the Learner or their progress.

/** The one share image: the Study Workspace screenshot (public: src/site/routes.ts lets a Visitor fetch it). */
const SHARE_IMAGE = { url: "/landing-assets/workspace-light.png", width: 1280, height: 800, alt: meta.screenshotAlt };

/** The site's own address: the base of every canonical link, robots.txt's sitemap line and sitemap.xml's pages. */
export const SITE_URL = new URL("https://www.value-it.xyz");

export const siteMetadata: Metadata = {
  metadataBase: SITE_URL,
  title: meta.title,
  description: meta.description,
  openGraph: {
    type: "website",
    siteName: meta.title,
    title: meta.shareTitle,
    description: meta.description,
    images: [SHARE_IMAGE],
  },
};

/**
 * A public page's metadata (issue #69): its title (for the template "%s · Value It"; none keeps the site's), its
 * description, its canonical link, and a shared link's title, description and image. Next.js replaces the root's
 * openGraph as a whole, so this always gives the full one.
 */
export function pageMetadata({ title, description = meta.description, path }: { title?: string; description?: string; path: string }): Metadata {
  const shareTitle = title ? `${title} · ${BRAND}` : meta.shareTitle;
  return {
    ...(title ? { title } : {}),
    description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: meta.title, title: shareTitle, description, url: path, images: [SHARE_IMAGE] },
    twitter: { card: "summary_large_image", title: shareTitle, description, images: [SHARE_IMAGE.url] },
  };
}
