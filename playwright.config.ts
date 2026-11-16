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
 * The tools Learner's saved sign-in (global-setup.ts writes it). A Light project's device is set to light, a `-dark`
 * project's to dark, and neither carries a `theme` cookie: the page follows the device (ADR 0019), so a dark project
 * also proves the device-first default.
 */
const AUTH = "test-results/.auth/tools.json";

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

const project = (name: string, viewport: { width: number; height: number }, colorScheme: "light" | "dark" = "light"): Project => ({
  name,
  use: { ...devices["Desktop Chrome"], viewport, colorScheme, storageState: AUTH },
});

/**
 * Spec 2026-11-12 G9: a phone (390 x 844) and a tablet (768 x 1024) for the public pages only: the Signal site, sign-in and the
 * phone specs. `testMatch` keeps every other spec at the desktop widths (spec #68: the Study Workspace and the signed-in
 * pages open on a phone too, measured by phone-workspace and phone-pages). The preview matrix (matrix.spec.ts, UI_MATRIX=1) also shoots the public pages at 390
 * (src/dev/preview-matrix.ts).
 */
export const SMALL_VIEWPORTS = {
  p390: { width: 390, height: 844 },
  t768: { width: 768, height: 1024 },
} as const;
export const SMALL_SPECS = /(?:^|\/)(?:home|about|sign-in|phone-note|matrix|signal-qa|phone-workspace|theme|phone-pages|spine-01)\.spec\.ts$/;

/**
 * The narrowest phone (spec #68, #82: "at 360 and 390 px"): only the phone specs run here, the Study Workspace's first;
 * append a spec's name to PHONE_SPECS when it holds at 360 px.
 */
export const PHONE_VIEWPORTS = { p360: { width: 360, height: 800 } } as const;
export const PHONE_SPECS = /(?:^|\/)(?:phone-note|phone-workspace|phone-pages|spine-01)\.spec\.ts$/;

const small = (name: string, viewport: { width: number; height: number }): Project => ({
  ...project(name, viewport),
  testMatch: SMALL_SPECS,
});

/**
 * Dark (ADR 0019, #80): the specs that judge colour and look run again on `mbp14-dark`: the flat-look and affordance
 * audits, the app bar and the Study Workspace in Dark (theme.spec.ts sets each device itself). Append a spec's name to DARK_SPECS when it
 * should hold in Dark too.
 */
export const DARK_SPECS = /(?:^|\/)(?:affordance|widget-look|header|workspace-theme|matrix)\.spec\.ts$/;

const projects: Project[] = [
  ...Object.entries(VIEWPORTS).map(([name, viewport]) => project(name, viewport)),
  ...Object.entries(SMALL_VIEWPORTS).map(([name, viewport]) => small(name, viewport)),
  ...Object.entries(PHONE_VIEWPORTS).map(([name, viewport]) => ({ ...project(name, viewport), testMatch: PHONE_SPECS })),
  { ...project("mbp14-dark", VIEWPORTS.mbp14, "dark"), testMatch: DARK_SPECS },
  // F1's preview matrix (UI_MATRIX=1): the dark twin of every other matrix viewport too (src/dev/preview-matrix.ts).
  ...(process.env.UI_MATRIX === "1"
    ? [
        ...(["w1280", "w1920", "w1024"] as const).map((name) => ({ ...project(`${name}-dark`, VIEWPORTS[name], "dark"), testMatch: /(?:^|\/)matrix\.spec\.ts$/ })),
        { ...project("p390-dark", SMALL_VIEWPORTS.p390, "dark"), testMatch: /(?:^|\/)matrix\.spec\.ts$/ },
      ]
    : []),
];

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/support/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0, // CI retries a failed test once and reports it as flaky; locally a failure stays a failure.
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
