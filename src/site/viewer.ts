import { cache } from "react";
import { currentSignIn, type SignIn } from "@/auth/session";
import { loadHomeButton, type HomeButton } from "./home-button";

// Who is looking at a public page (Signal spec §7.1 viewer states), read once a request: the site layout's nav and
// each page's CTAs share it through React's cache. Production maps the prototype's three states to sign-in states:
// - visitor: signed out, or an account the owner denied (they see the same Join door);
// - applicant: an account that waits for the owner (the join flow's pending page, #14, is not built yet, so its nav
//   pill links to /login, which shows their status);
// - member: a Learner who may enter, with their Continue button.
// A visitor costs no Learner read.

export type Viewer = { state: "visitor" } | { state: "applicant" } | { state: "member"; button: HomeButton; name: string };

/** The viewer state for one sign-in. Only a member reads the Learner's progress, for the Continue button. */
export async function viewerFor(signIn: SignIn, loadButton: (learnerId: number) => Promise<HomeButton> = loadHomeButton): Promise<Viewer> {
  if (signIn.kind === "learner") {
    return { state: "member", button: await loadButton(signIn.learner.id), name: signIn.user?.name || signIn.learner.name };
  }
  if (signIn.kind === "waiting") return { state: "applicant" };
  return { state: "visitor" };
}

/** This request's viewer, read once however many parts of the page ask. */
export const siteViewer = cache(async (): Promise<Viewer> => viewerFor(await currentSignIn()));
