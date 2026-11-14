import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Config for `npm run compare:models`: the live model comparison run, kept out of `npm run check`. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/comparison/run.live.ts", "src/comparison/run-rules.live.ts"], fileParallelism: false },
});
