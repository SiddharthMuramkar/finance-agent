"use client";

import type { CaseData } from "@/case-data/case-data";
import { CaseDataProvider } from "@/widgets/case-data-provider";
import { WidgetWithSave } from "../widget-panel";

/**
 * Home's live annuity Widget: the same Widget component the Study Workspace draws, with its Sourced strip, signed out
 * and as it is before the Insight (no Insight-settled context, so no verdict or break-even). Its Case Data (`cases`)
 * was read on the server and fills the page's Case Data cache, so the browser never calls the signed-in route.
 */
export function HomeWidget({ code, cases }: { code: string; cases: readonly CaseData[] }) {
  return (
    <CaseDataProvider cases={cases}>
      <WidgetWithSave item={{ key: "home", number: 1, code, complete: true }} bare={false} />
    </CaseDataProvider>
  );
}
