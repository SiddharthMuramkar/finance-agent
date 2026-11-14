// @vitest-environment happy-dom
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WidgetView } from "@/app/widget-view";
import type { CaseData } from "@/case-data/case-data";
import { widgetProblems } from "./check";
import { CaseDataProvider } from "./case-data-provider";
import { SYNTHETIC_CASES } from "./fixtures/synthetic-cases";

// The 11 Widget programs the Tutor wrote in the UX audit (3 Nov 2026), kept as they were. Saved Sessions and Notes
// store programs like these, so every later change to the Widget library must leave all of them drawing. Case Data
// never goes into git, so the cases are synthetic (fixtures/synthetic-cases.ts): the right shape, made-up numbers.

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const DIR = join(process.cwd(), "src/widgets/fixtures/audit");
const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".openui"))
  .sort();

/** Problems a fixture is known to have today. Each entry is a bug to remove, not a state to keep. */
const KNOWN_PROBLEMS: Record<string, string[]> = {};

const CASES: CaseData[] = SYNTHETIC_CASES;

let root: Root;
let host: HTMLElement;
beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("the audit fixtures", () => {
  it("are the eleven programs of the audit", () => {
    expect(files).toHaveLength(11);
  });

  for (const file of files) {
    const code = readFileSync(join(DIR, file), "utf8");

    it(`${file} passes the Widget check (or shows only its known problems)`, () => {
      expect(widgetProblems(code)).toEqual(KNOWN_PROBLEMS[file] ?? []);
    });

    it(`${file} draws through the real library and renderer`, async () => {
      await act(async () => {
        root.render(
          <CaseDataProvider cases={CASES}>
            <WidgetView code={code} complete />
          </CaseDataProvider>,
        );
      });
      // Let the Queries settle.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
      expect(host.textContent).not.toContain("could not be drawn");
      expect(host.textContent?.trim().length).toBeGreaterThan(20);
      expect(host.querySelectorAll("[data-key-figure]:not([data-key-figure-extra])").length).toBeLessThanOrEqual(1);
    });
  }
});
