import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import type { ReactNode } from "react";
import { JOIN_PATH, SIGN_IN_PATH, SIGN_UP_PATH } from "@/auth/destination";
import { clerkOn } from "@/auth/gates";
import "./globals.css";
import { AnnouncerProvider } from "./announcer";
import { RouteBar } from "./route-bar";
import { ClerkOn } from "./sign-out";
import { SiteAnalytics } from "./site-analytics";
import { siteMetadata } from "./site-metadata";

// Public metadata for search results and shared links; signed-in pages sit behind the login gate.
export const metadata: Metadata = siteMetadata;

// The type (spec §3.2): Inter for text (--font-text, which body uses) and Inter Tight for headings (--font-display).
// Self-hosted by next/font at build time, so no page calls Google. Inter carries latin-ext too, for the rupee sign (₹).
// Widgets use Inter too: .genui inherits the body's font.
const text = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-text", display: "swap" });
const display = Inter_Tight({ subsets: ["latin"], variable: "--font-display", display: "swap" });

/**
 * Clerk around the page, only while Clerk runs (clerkOn, issue #33): in the test bed, in CI and on a deploy without
 * Clerk keys nothing loads or calls Clerk. Inside <body>, as Clerk asks for Next.js 16. It names the sign-in pages, so
 * Clerk's own links (Join the waitlist, Sign in) stay on this site, and its cards take the narrow column's width.
 * ClerkOn tells the sign-out button to end Clerk's session too.
 */
function WithClerk({ children }: { children: ReactNode }) {
  if (!clerkOn(process.env)) return children;
  return (
    <ClerkProvider
      signInUrl={SIGN_IN_PATH}
      signUpUrl={SIGN_UP_PATH}
      waitlistUrl={JOIN_PATH}
      appearance={{ elements: { rootBox: "w-full", cardBox: "w-full max-w-full" } }}
    >
      <ClerkOn>{children}</ClerkOn>
    </ClerkProvider>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  // One Light theme (decision #17): globals.css sets it on :root, so <html> needs no theme attributes or head script.
  return (
    <html lang="en">
      <body className={`min-h-screen antialiased ${text.variable} ${display.variable}`}>
        <WithClerk>
          <RouteBar />
          <AnnouncerProvider>{children}</AnnouncerProvider>
          {/* Vercel Analytics, with the one-time sign-in token taken out of every address it records. */}
          <SiteAnalytics />
        </WithClerk>
      </body>
    </html>
  );
}
