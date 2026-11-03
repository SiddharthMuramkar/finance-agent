import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { siteMetadata } from "./site-metadata";

// Public metadata for search results and shared links; signed-in pages sit behind the login gate.
export const metadata: Metadata = siteMetadata;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The Learner's dark or light choice, remembered in a cookie so the first paint is already right.
  const dark = (await cookies()).get("theme")?.value === "dark";
  return (
    <html lang="en" className={dark ? "dark" : undefined}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
