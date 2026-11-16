import type { Metadata } from "next";
import { pageMetadata } from "@/app/site-metadata";
import { legal } from "@/site/copy";
import { LegalPage } from "../legal-page";

// Terms, at /terms (issue #77): the rules for using Value It during early access. Public, linked from the footer and
// /join; drawn per request for the nav's viewer state, like every site page.

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({ title: legal.terms.title, description: legal.terms.lede, path: "/terms" });

export default function TermsPage() {
  return <LegalPage copy={legal.terms} page="terms" />;
}
