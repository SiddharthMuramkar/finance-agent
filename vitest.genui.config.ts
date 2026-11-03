import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/** Config for `npm run widgets:live`: the live probe of the Tutor's generative widgets, kept out of `npm run check`. */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { environment: "node", include: ["src/widgets/genui.live.ts"], fileParallelism: false },
});
