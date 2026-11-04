"use client";

import { useEffect } from "react";
import type { CaseData } from "@/case-data/case-data";
import { CaseDataProvider } from "@/widgets/case-data-provider";
import { applyTheme, isTheme } from "../../theme";
import { WidgetView } from "../../widget-view";
import { Eyebrow } from "../../ui";
import type { HarnessWidth } from "./widths";


/**
 * One Widget program in a frame that has the Study aside's and the Widget card's classes and test ids, at one of the
 * panel widths the Study page gives it, so a layout bug reproduces here exactly. Developer tool: it is only reachable
 * outside production (page.tsx). `values` are slider values to start from, in place of the ones the code declares.
 */
export function WidgetHarness({
  code,
  title,
  width,
  theme,
  values,
  cases,
}: {
  code: string;
  title: string;
  width: HarnessWidth;
  theme: "light" | "dark";
  values?: Record<string, number>;
  cases: readonly CaseData[];
}) {
  // The tokens switch on the page's root, so this page's own light or dark replaces what the head script set there.
  useEffect(() => {
    const before = document.documentElement.dataset.theme;
    applyTheme(theme === "dark" ? "midnight" : "light");
    return () => {
      applyTheme(isTheme(before) ? before : "light");
    };
  }, [theme]);

  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--ink)]" data-testid="harness" data-width={width} data-theme={theme}>
      <aside
        aria-label="Widget panel"
        data-testid="widget-pane"
        className="relative min-h-0 min-w-0 overflow-y-auto"
        style={{ width, maxHeight: "calc(100dvh - 32px)" }}
      >
        <section data-testid="widget-card" className="rounded-lg border border-[var(--border)] p-4">
          <div>
            <Eyebrow className="mb-1">{title}</Eyebrow>
            <CaseDataProvider cases={cases}>
              <WidgetView code={code} complete bare initialValues={values} />
            </CaseDataProvider>
          </div>
        </section>
      </aside>
    </main>
  );
}
