"use client";

import type { CaseData } from "@/case-data/case-data";
import { CaseDataProvider } from "@/widgets/case-data-provider";
import { WidgetWithSave } from "../widget-panel";

/**
 * One plain white frame around a live Widget. Bare, so the Widget draws no second border. There is no store, so
 * nothing is saved and there is no Tell the Tutor. Home, the Showcases and About all use this.
 */
export function LiveWidget({ code, cases = [], testId = "live-widget" }: { code: string; cases?: readonly CaseData[]; testId?: string }) {
  return (
    <div data-widget-content data-testid={testId} className="rounded-xl border border-[var(--rule)] bg-[var(--frame)] p-4 sm:p-5">
      <CaseDataProvider cases={cases}>
        <WidgetWithSave item={{ code, complete: true }} bare />
      </CaseDataProvider>
    </div>
  );
}
