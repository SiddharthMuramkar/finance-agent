import { existsSync } from "node:fs";
import { chromium, defineConfig, devices, type Project } from "@playwright/test";
import { chromeExecutable } from "./src/dev/e2e-browser";

/**
 * The browser test bed (spec 2026-11-05, T-00): the whole app in Chromium, on an in-memory PGlite, with a scripted
 * Tutor. `npm run ui:test`. The port comes from E2E_PORT (default 3100) so several worktrees can run it at once.
 * One server, one PGlite and one tools Learner are shared, so the tests run one at a time.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;

/**
 * The tools Learner's saved sign-in (global-setup.ts writes both). The dark projects start from the same sign-in plus the
 * cookie `theme=dark`: a dark project is a Learner who chose Dark (ADR 0013), since the site never reads the computer's
 * setting. Their colorScheme stays dark, which proves that setting changes nothing.
 */
const AUTH = "test-results/.auth/tools.json";
const AUTH_DARK = "test-results/.auth/tools-dark.json";

/**
 * Playwright's own Chromium, unless only `CHROME_PATH`'s browser is there (spec 2026-11-11, T-00): a cloud VM cannot
 * download Playwright's browser but has Chrome for Testing at `CHROME_PATH`. Undefined in CI and on the owner's Mac.
 */
const executablePath = chromeExecutable(process.env, chromium.executablePath(), existsSync);

const VIEWPORTS = {
  mbp14: { width: 1512, height: 982 },
  w1280: { width: 1280, height: 800 },
  w1920: { width: 1920, height: 1080 },
  w1024: { width: 1024, height: 768 },
} as const;

const project = (name: string, viewport: { width: number; height: number }, colorScheme: "light" | "dark"): Project => ({
  name,
  use: { ...devices["Desktop Chrome"], viewport, colorScheme, storageState: colorScheme === "dark" ? AUTH_DARK : AUTH },
});

/**
 * Spec 2026-11-12 G9: a phone (390 x 844) and a tablet (768 x 1024) for the public pages only: Home, About, sign-in and the
 * phone note. `testMatch` keeps every other spec at the desktop widths the Study Workspace is built for (below 768 px it
 * shows only the phone note). The preview matrix (matrix.spec.ts, UI_MATRIX=1) also shoots the public pages at 390 in
 * both Themes (src/dev/preview-matrix.ts).
 */
export const SMALL_VIEWPORTS = {
  p390: { width: 390, height: 844 },
  t768: { width: 768, height: 1024 },
} as const;
export const SMALL_SPECS = /(?:^|\/)(?:home|home-value-levers|about|sign-in|phone-note|matrix)\.spec\.ts$/;

const small = (name: string, viewport: { width: number; height: number }, colorScheme: "light" | "dark"): Project => ({
  ...project(name, viewport, colorScheme),
  testMatch: SMALL_SPECS,
});

const projects: Project[] = [
  ...Object.entries(VIEWPORTS).map(([name, viewport]) => project(name, viewport, "light")),
  project("mbp14-dark", VIEWPORTS.mbp14, "dark"),
  ...Object.entries(SMALL_VIEWPORTS).map(([name, viewport]) => small(name, viewport, "light")),
  // F1's preview matrix: the dark twin of every other viewport too (8 projects in all), and the phone's (G9).
  ...(process.env.UI_MATRIX === "1"
    ? [...(["w1280", "w1920", "w1024"] as const).map((name) => project(`${name}-dark`, VIEWPORTS[name], "dark")), small("p390-dark", SMALL_VIEWPORTS.p390, "dark")]
    : []),
];

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [["list"], ["html", { open: "never" }]],
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{testFilePath}/{arg}{ext}",
  use: {
    baseURL: BASE,
    storageState: AUTH,
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    ...(executablePath && { launchOptions: { executablePath } }),
  },
  projects,
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `${BASE}/sign-in`,
    timeout: 180_000,
    reuseExistingServer: false,
    gracefulShutdown: { signal: "SIGTERM", timeout: 2000 },
    stdout: "ignore",
    stderr: "pipe",
    env: {
      E2E: "1",
      E2E_DB: "pglite",
      E2E_TUTOR: "scripted",
      PASSCODES: "tools:e2e-passcode",
      SESSION_SECRET: "e2e-secret-e2e-secret-e2e-secret!!",
      // Clerk is off in the test bed (clerkOn is false whenever E2E=1), so it needs no keys and no network; this also
      // stops @clerk/nextjs from making a keyless development app should anything load it (issue #33).
      NEXT_PUBLIC_CLERK_KEYLESS_DISABLED: "1",
    },
  },
});
