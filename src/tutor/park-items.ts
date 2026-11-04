/**
 * The park offer's Session items (spec #229, "Parking"; ticket #245), with no server imports so the browser can match
 * on them. Each kind holds "park" in lower case, which the live suite looks for (src/behaviour/tutor-eval/).
 */

/** The offer after a third miss in a row: code's own line and two buttons, "Park it, review tomorrow" and "One more short try". */
export const PARK_OFFER = "park_offer";
export type ParkOfferData = { skillId: string; line: string };

/** Stored once the Learner parks the Skill: "Back tomorrow after Thu 3:00 pm", with a Course Map link. */
export const PARKED = "parked";
export type ParkedData = { skillId: string; line: string; until: string };

/** The divider before a parked Skill's drill of five: "Drill · <Skill rule>". */
export const PARK_DRILL = "park_drill";
export type ParkDrillData = { skillId: string; label: string };
