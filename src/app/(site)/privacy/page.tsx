import type { Metadata } from "next";
import { pageMetadata } from "@/app/site-metadata";
import { legal } from "@/site/copy";
import { LegalPage } from "../legal-page";

// Privacy, at /privacy (issue #77): what Value It keeps, who handles it, and the cookies. Public, linked from the footer
// and /join; drawn per request for the nav's viewer state, like every site page.

export const dynamic = "force-dynamic";

export const metadata: Metadata = pageMetadata({ title: legal.privacy.title, description: legal.privacy.lede, path: "/privacy" });

export default function PrivacyPage() {
  return <LegalPage copy={legal.privacy} page="privacy" />;
}
