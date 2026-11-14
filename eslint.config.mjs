import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Files that may still hold a raw <button>: none. The list is empty and src/app/primitives/lint.test.ts pins it at [];
 * the A3b sweep emptied the src/app side, and A5, A7b and A8 moved the last Widget files onto Button.
 */
export const RAW_BUTTON_ALLOWLIST = [];

const RAW_BUTTON_MESSAGE = "Use Button, IconButton or Chip from src/app/primitives";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/app/primitives/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: 'JSXOpeningElement[name.name="button"]', message: RAW_BUTTON_MESSAGE },
        { selector: 'JSXAttribute[name.name="role"][value.value="button"]', message: RAW_BUTTON_MESSAGE },
      ],
    },
  },
  globalIgnores([".next/**", ".next-e2e/**", "playwright-report/**", "test-results/**", "out/**", "build/**", "next-env.d.ts", "drizzle/**", ".claude/worktrees/**", "docs/archive/**"]),
]);
