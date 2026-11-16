import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BRAND } from "@/site/copy";
import { siteViewer } from "@/site/viewer";
import { SiteShell } from "./site-chrome";

// The public site's pages (decision #7: Home, How it works, Examples, the case pages and About) share one layout: the
// nav, the footer and the title template "%s · Value It" (spec 7.1). The nav changes with the sign-in state, so every
// page here is drawn per request and sent no-store (next.config.ts).

export const metadata: Metadata = { title: { template: `%s · ${BRAND}`, default: BRAND } };

export default async function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteShell viewer={await siteViewer()}>{children}</SiteShell>;
}
