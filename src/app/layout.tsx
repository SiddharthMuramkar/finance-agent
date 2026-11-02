import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";

export const metadata: Metadata = { title: "Finance Agent", description: "A private Study Workspace." };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The Learner's dark or light choice, remembered in a cookie so the first paint is already right.
  const dark = (await cookies()).get("theme")?.value === "dark";
  return (
    <html lang="en" className={dark ? "dark" : undefined}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
