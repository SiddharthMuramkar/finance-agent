import type { Metadata } from "next";
import { meta } from "@/site/copy";

// The public face of the site: what search results and shared links show. "/" is Home, open to everyone,
// and every signed-in page sits behind the login gate, so nothing here names the Learner or their progress.
export const siteMetadata: Metadata = {
  metadataBase: new URL("https://www.value-it.xyz"),
  title: meta.title,
  description: meta.description,
  openGraph: {
    type: "website",
    siteName: meta.title,
    title: meta.shareTitle,
    description: meta.description,
    images: [{ url: "/landing-assets/workspace-light.png", width: 1280, height: 800, alt: meta.screenshotAlt }],
  },
};
