import type { ClerkProvider } from "@clerk/nextjs";
import type { ComponentProps } from "react";

/**
 * How Clerk's cards look on /join, /sign-in and /sign-up (issue #76): set here in code, never in the Clerk Dashboard.
 * Every colour and the font point at the site's own tokens in globals.css (`var(--…)`, which Clerk accepts), so the
 * cards follow the theme, Dark included, with no second palette. Controls are flat: no shadow, no gradient, no lip
 * (ADR 0018). Clerk's own header is hidden, so the page's one heading is the Band's h1 (src/app/sign-in/auth-page.tsx).
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--accent)",
    colorPrimaryForeground: "var(--on-accent)",
    colorDanger: "var(--danger)",
    colorSuccess: "var(--gain-ink)",
    colorWarning: "var(--wait-ink)",
    colorBackground: "var(--raised)",
    colorForeground: "var(--ink)",
    colorMuted: "var(--wash)",
    colorMutedForeground: "var(--muted)",
    colorNeutral: "var(--ink)",
    colorInput: "var(--paper)",
    colorInputForeground: "var(--ink)",
    colorBorder: "var(--line)",
    colorRing: "var(--ring)",
    colorShadow: "transparent",
    fontFamily: "var(--font-body)",
    fontFamilyButtons: "var(--font-body)",
    borderRadius: "0.5rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: { width: "100%", maxWidth: "100%", boxShadow: "none", border: "1px solid var(--rule)" },
    card: { boxShadow: "none" },
    header: { display: "none" },
    formButtonPrimary: { boxShadow: "none", backgroundImage: "none" },
    socialButtonsBlockButton: { boxShadow: "none" },
    formFieldInput: { boxShadow: "none" },
    footer: { backgroundImage: "none" },
  },
} satisfies NonNullable<ComponentProps<typeof ClerkProvider>["appearance"]>;
