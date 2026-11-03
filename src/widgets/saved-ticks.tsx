"use client";

import { createContext } from "react";

/**
 * The ticked Guided Tasks of the Widget being drawn, as saved with its Session (Widget state), and how to save
 * more: `onTicked` hears the texts of every task done so far in one GuidedTasks. Outside a provider (Notes, Older
 * sessions, Home) ticks live in the page only, as before.
 */
export type SavedTicks = { ticked: readonly string[]; onTicked: (done: string[]) => void };

export const SavedTicksContext = createContext<SavedTicks | null>(null);
