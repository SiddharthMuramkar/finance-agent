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

/** Code's own park offer line. */
export const PARK_OFFER_LINE = "This one is not landing yet. Park it and it comes back tomorrow as a short drill, or have one more short try now.";

/** The park offer's two buttons. */
export const PARK_BUTTON = "Park it, review tomorrow";
export const ONE_MORE_BUTTON = "One more short try";

const BACK_AT = new Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });

/** "Back tomorrow after Thu 3:00 pm", for a Skill parked until `until`. */
export function parkedLine(until: Date): string {
  return `Back tomorrow after ${backAt(until)}`;
}

/** "Thu 3:00 pm", as the Course Map shows it. */
export function backAt(until: Date): string {
  const parts = Object.fromEntries(BACK_AT.formatToParts(until).map((p) => [p.type, p.value]));
  return `${parts.weekday} ${parts.hour}:${parts.minute} ${String(parts.dayPeriod).toLowerCase()}`;
}

/** The title a card's preset opens under in practice mode, so it never shares a Widget key with the show-mode card Widget. */
export function practiceTitle(cardTitle: string): string {
  return `${cardTitle} · practice`;
}
