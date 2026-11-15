// What a change on /admin did. The admin routes answer 303 to /admin?done=<code>#<section>, and the page shows the
// code's words in that section. Codes only, from this fixed list: nothing a person typed ever goes in an address,
// where history, logs and analytics would keep it. Pure data, shared by the routes and the page, so it imports nothing.
// Since Clerk decides who may come in (issue #33), the only change made on /admin is the Spend caps.

/** The sections of /admin a change's result shows in, by their element id. */
export type AdminSection = "caps";

/** Every result an admin change can report. */
export type AdminDone = "caps_saved" | "bad_caps";

/** Each result's section and words. `problem` results read as an alert (nothing was saved). */
export const ADMIN_DONE: Record<AdminDone, { section: AdminSection; text: string; problem?: true }> = {
  caps_saved: { section: "caps", text: "Saved. The next turn uses the new caps." },
  bad_caps: { section: "caps", text: "Each cap must be a number from 0 up, dollars to the cent. Nothing changed.", problem: true },
};

/** The `done` query value as a known result, or null for anything else (an old or hand-typed address shows nothing). */
export function adminDone(value: unknown): AdminDone | null {
  return typeof value === "string" && Object.hasOwn(ADMIN_DONE, value) ? (value as AdminDone) : null;
}

/** Where a change sends the admin back to: /admin with the result's code, at its section. */
export function doneAddress(done: AdminDone): string {
  return `/admin?done=${done}#${ADMIN_DONE[done].section}`;
}
