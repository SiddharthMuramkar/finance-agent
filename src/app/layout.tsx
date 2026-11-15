import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "./globals.css";
import { AnnouncerProvider } from "./announcer";
import { RouteBar } from "./route-bar";
import { SiteAnalytics } from "./site-analytics";
import { siteMetadata } from "./site-metadata";
import { THEME_INIT_SCRIPT } from "./theme";

// Public metadata for search results and shared links; signed-in pages sit behind the login gate.
export const metadata: Metadata = siteMetadata;

// The type (ADR 0015): Inter for text (--font-text, which body uses) and Inter Tight for headings (--font-display).
// Self-hosted by next/font at build time, so no page calls Google. Inter carries latin-ext too, for the rupee sign (₹).
// Widgets use Inter too (ADR 0015): .genui inherits the body's font.
const text = Inter({ subsets: ["latin", "latin-ext"], variable: "--font-text", display: "swap" });
const display = Inter_Tight({ subsets: ["latin"], variable: "--font-display", display: "swap" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The head script alone puts the theme on <html>, before first paint. <html> takes no theme props from here: when
  // router.refresh() redraws this layout, React then has nothing to change, so it never strips what the script set.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`min-h-screen antialiased ${text.variable} ${display.variable}`}>
        <RouteBar />
        <AnnouncerProvider>{children}</AnnouncerProvider>
        {/* Vercel Analytics, with the one-time sign-in token taken out of every address it records. */}
        <SiteAnalytics />
      </body>
    </html>
  );
}
