import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Config for `npm run tutor:eval`: the live Tutor tests T1 to T11 (src/behaviour/tutor-eval), kept out of `npm run check`. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/behaviour/tutor-eval/run.live.ts"], fileParallelism: false },
});
