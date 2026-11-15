import Link from "next/link";
import { chrome, cta } from "@/site/copy";
import { continueLine } from "@/site/continue-line";
import type { HomeButton } from "@/site/home-button";
import type { Viewer } from "@/site/viewer";
import { Button } from "../primitives";
import { Glyph } from "./parts";

// The CTA by viewer state (spec 7.1): visitors Join early access (cta.visitor.href: /join, Clerk's Waitlist, #33),
// members Continue.

type Size = "md" | "lg";
const sized = (size: Size) => (size === "lg" ? " v-btn-lg" : "");

/**
 * The member's Continue button (5.1 `.continue`): "Continue" over the Topic it opens. Resume, Start and What comes next
 * post to /api/open, which opens that Topic and lands on /study; Open goes straight to /study.
 */
export function ContinueButton({ button, size = "md" }: { button: HomeButton; size?: Size }) {
  const face = (
    <>
      <Glyph size={18} />
      <span>
        <span className="main">{chrome.continue}</span>
        <span className="sub">{continueLine(button, chrome.studyWorkspace)}</span>
      </span>
    </>
  );
  const className = `v-btn v-btn-primary v-continue${sized(size)}`;
  if (button.kind === "open") {
    return (
      <Link href="/study" className={className} data-affordance="button">
        {face}
      </Link>
    );
  }
  return (
    <form action="/api/open" method="post" className="v-btn-form">
      <Button type="submit" unstyled className={className}>
        {face}
      </Button>
    </form>
  );
}

/** The primary CTA for this viewer. A visitor's is marked `data-join`, so SiteJoinEvents counts it by place. */
export function PrimaryCta({ viewer, size = "lg" }: { viewer: Viewer; size?: Size }) {
  if (viewer.state === "member") return <ContinueButton button={viewer.button} size={size} />;
  return (
    <Link href={cta.visitor.href} className={`v-btn v-btn-primary${sized(size)}`} data-affordance="button" data-join="">
      {cta.visitor.label}
    </Link>
  );
}

/** The note under the CTA (7.1): visitors only. */
export function CtaNote({ viewer, className = "v-fine" }: { viewer: Viewer; className?: string }) {
  if (viewer.state === "member") return null;
  return <p className={className}>{cta[viewer.state].note}</p>;
}
