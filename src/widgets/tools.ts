import type { CaseData } from "@/case-data/case-data";
import { EMPTY_RESULTS, type WidgetToolName, type WidgetToolResults } from "./tool-specs";

export type WidgetToolOptions = {
  /** Hears each tool error in plain words, so the widget can say why a chart stayed empty. */
  onError?: (tool: WidgetToolName, message: string) => void;
  /** Fetches one Case's data; defaults to the browser fetch of /api/case-data. Tests pass a fake. */
  fetchCaseData?: (caseId: string) => Promise<CaseData | null>;
};

/** The Widget tools as the OpenUI Renderer's toolProvider: one async function per tool, by name. */
export type WidgetToolProvider = { [K in WidgetToolName]: (args: Record<string, unknown>) => Promise<WidgetToolResults[K]> };

/**
 * The Widget tools for one widget. Placeholder until the tools are built: each answers with no
 * data and an error, and never throws.
 */
export function createWidgetTools(options: WidgetToolOptions = {}): WidgetToolProvider {
  const notBuilt = <K extends WidgetToolName>(name: K) => async (): Promise<WidgetToolResults[K]> => {
    options.onError?.(name, "Not built yet");
    return { ...EMPTY_RESULTS[name], error: "Not built yet" };
  };
  return {
    case_data: notBuilt("case_data"),
    calculate: notBuilt("calculate"),
    calculate_range: notBuilt("calculate_range"),
    annuity_schedule: notBuilt("annuity_schedule"),
  };
}
