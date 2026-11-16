"use client";

import { createContext } from "react";
import type { OwnCases } from "@/finance/valuation-lookup";

/**
 * The Learner's Own Cases, for a Workbench drawn on the page (spec #68): Value levers looks a Case id up in the course Cases
 * first, then here. Null everywhere nothing provides them (Home, the Widget harness), and then only course Cases are found.
 */
export const OwnCasesContext = createContext<OwnCases | null>(null);
