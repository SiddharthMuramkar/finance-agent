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
import { THEME_INIT_SCRIPT } from "./theme";

// Public metadata for search results and shared links; signed-in pages sit behind the login gate.
export const metadata: Metadata = siteMetadata;

// The type (spec §3.2): Inter for text (--font-text, which body uses) and Inter Tight for headings (--font-display).
// Self-hosted by next/font at build time, so no page calls Google. Inter carries latin-ext too, for the rupee sign (₹).
// Widgets use Inter too: .genui inherits the body's font.
const text = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-text", display: "swap" });
const display = Inter_Tight({ subsets: ["latin"], variable: "--font-display", display: "swap" });

/**
 * Clerk's card in the page's colours (ADR 0019): every value is a token, so the join pages follow Light and Dark with
 * the rest of the page.
 */
export const CLERK_VARIABLES = {
  colorPrimary: "var(--blue)",
  colorPrimaryForeground: "var(--on-blue)",
  colorBackground: "var(--paper)",
  colorForeground: "var(--ink)",
  colorMutedForeground: "var(--muted)",
  colorMuted: "var(--wash)",
  colorInput: "var(--paper)",
  colorInputForeground: "var(--ink)",
  colorBorder: "var(--line)",
  colorRing: "var(--blue)",
  colorDanger: "var(--loss-ink)",
  colorSuccess: "var(--gain-ink)",
  colorWarning: "var(--wait-ink)",
  colorNeutral: "var(--ink)",
  colorShadow: "var(--shadow-ink)",
} as const;

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
      appearance={{ elements: { rootBox: "w-full", cardBox: "w-full max-w-full" }, variables: CLERK_VARIABLES }}
    >
      <ClerkOn>{children}</ClerkOn>
    </ClerkProvider>
  );
}

export default function RootLayout({ children }: { children: ReactNode }) {
  // Light and Dark (ADR 0019): the head script sets the theme on <html> before the first paint, from the `theme` cookie or
  // the device's setting. <html> carries no theme props, so router.refresh() never strips what the script set, and the
  // server never reads the cookie (pages stay static). suppressHydrationWarning: the script changes <html> before React.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
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
