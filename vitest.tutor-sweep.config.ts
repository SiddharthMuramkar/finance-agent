import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Config for `npm run tutor:sweep` and `npm run tutor:replay` (src/behaviour/tutor-eval/sweep*.live.ts), kept out of `npm run check`. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/behaviour/tutor-eval/sweep.live.ts", "src/behaviour/tutor-eval/sweep-replay.live.ts"], fileParallelism: false },
});
