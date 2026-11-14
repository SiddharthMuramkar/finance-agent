// What a change on /admin did (ADR 0014). The admin routes answer 303 to /admin?done=<code>#<section>, and the page
// shows the code's words in that section. Codes only, from this fixed list: an email or a name never goes in an
// address, where history, logs and analytics would keep it. Pure data, shared by the routes and the page (and the
// client confirm, for DENY_CONFIRM), so it imports nothing.

/** What the Deny / Remove access confirm posts as `confirm`; the access route refuses a deny without it. */
export const DENY_CONFIRM = "deny";

/** The sections of /admin, by their element id. A change's message shows in the section the person ended up in. */
export type AdminSection = "waiting" | "people" | "denied" | "invite";

/** Every result an admin change can report. */
export type AdminDone = "approved" | "approved_no_learner" | "denied" | "owner_stays" | "gone" | "invited" | "already" | "bad_email" | "invited_denied";

/** Each result's section and words. `problem` results read as an alert (nothing, or not all, was done). */
export const ADMIN_DONE: Record<AdminDone, { section: AdminSection; text: string; problem?: true }> = {
  approved: { section: "people", text: "Approved. They can come in now." },
  approved_no_learner: {
    section: "waiting",
    text: "Approved, but their invite names a Learner another account already holds, so they still wait. Fix the invite with the invites CLI.",
    problem: true,
  },
  denied: { section: "denied", text: "Done. They are signed out and can't sign back in until you approve them again. Their progress is kept." },
  owner_stays: { section: "people", text: "Your own access can't be removed.", problem: true },
  gone: { section: "waiting", text: "That person's sign-in is no longer here. Nothing changed.", problem: true },
  invited: { section: "invite", text: "Invited. They can sign in with Google or an email link and come straight in. Nothing is sent to them, so tell them yourself." },
  already: { section: "invite", text: "That email is already invited. Nothing changed." },
  bad_email: { section: "invite", text: "That isn't an email address. Check it and try again.", problem: true },
  invited_denied: { section: "denied", text: "Invited, but you denied this person. Approve them here to let them in.", problem: true },
};

/** The `done` query value as a known result, or null for anything else (an old or hand-typed address shows nothing). */
export function adminDone(value: unknown): AdminDone | null {
  return typeof value === "string" && Object.hasOwn(ADMIN_DONE, value) ? (value as AdminDone) : null;
}

/** Where a change sends the owner back to: /admin with the result's code, at its section. */
export function doneAddress(done: AdminDone): string {
  return `/admin?done=${done}#${ADMIN_DONE[done].section}`;
}
