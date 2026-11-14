import type { Metadata } from "next";
import { isSignedIn } from "@/auth/session";
import { AboutView } from "../_landing/about";
import { aboutCopy } from "../_landing/about-copy";
import { loadShowcases } from "../_landing/showcase-widgets";
import { courseStats } from "../_landing/stats";

// The About page: public (the proxy lets a signed-out GET or HEAD of exactly "/about" through). Its header knows whether
// the visitor is signed in (spec 2026-11-12 G1, E11), so the page is drawn for each request, as Home is: never cached as a
// page (next.config.ts sends no-store, because one address serves both kinds of visitor). It reads only the sign-in state:
// no Learner data, so it never needs the Learner's progress.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: aboutCopy.title, description: aboutCopy.lede };

export default async function AboutPage() {
  const stats = courseStats();
  const widgets = loadShowcases().filter((s) => s.area === "everyday" || s.area === "economy");
  return <AboutView stats={stats} widgets={widgets} signedIn={await isSignedIn()} />;
}
