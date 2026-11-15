import { cache } from "react";
import { currentSignIn, type SignIn } from "@/auth/session";
import { loadHomeButton, type HomeButton } from "./home-button";

// Who is looking at a public page (Signal spec §7.1 viewer states), read once a request: the site layout's nav and
// each page's CTAs share it through React's cache. Production has two of the prototype's three states (issue #33):
// - visitor: signed out. Someone who asked to join waits on Clerk's Waitlist, which gives them no session until the owner
//   lets them in, so the prototype's applicant (its "Request in review" pill and pending page) has no production state;
// - member: a Learner who may enter (an account or the passcode door), with their Continue button.
// A visitor costs no Learner read.

export type Viewer = { state: "visitor" } | { state: "member"; button: HomeButton; name: string };

/** The viewer state for one sign-in. Only a member reads the Learner's progress, for the Continue button. */
export async function viewerFor(signIn: SignIn, loadButton: (learnerId: number) => Promise<HomeButton> = loadHomeButton): Promise<Viewer> {
  if (signIn.kind === "learner") {
    return { state: "member", button: await loadButton(signIn.learner.id), name: signIn.learner.name };
  }
  return { state: "visitor" };
}

/** This request's viewer, read once however many parts of the page ask. */
export const siteViewer = cache(async (): Promise<Viewer> => viewerFor(await currentSignIn()));
