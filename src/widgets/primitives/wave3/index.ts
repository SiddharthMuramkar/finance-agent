// Wave 3 of the Widget parts: the story parts (spec 2026-11-05, tickets E2a and E2b). library.tsx registers WAVE3_PARTS in
// the Widget library, in its own group "Story". The order of each part's props is its positional argument order, fixed
// forever, and new parts are only ever appended to the end of WAVE3_PARTS (E2b added the last four).

import { ChoiceCards } from "./choice-cards";
import { Headline } from "./headline";
import { LingoCard } from "./lingo-card";
import { MoneyJar } from "./money-jar";
import { MythOrFact } from "./myth-or-fact";
import { StoryScene } from "./story-scene";
import { TimelineStrip } from "./timeline-strip";
import { TwoPaths } from "./two-paths";
import { WhoPaysWhom } from "./who-pays-whom";

export const WAVE3_PARTS = [StoryScene, LingoCard, TimelineStrip, TwoPaths, MoneyJar, WhoPaysWhom, MythOrFact, Headline, ChoiceCards];

export { ChoiceCards } from "./choice-cards";
export { Headline } from "./headline";
export { LingoCard } from "./lingo-card";
export { jarStep, MoneyJar } from "./money-jar";
export { MythOrFact } from "./myth-or-fact";
export { StoryScene } from "./story-scene";
export { TimelineStrip } from "./timeline-strip";
export { pathProblem, TwoPaths } from "./two-paths";
export { flowProblem, WhoPaysWhom } from "./who-pays-whom";
