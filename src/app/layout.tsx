import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import { AnnouncerProvider } from "./announcer";
import { RouteBar } from "./route-bar";
import { siteMetadata } from "./site-metadata";
import { THEME_INIT_SCRIPT } from "./theme";
import { ThemeFollower } from "./theme-store";

// Public metadata for search results and shared links; signed-in pages sit behind the login gate.
export const metadata: Metadata = siteMetadata;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // The head script alone puts the theme on <html>, before first paint. <html> takes no theme props from here: when
  // router.refresh() redraws this layout, React then has nothing to change, so it never strips what the script set.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased">
        <ThemeFollower />
        <RouteBar />
        <AnnouncerProvider>{children}</AnnouncerProvider>
        <Analytics />
      </body>
    </html>
  );
}
