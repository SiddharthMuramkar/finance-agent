import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globalSetup: ["src/test/global-setup.ts"],
    setupFiles: ["src/test/setup.ts"],
    // CI runs the suite in 4 shards (.github/workflows/ci.yml), each on GitHub's standard runner for a public repo:
    // 4 CPUs and 16 GB. 3 workers leave one CPU for Vitest itself; each worker holds several Postgres heaps.
    ...(process.env.CI ? { maxWorkers: 3 } : {}),
    // Whole-Topic walks on PGlite take about 5 s under load, so the 5 s default timed them out.
    testTimeout: 30_000,
  },
});
