"use client";

import type { CaseData } from "@/case-data/case-data";
import type { HomeAnnuity } from "@/course/home-annuity";
import { HomeExplorable } from "./home-explorable";

/**
 * Home's Explorable (the owner's design E, 11 Nov 2026) on a white card (spec 2026-11-12 E1, F1: the hero is a Band and
 * its Explorable sits on a `band-card`, white in Light and the Theme's frame in Dark). Signed out, the card carries
 * "Sign in to learn why →" after the Explorable's state line.
 */
export function HomeWidget({ annuity, cases, signedOut = false }: { annuity: HomeAnnuity; cases: readonly CaseData[]; signedOut?: boolean }) {
  return (
    <div data-widget-content data-testid="home-widget" className="band-card rounded-xl border border-[var(--rule)] p-4 sm:p-5">
      <HomeExplorable annuity={annuity} cases={cases} signedOut={signedOut} />
    </div>
  );
}
