import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Files that may still hold a raw <button>. It can only shrink (src/app/primitives/lint.test.ts pins it):
 * the 9 Widget files migrate in E2a/E5; the src/app side was emptied by the A3b sweep.
 */
export const RAW_BUTTON_ALLOWLIST = [
  "src/widgets/library.tsx",
  "src/widgets/history-plot.tsx",
  "src/widgets/primitives/wave1/predict.tsx",
  "src/widgets/primitives/wave1/waffle.tsx",
  "src/widgets/primitives/wave1/quick-check.tsx",
  "src/widgets/primitives/wave2/step-through.tsx",
  "src/widgets/primitives/wave2/draw-the-line.tsx",
  "src/widgets/primitives/wave2/rank.tsx",
  "src/widgets/primitives/wave2/rate-move.tsx",
];

const RAW_BUTTON_MESSAGE = "Use Button, IconButton or Chip from src/app/primitives";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/primitives/**", "**/*.test.{ts,tsx}", ...RAW_BUTTON_ALLOWLIST],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: 'JSXOpeningElement[name.name="button"]', message: RAW_BUTTON_MESSAGE },
        { selector: 'JSXAttribute[name.name="role"][value.value="button"]', message: RAW_BUTTON_MESSAGE },
      ],
    },
  },
  globalIgnores([".next/**", ".next-e2e/**", "playwright-report/**", "test-results/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**", ".claude/worktrees/**"]),
]);
