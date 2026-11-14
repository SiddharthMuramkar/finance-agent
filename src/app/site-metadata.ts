import type { Metadata } from "next";
import { copy } from "./_landing/copy";

// The public face of the site: what search results and shared links show. "/" is Home, open to everyone,
// and every signed-in page sits behind the login gate, so nothing here names the Learner or their progress.
export const siteMetadata: Metadata = {
  metadataBase: new URL("https://www.value-it.xyz"),
  title: copy.brand,
  description: copy.subtext,
  openGraph: {
    type: "website",
    siteName: copy.brand,
    title: `${copy.brand}: ${copy.headline.join(" ")}`,
    description: copy.subtext,
    images: [{ url: "/landing-assets/workspace-light.png", width: 1280, height: 800, alt: copy.screenshotAlt }],
  },
};
