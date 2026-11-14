"use client";

import { createContext } from "react";
import type { SavedStory } from "./value-levers-model";

/**
 * Where Value levers in all open mode saves the Learner's Valuation story (spec 2026-11-12, C4 Spine Topic 15, Appendix D):
 * the Topic flow provides a function that writes the one-page note to the Notebook. Null everywhere else (Home, Notes, Older
 * sessions, the Widget harness), and then the Widget shows no "Save my story" button.
 */
/** Resolves true once the note is stored, false when it is not; the Widget says which. */
export const SaveStoryContext = createContext<((story: SavedStory) => Promise<boolean> | void) | null>(null);
