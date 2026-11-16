import type { ReactNode } from "react";
import { siteViewer } from "@/site/viewer";
import { SiteShell } from "./site-chrome";

// The public site's pages (decision #7: Home, How it works, Examples, the case pages and About) share one layout: the
// nav and the footer. The title template "%s · Value It" (spec 7.1) is the root's (src/app/site-metadata.ts), so the
// joining pages and the 404 share it (issue #71). The nav changes with the sign-in state, so every page here is drawn
// per request and sent no-store (next.config.ts).

export default async function SiteLayout({ children }: { children: ReactNode }) {
  return <SiteShell viewer={await siteViewer()}>{children}</SiteShell>;
}
