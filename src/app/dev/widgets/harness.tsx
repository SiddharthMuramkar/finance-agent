"use client";

import type { CaseData } from "@/case-data/case-data";
import { CaseDataProvider } from "@/widgets/case-data-provider";
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
  values,
  cases,
}: {
  code: string;
  title: string;
  width: HarnessWidth;
  values?: Record<string, number>;
  cases: readonly CaseData[];
}) {
  return (
    <main className="min-h-screen bg-[var(--bg)] p-4 text-[var(--ink)]" data-testid="harness" data-width={width}>
      <aside
        aria-label="Widget panel"
        data-testid="widget-pane"
        className="relative min-h-0 min-w-0 overflow-y-auto"
        style={{ width, maxHeight: "calc(100dvh - 32px)" }}
      >
        <section data-testid="widget-card" className="rounded-xl border border-[var(--rule)] bg-[var(--frame)] p-4">
          <div>
            <Eyebrow className="mb-2">{title}</Eyebrow>
            <CaseDataProvider cases={cases}>
              <WidgetView code={code} complete bare initialValues={values} />
            </CaseDataProvider>
          </div>
        </section>
      </aside>
    </main>
  );
}
