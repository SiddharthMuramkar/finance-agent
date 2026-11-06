// Wave 3 of the Widget parts: the story parts (spec 2026-11-05, ticket E2a). library.tsx registers WAVE3_PARTS in the
// Widget library, in its own group "Story". The order of each part's props is its positional argument order, fixed
// forever, and new parts are only ever appended to the end of WAVE3_PARTS (E2b adds four).

import { LingoCard } from "./lingo-card";
import { MoneyJar } from "./money-jar";
import { StoryScene } from "./story-scene";
import { TimelineStrip } from "./timeline-strip";
import { TwoPaths } from "./two-paths";

export const WAVE3_PARTS = [StoryScene, LingoCard, TimelineStrip, TwoPaths, MoneyJar];

export { LingoCard } from "./lingo-card";
export { jarStep, MoneyJar } from "./money-jar";
export { StoryScene } from "./story-scene";
export { TimelineStrip } from "./timeline-strip";
export { pathProblem, TwoPaths } from "./two-paths";
