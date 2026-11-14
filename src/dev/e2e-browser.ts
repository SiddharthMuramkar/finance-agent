/**
 * Which browser the test bed launches (spec 2026-11-11, ticket T-00). `undefined` means Playwright's own Chromium, as
 * in CI and on the owner's Mac. A cloud VM blocks Playwright's browser download but has Chrome for Testing at
 * `CHROME_PATH`, so that path is used only when Playwright's Chromium is missing. A pure function of the env, the
 * bundled path (`chromium.executablePath()`) and a file check, so it can be tested without a file system.
 */
export function chromeExecutable(env: Record<string, string | undefined>, bundled: string | undefined, exists: (path: string) => boolean): string | undefined {
  const chrome = env.CHROME_PATH;
  if (!chrome) return undefined;
  // An installed Playwright Chromium always wins, even with CHROME_PATH set, so CI stays exactly as it is.
  if (bundled && exists(bundled)) return undefined;
  if (exists(chrome)) return chrome;
  throw new Error(
    `Playwright's Chromium is not installed (${bundled}) and CHROME_PATH (${chrome}) does not exist: run "npx playwright install chromium" or set CHROME_PATH to a Chrome.`,
  );
}
