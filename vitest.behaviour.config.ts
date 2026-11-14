import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Config for `npm run behaviour`: the live Tutor behaviour run, kept out of `npm run check`. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/behaviour/run.live.ts"], fileParallelism: false },
});
