import type { MetadataRoute } from "next";
import { SIGNED_IN_ROOTS } from "@/site/routes";
import { siteMetadata } from "./site-metadata";

// /robots.txt (issue #70): every crawler may read the public site; the signed-in pages, the developer pages and the API
// (src/site/routes.ts SIGNED_IN_ROOTS) only ever send it to the sign-in or answer 401, so it is kept out of them. Served
// as text to a signed-out visitor (the proxy lets it through), so Lighthouse finds valid rules, not the sign-in card.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: [...SIGNED_IN_ROOTS] },
    sitemap: new URL("/sitemap.xml", siteMetadata.metadataBase!).href,
  };
}
