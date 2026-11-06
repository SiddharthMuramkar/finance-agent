import { defineConfig, devices, type Project } from "@playwright/test";

/**
 * The browser test bed (spec 2026-11-05, T-00): the whole app in Chromium, on an in-memory PGlite, with a scripted
 * Tutor. `npm run ui:test`. The port comes from E2E_PORT (default 3100) so several worktrees can run it at once.
 * One server, one PGlite and one tools Learner are shared, so the tests run one at a time.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);
const BASE = `http://localhost:${PORT}`;

const VIEWPORTS = {
  mbp14: { width: 1512, height: 982 },
  w1280: { width: 1280, height: 800 },
  w1920: { width: 1920, height: 1080 },
  w1024: { width: 1024, height: 768 },
} as const;

const project = (name: string, viewport: { width: number; height: number }, colorScheme: "light" | "dark"): Project => ({
  name,
  use: { ...devices["Desktop Chrome"], viewport, colorScheme },
});

const projects: Project[] = [
  ...Object.entries(VIEWPORTS).map(([name, viewport]) => project(name, viewport, "light")),
  project("mbp14-dark", VIEWPORTS.mbp14, "dark"),
  // F1's preview matrix: the dark twin of every other viewport too (8 projects in all).
  ...(process.env.UI_MATRIX === "1" ? (["w1280", "w1920", "w1024"] as const).map((name) => project(`${name}-dark`, VIEWPORTS[name], "dark")) : []),
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
    storageState: "test-results/.auth/tools.json",
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects,
  webServer: {
    command: `npm run dev -- --port ${PORT}`,
    url: `${BASE}/login`,
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
      // Google sign-in shows in the test bed, but Google is never called (C1b): fake client, fixed secret.
      GOOGLE_CLIENT_ID: "e2e-not-real",
      GOOGLE_CLIENT_SECRET: "e2e-not-real",
      BETTER_AUTH_SECRET: "e2e-better-auth-secret-012345678",
      BETTER_AUTH_URL: BASE,
    },
  },
});
