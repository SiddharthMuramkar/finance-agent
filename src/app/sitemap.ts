import type { MetadataRoute } from "next";
import { PUBLIC_PAGES } from "@/site/routes";
import { SITE_URL } from "./site-metadata";

// /sitemap.xml (issue #70): the public pages a search engine should list, from the one public-route list
// (src/site/routes.ts, each page's `sitemap` flag), at the site's own address (SITE_URL).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE_URL.origin;
  return PUBLIC_PAGES.filter((page) => page.sitemap).map((page) => ({ url: `${base}${page.path === "/" ? "" : page.path}` }));
}
