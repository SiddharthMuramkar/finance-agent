"use client";

import { createContext } from "react";

/**
 * Whether the shown Topic's Insight is settled (found by the Learner or told them), as the Study Workspace reads it
 * from saved progress. Until then a Widget holds back what would give the Insight away: the annuity chart's verdict
 * and break-even (spec #119, "Widgets › Present value"). False everywhere else (Home, Notes, Older sessions), so a
 * Widget there draws as it does before the Insight.
 */
export const InsightSettledContext = createContext(false);
