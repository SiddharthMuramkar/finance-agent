import type { MetadataRoute } from "next";
import { PUBLIC_PAGES } from "@/site/routes";
import { siteMetadata } from "./site-metadata";

// /sitemap.xml (issue #70): the public pages a search engine should list, from the one public-route list
// (src/site/routes.ts, each page's `sitemap` flag), at the site's own address (siteMetadata.metadataBase).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteMetadata.metadataBase!.origin;
  return PUBLIC_PAGES.filter((page) => page.sitemap).map((page) => ({ url: `${base}${page.path === "/" ? "" : page.path}` }));
}
